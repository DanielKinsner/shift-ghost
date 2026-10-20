"use client";

import { useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { ShiftGhostExplainer, SCENES, defaultExplainerProps, EXPLAINER_DURATION, EXPLAINER_FPS } from "../../../remotion/ShiftGhostExplainer";
import { useStore } from "@/store/store";
import { markGuide } from "@/domain/commands";
import { Segmented } from "@/components/ui/form";
import { Mono, cx } from "@/components/ui/primitives";
import { fmtElapsed } from "@/domain/time";

/** The Remotion composition, played live in the browser with @remotion/player. */
export default function ExplainerPlayer() {
  const [ratio, setRatio] = useState<"wide" | "tall">("wide");
  const [frame, setFrame] = useState(0);
  const ref = useRef<PlayerRef>(null);
  const dispatch = useStore((s) => s.dispatch);
  const hydrated = useStore((s) => s.hydrated);

  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    const onPlay = () => {
      if (useStore.getState().db && !useStore.getState().db!.demo.guide.explainer) dispatch(markGuide, { step: "explainer" }, { silent: true, local: true });
    };
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener("play", onPlay);
    p.addEventListener("frameupdate", onFrame);
    return () => {
      p.removeEventListener("play", onPlay);
      p.removeEventListener("frameupdate", onFrame);
    };
  }, [ratio, dispatch, hydrated]);

  const wide = ratio === "wide";
  const scenes = SCENES as unknown as { from: number; duration?: number; durationInFrames?: number; title?: string; name?: string }[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Aspect ratio"
          value={ratio}
          onChange={setRatio}
          options={[
            { value: "wide", label: "16:9 · 1920×1080" },
            { value: "tall", label: "9:16 · 1080×1920" },
          ]}
        />
        <Mono className="text-sm text-steel-400">
          {fmtElapsed(frame / EXPLAINER_FPS)} / {fmtElapsed(EXPLAINER_DURATION / EXPLAINER_FPS)} · frame {frame}
        </Mono>
      </div>
      <div className={cx("overflow-hidden rounded-xl border border-night-500 bg-night-950 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]", !wide && "mx-auto w-full max-w-[380px]")}>
        <Player
          key={ratio}
          ref={ref}
          component={ShiftGhostExplainer}
          inputProps={defaultExplainerProps}
          durationInFrames={EXPLAINER_DURATION}
          fps={EXPLAINER_FPS}
          compositionWidth={wide ? 1920 : 1080}
          compositionHeight={wide ? 1080 : 1920}
          controls
          clickToPlay
          initialFrame={120}
          doubleClickToFullscreen
          style={{ width: "100%", aspectRatio: wide ? "16 / 9" : "9 / 16" }}
          acknowledgeRemotionLicense
        />
      </div>
      {scenes.length > 0 && (
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  ref.current?.seekTo(s.from + 5);
                  ref.current?.play();
                }}
                className={cx("flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors", frame >= s.from && frame < s.from + (s.duration ?? s.durationInFrames ?? 0) ? "border-safety/70 bg-night-800" : "border-night-600 hover:border-night-500")}
              >
                <Mono className="text-xs text-steel-500">{fmtElapsed(s.from / EXPLAINER_FPS)}</Mono>
                <span className="text-sm text-steel-100">{s.title ?? s.name ?? `Scene ${i + 1}`}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
