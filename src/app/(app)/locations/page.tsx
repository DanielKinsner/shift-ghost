import type { Metadata } from "next";
import { Locations } from "@/components/ops/Locations";

// Content renders from on-device data after hydration, so navigations here are not instant by design.
export const instant = false;

export const metadata: Metadata = { title: "Stores" };

export default function LocationsPage() {
  return <Locations />;
}
