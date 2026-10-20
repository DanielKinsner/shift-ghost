import { Suspense } from "react";
import type { Metadata } from "next";
import { HandoffReview } from "@/components/review/HandoffReview";
import { PageSkeleton } from "@/components/ui/states";

// Content renders from on-device data after hydration, so navigations here are not instant by design.
export const instant = false;

export const metadata: Metadata = { title: "Closeout review" };

async function Review({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  return <HandoffReview handoffId={id} fresh={sp.fresh === "1"} />;
}

export default function HandoffPage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Review {...props} />
    </Suspense>
  );
}
