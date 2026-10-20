import type { Metadata } from "next";
import { Team } from "@/components/ops/Team";

// Content renders from on-device data after hydration, so navigations here are not instant by design.
export const instant = false;

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return <Team />;
}
