import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { GhostMark, Grime, Tape, clamp, useLayout, useSceneFade } from "../parts";

export const EYES_ON = 22;

/** Scene 6 · End card. */
export const EndCard: React.FC<{ duration: number; tagline: string; company: string }> = ({ duration, tagline, company }) => {
  const frame = useCurrentFrame();
  const { fps, vertical, u } = useLayout();
  const fade = useSceneFade(duration, 14, 1);
  const rise = spring({ frame, fps, config: { damping: 200 } });
  const eyes = interpolate(frame, [EYES_ON, EYES_ON + 3, EYES_ON + 6, EYES_ON + 9], [0, 1, 0.35, 1], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: C.night, opacity: fade, justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 * u, translate: `0 ${(1 - rise) * 40 * u}px`, opacity: rise }}>
        <GhostMark size={(vertical ? 220 : 190) * u} eyes={eyes} wave={0.4} id="g6" />
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: (vertical ? 132 : 140) * u, color: C.paper, letterSpacing: -1 * u, lineHeight: 0.9 }}>Shift Ghost</div>
        <div
          style={{
            fontFamily: F.display,
            fontWeight: 600,
            fontSize: (vertical ? 58 : 56) * u,
            color: C.orange,
            textAlign: "center",
            maxWidth: (vertical ? 900 : 1400) * u,
            lineHeight: 1.08,
            opacity: interpolate(frame, [30, 46], [0, 1], clamp),
            translate: `0 ${interpolate(frame, [30, 46], [16, 0], clamp)}px`,
          }}
        >
          {tagline}
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 22 * u, color: C.muted, opacity: interpolate(frame, [50, 64], [0, 1], clamp) }}>{company} · demo workspace</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: (vertical ? 110 : 70) * u }}>
        <Tape width="100%" height={26 * u} sheen={interpolate(frame, [40, 120], [0, 1], clamp)} u={u} />
      </div>
      <Grime />
    </AbsoluteFill>
  );
};
