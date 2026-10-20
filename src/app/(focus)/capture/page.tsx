import type { Metadata } from "next";
import { Hydrated } from "@/components/shell/Providers";
import { Capture } from "@/components/capture/Capture";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Closeout" };

export default function CapturePage() {
  return (
    <Hydrated
      fallback={
        <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-20" aria-busy="true">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="mt-10 h-16 w-full" />
        </div>
      }
    >
      <Capture />
    </Hydrated>
  );
}
