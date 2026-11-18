import { TopBar } from "@/components/TopBar";
import { Toaster } from "@/components/ui";

/** Private dashboard (behind the password): telemetry bar, views and toasts. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <main>{children}</main>
      <Toaster />
    </>
  );
}
