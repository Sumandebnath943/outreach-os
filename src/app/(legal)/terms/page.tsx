import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT, LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service · OutreachOS",
  description: "Terms for the OutreachOS personal outreach tool.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Terms of Service</h1>
      <p className="text-xs text-dim">Last updated: {LEGAL_UPDATED}</p>

      <h2>1. What OutreachOS is</h2>
      <p>
        OutreachOS is a private, self-hosted tool that Suman Debnath uses to manage his own job-search outreach: importing contacts,
        sending personalised emails from his own Gmail account, and tracking replies and engagement. It is not a public service and
        does not accept sign-ups.
      </p>

      <h2>2. Who may use it</h2>
      <p>
        Only the operator may sign in to the dashboard or connect a Google account. Any other access, including attempts to bypass its
        password protection, is not permitted.
      </p>

      <h2>3. Acceptable use</h2>
      <p>The operator uses OutreachOS only for individual, personalised professional outreach. In particular:</p>
      <ul>
        <li>emails are sent in small daily volumes, within Gmail&rsquo;s sending limits;</li>
        <li>follow-ups stop automatically when a recipient replies;</li>
        <li>anyone who asks not to be contacted again is removed and not emailed further;</li>
        <li>the tool is never used to send spam, bulk marketing or misleading messages.</li>
      </ul>

      <h2>4. Recipients</h2>
      <p>
        If you received an email sent with OutreachOS, you can stop further emails by replying, or by writing to{" "}
        <a href={`mailto:${LEGAL_CONTACT}`} className="underline">{LEGAL_CONTACT}</a>. How your data is handled is described in the{" "}
        <Link href="/privacy-policy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>

      <h2>5. Google services</h2>
      <p>
        Gmail access is used only as described in the Privacy Policy and in line with the Google API Services User Data Policy. Access
        can be revoked at any time from the connected Google account.
      </p>

      <h2>6. No warranty</h2>
      <p>
        The tool is provided as is, without warranties of any kind. To the extent the law allows, the operator is not liable for any
        indirect or consequential loss arising from its use.
      </p>

      <h2>7. Changes</h2>
      <p>These terms may be updated; the date at the top of this page shows the latest version.</p>

      <h2>8. Contact</h2>
      <p>
        <a href={`mailto:${LEGAL_CONTACT}`} className="underline">{LEGAL_CONTACT}</a>
      </p>
    </>
  );
}
