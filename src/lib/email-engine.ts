import { gmail as createGmailClient, auth as googleAuth } from '@googleapis/gmail';
import { Resend } from 'resend';
import { Lead, SystemSettings } from '@/types/outreach';

export interface DispatchEmailInput {
  lead: Lead;
  settings: SystemSettings;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  sameThread: boolean;
}

export interface DispatchEmailResult {
  success: boolean;
  provider: 'GMAIL' | 'RESEND' | 'GMAIL_SIMULATED';
  providerMessageId: string;
  rfcMessageId: string;
  gmailThreadId: string;
  updatedReferencesHeader: string;
  error?: string;
}

export interface ThreadPollResult {
  status: 'NO_REPLY' | 'REPLIED' | 'BOUNCED' | 'SKIPPED';
  snippet?: string;
  fromHeader?: string;
  repliedAt?: string;
  error?: string;
}

/**
 * Encodes a header value using RFC 2047 UTF-8 Base64 if it contains non-ASCII characters.
 */
function encodeRfc2047Header(text: string): string {
  if (/^[\x20-\x7E]*$/.test(text)) {
    return text;
  }
  const b64 = Buffer.from(text, 'utf-8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

/**
 * Constructs a compliant multipart/alternative RFC 2822 MIME message with
 * In-Reply-To and References headers for Gmail same-thread continuity.
 */
export function buildRfc2822MimeMessage(params: {
  senderName: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  inReplyTo?: string | null;
  references?: string | null;
  customMessageId?: string;
}): { rawMime: string; base64Url: string } {
  const boundary = `outreachos_boundary_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const headers: string[] = [
    `From: "${encodeRfc2047Header(params.senderName)}" <${params.senderEmail}>`,
    `To: "${encodeRfc2047Header(params.recipientName)}" <${params.recipientEmail}>`,
    `Subject: ${encodeRfc2047Header(params.subject)}`,
    `MIME-Version: 1.0`,
  ];

  if (params.customMessageId) {
    headers.push(`Message-ID: ${params.customMessageId}`);
  }

  if (params.inReplyTo) {
    headers.push(`In-Reply-To: ${params.inReplyTo}`);
    const refChain = params.references ? `${params.references}` : params.inReplyTo;
    headers.push(`References: ${refChain}`);
  }

  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const textBase64 = Buffer.from(params.bodyText, 'utf-8').toString('base64');
  const htmlBase64 = Buffer.from(params.bodyHtml, 'utf-8').toString('base64');

  const mimeParts = [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    textBase64,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    htmlBase64,
    '',
    `--${boundary}--`,
    '',
  ];

  const rawMime = mimeParts.join('\r\n');
  const base64Url = Buffer.from(rawMime, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { rawMime, base64Url };
}

/**
 * Checks if real Gmail OAuth2 credentials or Resend API keys are present.
 */
export function hasLiveEmailCredentials(settings: SystemSettings): boolean {
  if (settings.send_provider === 'RESEND') {
    return Boolean(process.env.RESEND_API_KEY);
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = settings.gmail_refresh_token || process.env.GMAIL_REFRESH_TOKEN;
  return Boolean(clientId && clientSecret && refreshToken);
}

function getGmailApiClient(settings: SystemSettings) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = settings.gmail_refresh_token || process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new googleAuth.OAuth2(
    clientId,
    clientSecret,
    process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return createGmailClient({ version: 'v1', auth: oauth2Client });
}

/**
 * Dispatches an email via Gmail API (OAuth2 RFC 2822) or Resend API,
 * preserving thread continuity via In-Reply-To, References, and threadId.
 */
export async function dispatchOutreachEmail(input: DispatchEmailInput): Promise<DispatchEmailResult> {
  const { lead, settings, subject, bodyText, bodyHtml, sameThread } = input;
  const recipientName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || 'Team';

  const inReplyTo = sameThread && lead.last_message_id_header ? lead.last_message_id_header : null;
  const priorReferences = sameThread && lead.references_header ? lead.references_header : inReplyTo;

  // 1. RESEND ENGINE
  if (settings.send_provider === 'RESEND' && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const generatedRfcId = `<outreachos.${lead.id}.t${lead.current_touch + 1}.${Date.now()}@houseofnamus.com>`;
      const customHeaders: Record<string, string> = {
        'Message-ID': generatedRfcId,
      };
      if (inReplyTo) {
        customHeaders['In-Reply-To'] = inReplyTo;
        customHeaders['References'] = priorReferences || inReplyTo;
      }

      const response = await resend.emails.send({
        from: `${settings.sender_name} <${settings.sender_email}>`,
        to: [lead.email],
        subject,
        html: bodyHtml,
        text: bodyText,
        headers: customHeaders,
      });

      if (response.error) {
        return {
          success: false,
          provider: 'RESEND',
          providerMessageId: '',
          rfcMessageId: '',
          gmailThreadId: lead.gmail_thread_id || '',
          updatedReferencesHeader: priorReferences || '',
          error: response.error.message,
        };
      }

      const providerMessageId = response.data?.id || `resend_${Date.now()}`;
      const updatedRefs = priorReferences ? `${priorReferences} ${generatedRfcId}`.trim() : generatedRfcId;

      return {
        success: true,
        provider: 'RESEND',
        providerMessageId,
        rfcMessageId: generatedRfcId,
        gmailThreadId: lead.gmail_thread_id || providerMessageId,
        updatedReferencesHeader: updatedRefs,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown Resend error';
      return {
        success: false,
        provider: 'RESEND',
        providerMessageId: '',
        rfcMessageId: '',
        gmailThreadId: lead.gmail_thread_id || '',
        updatedReferencesHeader: priorReferences || '',
        error: message,
      };
    }
  }

  // 2. GMAIL API OAUTH2 ENGINE
  const gmailClient = getGmailApiClient(settings);
  if (gmailClient) {
    try {
      const { base64Url } = buildRfc2822MimeMessage({
        senderName: settings.sender_name,
        senderEmail: settings.sender_email,
        recipientName,
        recipientEmail: lead.email,
        subject,
        bodyText,
        bodyHtml,
        inReplyTo,
        references: priorReferences,
      });

      const sendRes = await gmailClient.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: base64Url,
          threadId: sameThread && lead.gmail_thread_id ? lead.gmail_thread_id : undefined,
        },
      });

      const sentId = sendRes.data.id || '';
      const threadId = sendRes.data.threadId || lead.gmail_thread_id || sentId;

      // Fetch exact RFC 2822 Message-ID header assigned by Gmail
      let rfcMessageId = `<${sentId}@mail.gmail.com>`;
      if (sentId) {
        try {
          const metaRes = await gmailClient.users.messages.get({
            userId: 'me',
            id: sentId,
            format: 'metadata',
            metadataHeaders: ['Message-ID', 'Message-Id'],
          });
          const headers = metaRes.data.payload?.headers || [];
          const msgIdHeader = headers.find(
            (h) => h.name?.toLowerCase() === 'message-id' && h.value
          );
          if (msgIdHeader?.value) {
            rfcMessageId = msgIdHeader.value.trim();
          }
        } catch {
          // Keep fallback <sentId@mail.gmail.com>
        }
      }

      const updatedRefs = priorReferences
        ? `${priorReferences} ${rfcMessageId}`.trim()
        : rfcMessageId;

      return {
        success: true,
        provider: 'GMAIL',
        providerMessageId: sentId,
        rfcMessageId,
        gmailThreadId: threadId,
        updatedReferencesHeader: updatedRefs,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown Gmail API error';
      return {
        success: false,
        provider: 'GMAIL',
        providerMessageId: '',
        rfcMessageId: '',
        gmailThreadId: lead.gmail_thread_id || '',
        updatedReferencesHeader: priorReferences || '',
        error: message,
      };
    }
  }

  // 3. LOCAL SANDBOX SIMULATION FALLBACK (when OAuth/Resend env vars are not yet populated)
  const simId = Math.random().toString(16).slice(2, 14);
  const rfcMessageId = `<CA+OutreachOS_${lead.id.slice(0, 8)}_t${lead.current_touch + 1}_${simId}@mail.gmail.com>`;
  const gmailThreadId =
    sameThread && lead.gmail_thread_id ? lead.gmail_thread_id : `192d4a98${simId}`;
  const updatedRefs = priorReferences
    ? `${priorReferences} ${rfcMessageId}`.trim()
    : rfcMessageId;

  return {
    success: true,
    provider: 'GMAIL_SIMULATED',
    providerMessageId: `sim_${simId}`,
    rfcMessageId,
    gmailThreadId,
    updatedReferencesHeader: updatedRefs,
  };
}

/**
 * Polls the Gmail API for a lead's `gmail_thread_id` to detect any inbound reply
 * or hard bounce BEFORE sending any follow-up touch.
 */
export async function pollGmailThreadForReply(
  lead: Lead,
  settings: SystemSettings
): Promise<ThreadPollResult> {
  if (!lead.gmail_thread_id) {
    return { status: 'SKIPPED' };
  }

  const gmailClient = getGmailApiClient(settings);
  if (!gmailClient) {
    return { status: 'SKIPPED' };
  }

  try {
    const threadRes = await gmailClient.users.threads.get({
      userId: 'me',
      id: lead.gmail_thread_id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });

    const messages = threadRes.data.messages || [];
    const senderEmailLower = (settings.sender_email || 'sumandebnath944@gmail.com').toLowerCase();

    for (const msg of messages) {
      const headers = msg.payload?.headers || [];
      const fromHeader = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || '';
      const subjectHeader = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || '';
      const dateHeader = headers.find((h) => h.name?.toLowerCase() === 'date')?.value || '';

      const fromLower = fromHeader.toLowerCase();
      if (!fromLower || fromLower.includes(senderEmailLower)) {
        continue;
      }

      // Check for hard bounce / delivery failure
      if (
        fromLower.includes('mailer-daemon') ||
        fromLower.includes('postmaster') ||
        subjectHeader.toLowerCase().includes('delivery status notification') ||
        subjectHeader.toLowerCase().includes('undeliverable')
      ) {
        return {
          status: 'BOUNCED',
          snippet: msg.snippet || 'Delivery failed / address bounced.',
          fromHeader,
          repliedAt: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
        };
      }

      // Inbound human reply from recipient or colleague in the thread
      return {
        status: 'REPLIED',
        snippet: msg.snippet || 'Inbound reply received in thread.',
        fromHeader,
        repliedAt: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
      };
    }

    return { status: 'NO_REPLY' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to poll Gmail thread';
    return { status: 'SKIPPED', error: message };
  }
}
