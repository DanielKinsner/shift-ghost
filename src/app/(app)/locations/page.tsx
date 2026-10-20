import type { Metadata } from "next";
import { Locations } from "@/components/ops/Locations";

export const metadata: Metadata = { title: "Stores" };

export default function LocationsPage() {
  return <Locations />;
}
