import type { Metadata } from "next";
import { RuleBuilder } from "@/components/rules/RuleBuilder";

// Content renders from on-device data after hydration, so navigations here are not instant by design.
export const instant = false;

export const metadata: Metadata = { title: "Rules" };

export default function RulesPage() {
  return <RuleBuilder />;
}
