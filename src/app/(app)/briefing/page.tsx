import type { Metadata } from "next";
import { Briefing } from "@/components/briefing/Briefing";

export const metadata: Metadata = { title: "Opening brief" };

export default function BriefingPage() {
  return <Briefing />;
}
