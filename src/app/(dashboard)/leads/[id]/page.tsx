"use client";
import { useParams, useRouter } from "next/navigation";
import { LeadDrawer } from "@/components/pipeline/LeadDrawer";
export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <LeadDrawer key={id} leadId={id} embedded onClose={() => router.push("/leads")} />;
}
