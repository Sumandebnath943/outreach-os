import type { Metadata } from "next";
import { LEGAL_CONTACT, LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · OutreachOS",
  description: "How OutreachOS handles Google user data and contact data.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Privacy Policy</h1>
      <p className="text-xs text-dim">Last updated: {LEGAL_UPDATED}</p>

      <p>
        OutreachOS is a private, self-hosted tool operated by Suman Debnath (&ldquo;I&rdquo;, &ldquo;me&rdquo;) to manage my own job-search
        outreach. It is not offered to the public and has no sign-up: the only person who can sign in, or connect a Google account, is
        me. This policy explains what data the tool handles and why.
      </p>

      <h2>1. Google user data</h2>
      <p>When I connect my own Gmail account, OutreachOS requests two permissions:</p>
      <ul>
        <li>
          <strong>Send email</strong> (<code>gmail.send</code>): to send my outreach emails, and their follow-ups in the same thread,
          from my account.
        </li>
        <li>
          <strong>Read email</strong> (<code>gmail.readonly</code>): to check whether a recipient replied to, or an email bounced from,
          an outreach thread, so that automated follow-ups stop immediately.
        </li>
      </ul>
      <p>
        Reading is limited to the threads OutreachOS started and to searches for messages from the people I contacted. For a detected
        reply it stores the sender, the date and a short preview (Gmail&rsquo;s snippet, at most 1,000 characters). It does not store
        full message bodies, attachments or any other mail.
      </p>
      <p>
        The OAuth refresh token is stored in the tool&rsquo;s private database and is used only by the tool&rsquo;s server. Access can be
        revoked at any time from{" "}
        <a href="https://myaccount.google.com/permissions" className="underline">
          myaccount.google.com/permissions
        </a>{" "}
        or with the Disconnect button in the tool&rsquo;s settings.
      </p>
      <p className="rounded-md border border-line bg-card p-4 text-fg">
        OutreachOS&rsquo;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>
      <p>
        <strong>AI triage of replies.</strong> When a reply arrives, its text (with quoted earlier messages removed) may be sent to an AI
        inference provider, Groq, solely to classify it, summarise it, read an out-of-office return date and suggest a draft answer for
        me to review. Nothing is sent automatically on the basis of that analysis, the text is not used to train any model, and only the
        resulting label and summary are stored.
      </p>
      <p>
        Google user data is used only to provide the features above. It is not sold, not used for advertising, not shared with third
        parties except the processors named on this page acting on my behalf, and not used to train AI or machine-learning models. No
        person other than me reads it.
      </p>

      <h2>2. Data about people I contact</h2>
      <p>
        For each recruiter or hiring manager I contact, the tool stores business contact details I provide (name, work email, company,
        job title, public profile links and notes), the emails I sent, and engagement signals: whether an email was opened (via a
        tracking pixel), which links were clicked, and which pages of my portfolio site were viewed after following those links, with
        approximate time on page. Links to my portfolio carry a reference ID and campaign parameters (company, name and outreach
        stage) so my own site can attribute the visit. This is used only to manage my own follow-ups.
      </p>
      <p>
        If you received an email from me and want your data removed, or don&rsquo;t want to hear from me again, reply to the email or write
        to <a href={`mailto:${LEGAL_CONTACT}`} className="underline">{LEGAL_CONTACT}</a>. I will delete your record and stop all
        further emails.
      </p>

      <h2>3. Where data is kept</h2>
      <p>
        Data is stored in a private Supabase (PostgreSQL) database and processed by the application hosted on Vercel. Email is sent
        through Gmail, or optionally Resend; reply text may be analysed by Groq; alerts are delivered to me through Telegram. These
        providers process data on my behalf under their own terms. Access to the dashboard is password-protected.
      </p>

      <h2>4. Retention</h2>
      <p>
        Records are kept while they are useful for my job search and deleted on request. Moving a lead to Trash stops its sequence immediately; trashed records are retained for up to 30 days unless permanently deleted sooner. A minimal blocked-address record (email and reason) is kept for hard bounces and unsubscribe requests to prevent accidental re-contact. Disconnecting Gmail deletes the stored token
        immediately.
      </p>

      <h2>5. Changes</h2>
      <p>If this policy changes, the date at the top of this page is updated.</p>

      <h2>6. Contact</h2>
      <p>
        <a href={`mailto:${LEGAL_CONTACT}`} className="underline">{LEGAL_CONTACT}</a>
      </p>
    </>
  );
}
