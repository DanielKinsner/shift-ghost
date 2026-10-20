import { Suspense } from "react";
import type { Metadata } from "next";
import { Audit } from "@/components/ops/Audit";
import { PageSkeleton } from "@/components/ui/states";

export const metadata: Metadata = { title: "Audit trail" };

export default function AuditPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <Audit />
    </Suspense>
  );
}
