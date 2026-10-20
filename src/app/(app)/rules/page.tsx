import type { Metadata } from "next";
import { RuleBuilder } from "@/components/rules/RuleBuilder";

export const metadata: Metadata = { title: "Rules" };

export default function RulesPage() {
  return <RuleBuilder />;
}
