import { Suspense } from "react";
import type { Metadata } from "next";
import { Audit } from "@/components/ops/Audit";
import { PageSkeleton } from "@/components/ui/states";

// Content renders from on-device data after hydration, so navigations here are not instant by design.
export const instant = false;

export const metadata: Metadata = { title: "Audit trail" };

export default function AuditPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <Audit />
    </Suspense>
  );
}
