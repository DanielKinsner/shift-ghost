import { Suspense } from "react";
import type { Metadata } from "next";
import { IssueDetail } from "@/components/issues/IssueDetail";
import { PageSkeleton } from "@/components/ui/states";

export const metadata: Metadata = { title: "Issue" };

async function Issue({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IssueDetail issueId={id} />;
}

export default function IssuePage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Issue {...props} />
    </Suspense>
  );
}
