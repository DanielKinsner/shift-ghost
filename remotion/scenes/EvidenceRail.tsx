import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Grime, KindChip, Led, ThermalCard, clamp, useLayout, useSceneFade } from "../parts";
import type { ExplainerProps } from "../schema";

export const EVIDENCE_STEP = 50;
export const EVIDENCE_START = 14;
/** Local frame the item card snaps onto the rail. */
export const evidenceSnap = (i: number) => EVIDENCE_START + i * EVIDENCE_STEP + 30;

const RAIL_FROM = 18 * 60;
const RAIL_TO = 23 * 60;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const CONF_COLOR = { high: C.green, review: C.amber, uncertain: C.red } as const;
const KIND_COLOR: Record<string, string> = { Maintenance: C.red, Inventory: C.amber, Customer: C.orange, Security: C.green };

/** Scene 3 · Extracted items snap onto the shift's time rail, each with its evidence highlighted. */
export const EvidenceRail: React.FC<{ duration: number; items: ExplainerProps["items"] }> = ({ duration, items }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, vertical, u } = useLayout();
  const fade = useSceneFade(duration);

  const pad = (vertical ? 70 : 110) * u;
  const railY = vertical ? height * 0.355 : height * 0.46;
  const railX0 = pad;
  const railX1 = width - pad;
  const railX = (hhmm: string) => railX0 + ((toMin(hhmm) - RAIL_FROM) / (RAIL_TO - RAIL_FROM)) * (railX1 - railX0);

  const active = Math.min(items.length - 1, Math.max(0, Math.floor((frame - EVIDENCE_START) / EVIDENCE_STEP)));
  const localStart = EVIDENCE_START + active * EVIDENCE_STEP;
  const sweep = interpolate(frame, [localStart + 4, localStart + 24], [0, 1], clamp);
  const sentence = items[active].sentence;
  const ev = items[active].evidence;
  const evIdx = sentence.indexOf(ev);
  const sentenceSwap = interpolate(frame, [localStart - 2, localStart + 4], [0, 1], clamp);

  // Card slots: a row of four (landscape) or a 2 × 2 grid (vertical).
  const cardW = vertical ? (width - pad * 2 - 30 * u) / 2 : (width - pad * 2 - 3 * 30 * u) / 4;
  const cardTop = vertical ? height * 0.43 : height * 0.56;
  const slot = (i: number) =>
    vertical
      ? { x: pad + (i % 2) * (cardW + 30 * u), y: cardTop + Math.floor(i / 2) * 470 * u }
      : { x: pad + i * (cardW + 30 * u), y: cardTop };

  return (
    <AbsoluteFill style={{ backgroundColor: C.night, opacity: fade }}>
      <div style={{ position: "absolute", left: pad, right: pad, top: (vertical ? 80 : 56) * u }}>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: (vertical ? 64 : 60) * u, color: C.paper, lineHeight: 1 }}>
          Every item keeps its source sentence.
        </div>
        <ThermalCard width="100%" u={u} style={{ marginTop: 30 * u, opacity: sentenceSwap, translate: `0 ${(1 - sentenceSwap) * 10 * u}px` }}>
          <div style={{ fontFamily: F.mono, fontSize: 20 * u, color: "#5b5a52", marginBottom: 10 * u }}>
            TRANSCRIPT · {items[active].time === "22:40" ? "closeout 22:40" : `said about ${items[active].time}`}
          </div>
          <div style={{ fontFamily: F.body, fontSize: (vertical ? 38 : 40) * u, lineHeight: 1.35 }}>
            {evIdx >= 0 ? (
              <>
                {sentence.slice(0, evIdx)}
                <span
                  style={{
                    backgroundImage: `linear-gradient(${C.orange}66, ${C.orange}66)`,
                    backgroundRepeat: "no-repeat",
                    backgroundSize: `${sweep * 100}% 100%`,
                    boxShadow: `inset 0 ${-3 * u}px 0 ${sweep > 0.98 ? C.orange : "transparent"}`,
                  }}
                >
                  {ev}
                </span>
                {sentence.slice(evIdx + ev.length)}
              </>
            ) : (
              sentence
            )}
          </div>
        </ThermalCard>
      </div>

      {/* the time rail */}
      <div style={{ position: "absolute", left: railX0, width: railX1 - railX0, top: railY, height: 4 * u, background: C.silver, opacity: 0.6 }} />
      {Array.from({ length: 6 }).map((_, h) => {
        const hh = `${18 + h}:00`;
        return (
          <div key={hh} style={{ position: "absolute", left: railX(hh), top: railY - 14 * u, translate: "-50% 0" }}>
            <div style={{ width: 2 * u, height: 32 * u, background: C.muted, margin: "0 auto" }} />
            <div style={{ fontFamily: F.mono, fontSize: 20 * u, color: C.muted, marginTop: 6 * u }}>{hh}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: railX("22:40"), top: railY - 40 * u, translate: "-50% 0", fontFamily: F.mono, fontSize: 18 * u, color: C.orange }}>
        closeout
      </div>

      {items.map((item, i) => {
        const at = evidenceSnap(i);
        const s = spring({ frame: frame - at, fps, config: { damping: 13, stiffness: 210, mass: 0.7 } });
        const p = slot(i);
        const px = railX(item.time);
        const on = frame >= at ? 1 : 0;
        const cardCenterX = p.x + cardW / 2;
        return (
          <React.Fragment key={item.title}>
            <svg style={{ position: "absolute", left: 0, top: 0, opacity: s }} width={width} height={height}>
              <path
                d={`M ${px} ${railY + 2 * u} L ${px} ${railY + 40 * u} L ${cardCenterX} ${p.y - 30 * u} L ${cardCenterX} ${p.y}`}
                stroke={C.line}
                strokeWidth={2 * u}
                fill="none"
              />
              <circle cx={px} cy={railY + 2 * u} r={9 * u} fill={on ? C.orange : C.line} />
            </svg>
            <div
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                width: cardW,
                background: C.raised,
                borderTop: `${4 * u}px solid ${KIND_COLOR[item.kind] ?? C.silver}`,
                padding: `${18 * u}px ${20 * u}px`,
                opacity: frame < at ? 0 : s,
                scale: interpolate(s, [0, 1], [0.7, 1]),
                translate: `0 ${(1 - s) * -60 * u}px`,
                boxShadow: "0 16px 30px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <KindChip label={item.kind} color={KIND_COLOR[item.kind] ?? C.silver} u={u} />
                <span style={{ fontFamily: F.mono, fontSize: 18 * u, color: C.muted }}>{item.time === "22:40" ? "at close" : item.time}</span>
              </div>
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: (vertical ? 50 : 38) * u, color: C.paper, lineHeight: 1.05, marginTop: 14 * u }}>{item.title}</div>
              <div style={{ fontFamily: F.body, fontStyle: "italic", fontSize: (vertical ? 27 : 21) * u, color: C.silver, marginTop: 10 * u, lineHeight: 1.35 }}>“{item.evidence}”</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 * u, marginTop: 14 * u }}>
                <Led on={on} color={CONF_COLOR[item.confidence]} size={26 * u} />
                <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 24 * u, color: CONF_COLOR[item.confidence] }}>
                  {item.confidence === "high" ? "High confidence" : item.confidence === "review" ? "Needs review" : "Uncertain"}
                </span>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <Grime />
    </AbsoluteFill>
  );
};
