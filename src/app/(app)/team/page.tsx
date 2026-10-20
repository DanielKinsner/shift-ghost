import type { Metadata } from "next";
import { Team } from "@/components/ops/Team";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return <Team />;
}
