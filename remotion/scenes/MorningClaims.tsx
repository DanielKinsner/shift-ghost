import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Grime, Stamp, Tape, ThermalCard, clamp, useLayout, useSceneFade } from "../parts";
import type { ExplainerProps } from "../schema";

export const CLAIM_AT = [78, 118, 158];
export const PRINT_AT = 10;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.floor(min % 60)).padStart(2, "0")}`;

/** Scene 4 · The opening manager claims three tasks before the doors open. */
export const MorningClaims: React.FC<{ duration: number; tasks: ExplainerProps["tasks"]; opener: string }> = ({ duration, tasks, opener }) => {
  const frame = useCurrentFrame();
  const { width, height, vertical, u } = useLayout();
  const fade = useSceneFade(duration);
  const pad = (vertical ? 70 : 110) * u;
  const first = opener.split(" ")[0];

  // The clock follows the claims: 06:15 → last claim time.
  const claimMins = tasks.map((t) => toMin(t.claimedAt));
  const clock = interpolate(frame, [0, ...CLAIM_AT, duration], [toMin("06:15"), ...claimMins, claimMins[2] + 2], clamp);
  const railFrom = toMin("06:00");
  const railTo = toMin("10:30");
  const railW = width - pad * 2;
  const railPos = (m: number) => ((m - railFrom) / (railTo - railFrom)) * railW;
  const claimed = CLAIM_AT.filter((a) => frame >= a).length;

  const cardW = vertical ? width - pad * 2 : (width - pad * 2 - 2 * 36 * u) / 3;
  const cardsTop = vertical ? height * 0.36 : height * 0.43;

  return (
    <AbsoluteFill style={{ backgroundColor: C.night, opacity: fade }}>
      <div style={{ position: "absolute", left: pad, right: pad, top: (vertical ? 80 : 56) * u, display: "flex", flexDirection: vertical ? "column" : "row", justifyContent: "space-between", alignItems: vertical ? "flex-start" : "flex-end", gap: 20 * u }}>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 22 * u, color: C.muted }}>Wed, Oct 21 · opening brief · {opener}</div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: (vertical ? 66 : 60) * u, color: C.paper, lineHeight: 1, marginTop: 10 * u, maxWidth: (vertical ? 940 : 1150) * u }}>
            {first} claims three tasks before the doors open.
          </div>
        </div>
        <div style={{ fontFamily: F.mono, fontWeight: 500, fontSize: (vertical ? 92 : 104) * u, color: C.orange, lineHeight: 1, letterSpacing: -2 * u }}>{fmt(clock)}</div>
      </div>

      {/* opening rail 06:00 → doors 10:30 */}
      <div style={{ position: "absolute", left: pad, width: railW, top: vertical ? height * 0.27 : height * 0.31 }}>
        <div style={{ height: 4 * u, background: C.line }} />
        <div style={{ position: "absolute", left: 0, top: 0, height: 4 * u, width: railPos(clock), background: C.orange }} />
        {[6, 7, 8, 9, 10].map((h) => (
          <div key={h} style={{ position: "absolute", left: railPos(h * 60), top: -10 * u, translate: "-50% 0" }}>
            <div style={{ width: 2 * u, height: 24 * u, background: C.muted, margin: "0 auto" }} />
            <div style={{ fontFamily: F.mono, fontSize: 20 * u, color: C.muted, marginTop: 6 * u }}>{fmt(h * 60)}</div>
          </div>
        ))}
        <div style={{ position: "absolute", right: 0, top: -54 * u, textAlign: "right" }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 26 * u, color: C.orange, letterSpacing: 1.5 * u }}>DOORS</div>
        </div>
        <div style={{ position: "absolute", right: -2 * u, top: -20 * u, width: 6 * u, height: 44 * u, background: C.orange }} />
        <div style={{ position: "absolute", left: railPos(clock), top: -18 * u, translate: "-50% 0", width: 14 * u, height: 40 * u, background: C.paper, boxShadow: `0 0 ${14 * u}px ${C.orange}` }} />
      </div>

      {tasks.map((t, i) => {
        const printIn = interpolate(frame, [PRINT_AT + i * 10, PRINT_AT + i * 10 + 26], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
        const x = vertical ? pad : pad + i * (cardW + 36 * u);
        const y = vertical ? cardsTop + i * 360 * u : cardsTop;
        return (
          <div key={t.title} style={{ position: "absolute", left: x, top: y, width: cardW, clipPath: `inset(0 0 ${(1 - printIn) * 100}% 0)` }}>
            <ThermalCard width="100%" u={u} style={{ minHeight: (vertical ? 300 : 360) * u, position: "relative" }}>
              <div style={{ fontFamily: F.mono, fontSize: 20 * u, color: "#5b5a52" }}>DUE {t.due.toUpperCase()}</div>
              <div style={{ height: 2 * u, borderTop: `${2 * u}px dashed #9a978b`, margin: `${14 * u}px 0` }} />
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: (vertical ? 52 : 46) * u, lineHeight: 1.02 }}>{t.title}</div>
              <div style={{ fontFamily: F.body, fontSize: 22 * u, color: "#4a4943", marginTop: 14 * u }}>From {i === 0 ? "the customer answer" : i === 1 ? "the equipment answer" : "the stock answer"} in last night&apos;s closeout.</div>
              <div style={{ position: "absolute", right: 26 * u, bottom: 30 * u }}>
                <Stamp text={`Claimed · ${first}`} sub={t.claimedAt} at={CLAIM_AT[i]} u={u} rotate={-8 + i * 3} />
              </div>
            </ThermalCard>
          </div>
        );
      })}

      <div style={{ position: "absolute", left: pad, right: pad, bottom: (vertical ? 90 : 60) * u, display: "flex", alignItems: "center", gap: 24 * u }}>
        <Tape width={(vertical ? 160 : 220) * u} height={22 * u} sheen={interpolate(frame, [150, 210], [0, 1], clamp)} u={u} />
        <div style={{ fontFamily: F.mono, fontSize: 26 * u, color: claimed === 3 ? C.paper : C.muted }}>
          {claimed} of 3 claimed · {Math.floor((railTo - clock) / 60)}h {String(Math.floor((railTo - clock) % 60)).padStart(2, "0")}m before doors
        </div>
      </div>
      <Grime />
    </AbsoluteFill>
  );
};
