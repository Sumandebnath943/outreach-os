import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OutreachOS // Suman Debnath — Executive Job Search & Cold Outreach Funnel CRM',
  description:
    'Multi-stage B2B outbound hiring funnel CRM for Senior Brand Marketing Manager, AI PMM, and AI PM roles across India and the US.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#09090B] font-sans text-[#FAFAFA] antialiased">
        {children}
      </body>
    </html>
  );
}
