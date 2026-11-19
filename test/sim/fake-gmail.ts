/**
 * In-memory Gmail mailbox for simulations. It accepts the raw RFC 2822 messages the app
 * builds (decoding headers, threading and the text/html parts), answers the
 * threads.get / messages.get / messages.list calls the reply detector makes, and lets a
 * scenario inject inbound mail (replies, auto-replies, bounces) at any simulated time.
 */
type Header = { name: string; value: string };

export interface FakeMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  internalDate: string;
  snippet: string;
  headers: Header[];
  text: string;
  html: string;
}

const decodeWords = (v: string) =>
  v
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b: string) => Buffer.from(b, "base64").toString("utf8"));

function parseMime(raw: string): { headers: Header[]; text: string; html: string } {
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  const split = mime.indexOf("\r\n\r\n");
  const headerBlock = mime.slice(0, split).replace(/\r\n[ \t]+/g, " ");
  const headers = headerBlock.split("\r\n").map((line) => {
    const i = line.indexOf(":");
    return { name: line.slice(0, i), value: decodeWords(line.slice(i + 1).trim()) };
  });
  const part = (type: string) => {
    const m = mime.match(new RegExp(`Content-Type: ${type}[^\\r]*\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`));
    return m ? Buffer.from(m[1].replace(/\r\n/g, ""), "base64").toString("utf8") : "";
  };
  return { headers, text: part("text/plain"), html: part("text/html") };
}

const notFound = () => Object.assign(new Error("Requested entity was not found."), { code: 404 });

export class FakeGmail {
  messages: FakeMessage[] = [];
  /** When true every call fails like a revoked refresh token. */
  authRevoked = false;
  /** Errors thrown by the next sends, in order (e.g. a transient network error). */
  sendFailures: Error[] = [];
  /** Simulates a message accepted by Gmail followed by a lost HTTP response. */
  loseNextSendResponse = false;
  private n = 0;

  constructor(readonly me: string) {}

  header(m: FakeMessage, name: string): string {
    return m.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  }

  /** Messages the app sent to `to`, oldest first. */
  sentTo(to: string): FakeMessage[] {
    return this.messages.filter((m) => m.labelIds.includes("SENT") && this.header(m, "To").toLowerCase().includes(to.toLowerCase()));
  }

  /** Delivers an inbound message (a reply in `threadId`, or a fresh thread when omitted). */
  receive(opts: { from: string; snippet: string; threadId?: string | null; subject?: string }): FakeMessage {
    const id = `in${++this.n}`;
    const msg: FakeMessage = {
      id,
      threadId: opts.threadId ?? `thread-${id}`,
      labelIds: ["INBOX", "UNREAD"],
      internalDate: String(Date.now()),
      snippet: opts.snippet,
      headers: [
        { name: "From", value: opts.from },
        { name: "To", value: this.me },
        { name: "Subject", value: opts.subject ?? "Re: (reply)" },
        { name: "Message-ID", value: `<${id}@mail.example>` },
      ],
      text: opts.snippet,
      html: "",
    };
    this.messages.push(msg);
    return msg;
  }

  client() {
    return {
      users: {
        messages: {
          send: (p: { requestBody: { raw: string; threadId?: string } }) => this.send(p),
          get: (p: { id: string }) => this.get(p),
          list: (p: { q: string; maxResults?: number }) => this.list(p),
        },
        threads: { get: (p: { id: string }) => this.thread(p) },
        getProfile: async () => ({ data: { emailAddress: this.me } }),
      },
    };
  }

  private guard() {
    if (this.authRevoked)
      throw Object.assign(new Error("invalid_grant: Token has been expired or revoked."), { code: 400, response: { data: { error: "invalid_grant" } } });
  }

  private api(m: FakeMessage) {
    return {
      id: m.id,
      threadId: m.threadId,
      labelIds: m.labelIds,
      snippet: m.snippet.slice(0, 200), // Gmail snippets are short previews
      internalDate: m.internalDate,
      payload: {
        mimeType: "multipart/alternative",
        headers: m.headers,
        parts: [{ mimeType: "text/plain", body: { data: Buffer.from(m.text, "utf8").toString("base64url") } }],
      },
    };
  }

  private async send({ requestBody }: { requestBody: { raw: string; threadId?: string } }) {
    this.guard();
    const failure = this.sendFailures.shift();
    if (failure) throw failure;
    if (requestBody.threadId && !this.messages.some((m) => m.threadId === requestBody.threadId)) throw notFound();
    const { headers, text, html } = parseMime(requestBody.raw);
    const id = `out${++this.n}`;
    const msg: FakeMessage = {
      id,
      threadId: requestBody.threadId ?? `thread-${id}`,
      labelIds: ["SENT"],
      internalDate: String(Date.now()),
      snippet: text.replace(/\s+/g, " ").slice(0, 200),
      headers,
      text,
      html,
    };
    this.messages.push(msg);
    if (this.loseNextSendResponse) {
      this.loseNextSendResponse = false;
      throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    }
    return { data: { id, threadId: msg.threadId } };
  }

  private async get({ id }: { id: string }) {
    this.guard();
    const m = this.messages.find((x) => x.id === id);
    if (!m) throw notFound();
    return { data: this.api(m) };
  }

  /** Supports the two query shapes the app issues: `from:<addr> after:<s>` and the bounce search. */
  private async list({ q, maxResults = 100 }: { q: string; maxResults?: number }) {
    this.guard();
    const after = Number(q.match(/after:(\d+)/)?.[1] ?? 0) * 1000;
    const bounce = /from:\(mailer-daemon OR postmaster\)/.test(q);
    const from = bounce ? null : (q.match(/from:(\S+)/)?.[1] ?? "").toLowerCase();
    const phrase = q.match(/"([^"]+)"/)?.[1]?.toLowerCase();
    const hits = this.messages
      .filter((m) => Number(m.internalDate) >= after)
      .filter((m) => {
        const sender = this.header(m, "From").toLowerCase();
        if (bounce) return /mailer-daemon|postmaster/.test(sender) && (!phrase || `${m.snippet} ${m.text}`.toLowerCase().includes(phrase));
        return !!from && sender.includes(from);
      })
      .sort((a, b) => Number(b.internalDate) - Number(a.internalDate))
      .slice(0, maxResults);
    return { data: hits.length ? { messages: hits.map((m) => ({ id: m.id, threadId: m.threadId })) } : {} };
  }

  private async thread({ id }: { id: string }) {
    this.guard();
    const msgs = this.messages.filter((m) => m.threadId === id).sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
    if (!msgs.length) throw notFound();
    return { data: { id, messages: msgs.map((m) => this.api(m)) } };
  }
}
