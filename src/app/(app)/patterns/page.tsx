import type { Metadata } from "next";
import { Patterns } from "@/components/patterns/Patterns";

export const metadata: Metadata = { title: "Patterns" };

export default function PatternsPage() {
  return <Patterns />;
}
