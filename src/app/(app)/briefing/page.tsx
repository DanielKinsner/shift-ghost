import type { Metadata } from "next";
import { Briefing } from "@/components/briefing/Briefing";

// Content renders from on-device data after hydration, so navigations here are not instant by design.
export const instant = false;

export const metadata: Metadata = { title: "Opening brief" };

export default function BriefingPage() {
  return <Briefing />;
}
