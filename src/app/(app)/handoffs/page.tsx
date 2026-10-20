import type { Metadata } from "next";
import { Handoffs } from "@/components/ops/Handoffs";

// Content renders from on-device data after hydration, so navigations here are not instant by design.
export const instant = false;

export const metadata: Metadata = { title: "Handoffs" };

export default function HandoffsPage() {
  return <Handoffs />;
}
