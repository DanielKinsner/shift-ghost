import type { Metadata } from "next";
import { Hydrated } from "@/components/shell/Providers";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { PageSkeleton } from "@/components/ui/states";

export const metadata: Metadata = { title: "Setup" };

export default function SetupPage() {
  return (
    <Hydrated
      fallback={
        <div className="mx-auto max-w-6xl px-4 pt-24 sm:px-8">
          <PageSkeleton rows={2} />
        </div>
      }
    >
      <SetupWizard />
    </Hydrated>
  );
}
