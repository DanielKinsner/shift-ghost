import type { Metadata } from "next";
import { Patterns } from "@/components/patterns/Patterns";

// Content renders from on-device data after hydration, so navigations here are not instant by design.
export const instant = false;

export const metadata: Metadata = { title: "Patterns" };

export default function PatternsPage() {
  return <Patterns />;
}
