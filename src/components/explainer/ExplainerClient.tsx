"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/primitives";

// The composition loads Google Fonts on import, so it only runs in the browser.
const ExplainerPlayer = dynamic(() => import("./ExplainerPlayer"), {
  ssr: false,
  loading: () => <Skeleton className="aspect-video w-full" />,
});

export function ExplainerClient() {
  return <ExplainerPlayer />;
}
