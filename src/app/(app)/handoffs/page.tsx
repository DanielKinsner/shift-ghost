import type { Metadata } from "next";
import { Handoffs } from "@/components/ops/Handoffs";

export const metadata: Metadata = { title: "Handoffs" };

export default function HandoffsPage() {
  return <Handoffs />;
}
