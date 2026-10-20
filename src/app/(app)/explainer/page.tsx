import type { Metadata } from "next";
import { Download } from "lucide-react";
import { ExplainerClient } from "@/components/explainer/ExplainerClient";

// Content renders from on-device data after hydration, so navigations here are not instant by design.
export const instant = false;

export const metadata: Metadata = { title: "Explainer" };

export default function ExplainerPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-[2.4rem] font-bold leading-none tracking-wide sm:text-6xl">The 45-second version</h1>
          <p className="mt-3 text-steel-300">
            A Remotion composition, rendered live in your browser from the same props as the MP4. Every motion is driven by the frame number, so the player and the render always match.
          </p>
        </div>
        <a href="/video/shift-ghost-explainer.mp4" download className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-night-500 bg-night-700 px-4 text-[0.95rem] text-paper-100 hover:bg-night-600 lg:self-auto">
          <Download size={16} /> Download the 16:9 MP4
        </a>
      </div>
      <ExplainerClient />
      <div className="panel px-5 py-4 text-sm text-steel-300">
        <p className="mb-2 font-medium text-paper-100">Render it yourself</p>
        <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-steel-100">{`npm run remotion:studio
npm run remotion:render            # 1920×1080 → out/shift-ghost-explainer.mp4
npm run remotion:render:vertical   # 1080×1920 → out/shift-ghost-explainer-vertical.mp4`}</pre>
      </div>
    </div>
  );
}
