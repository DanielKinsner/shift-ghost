import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { GhostMark, Grime, KindChip, clamp, useLayout, useSceneFade } from "../parts";
import type { ExplainerProps } from "../schema";

export const ANSWER_STEP = 36;
export const ANSWER_START = 25;
/** Local frame at which answer i reaches the ghost (used for sound placement). */
export const answerArrival = (i: number) => ANSWER_START + i * ANSWER_STEP + 30;

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

const KIND_COLOR: Record<string, string> = {
  Maintenance: C.red,
  Inventory: C.amber,
  Customer: C.orange,
  "Next-shift task": C.silver,
  Incident: C.green,
};

/** Scene 2 · The five voice answers flow through the Shift Ghost mark and come out as structured items. */
export const AnswersThroughGhost: React.FC<{ duration: number; answers: ExplainerProps["answers"] }> = ({ duration, answers }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, vertical, u } = useLayout();
  const fade = useSceneFade(duration);
  const ghostIn = spring({ frame, fps, config: { damping: 200 } });
  const ghostX = width / 2;
  const ghostY = vertical ? height * 0.5 : height * 0.54;
  const ghostSize = (vertical ? 230 : 250) * u;

  // Eyes flash each time an answer arrives.
  const flash = Math.max(
    0,
    ...answers.map((_, i) => interpolate(frame, [answerArrival(i) - 2, answerArrival(i), answerArrival(i) + 14], [0, 1, 0], clamp)),
  );

  const rowGap = (vertical ? 112 : 142) * u;
  const inPos = (i: number) =>
    vertical ? { x: width / 2, y: height * 0.265 + (i - 2) * rowGap } : { x: width * 0.07, y: ghostY + (i - 2) * rowGap };
  const outPos = (i: number) =>
    vertical ? { x: width / 2, y: height * 0.775 + (i - 2) * rowGap } : { x: width * 0.93, y: ghostY + (i - 2) * rowGap };

  return (
    <AbsoluteFill style={{ backgroundColor: C.night, opacity: fade }}>
      {/* the conveyor: a faint line from answers → ghost → items */}
      <svg style={{ position: "absolute", inset: 0 }} width={width} height={height}>
        {answers.map((_, i) => {
          const a = inPos(i);
          const b = outPos(i);
          const ax = vertical ? a.x : a.x + 560 * u;
          const ay = vertical ? a.y + 34 * u : a.y;
          const bx = vertical ? b.x : b.x - 560 * u;
          const by = vertical ? b.y - 34 * u : b.y;
          return (
            <g key={i} stroke={C.line} strokeWidth={2 * u} fill="none" strokeDasharray={`${6 * u} ${8 * u}`} opacity={interpolate(frame, [10, 30], [0, 1], clamp)}>
              <path d={vertical ? `M ${ax} ${ay} L ${ghostX} ${ghostY - ghostSize * 0.6}` : `M ${ax} ${ay} C ${ax + 120 * u} ${ay} ${ghostX - 220 * u} ${ghostY} ${ghostX - ghostSize * 0.55} ${ghostY}`} />
              <path d={vertical ? `M ${ghostX} ${ghostY + ghostSize * 0.75} L ${bx} ${by}` : `M ${ghostX + ghostSize * 0.55} ${ghostY} C ${ghostX + 220 * u} ${ghostY} ${bx - 120 * u} ${by} ${bx} ${by}`} />
            </g>
          );
        })}
      </svg>

      <div
        style={{
          position: "absolute",
          left: ghostX,
          top: ghostY,
          translate: "-50% -50%",
          scale: interpolate(ghostIn, [0, 1], [0.6, 1]) * (1 + flash * 0.05),
          opacity: ghostIn,
        }}
      >
        <GhostMark size={ghostSize} eyes={0.45 + 0.55 * flash} wave={1} id="g2" />
      </div>

      {answers.map((a, i) => {
        const start = ANSWER_START + i * ANSWER_STEP;
        const enter = spring({ frame: frame - start, fps, config: { damping: 200 } });
        const travel = interpolate(frame, [start + 12, start + 30], [0, 1], { ...clamp, easing: Easing.bezier(0.6, 0, 0.9, 0.6) });
        const p = inPos(i);
        const dx = (ghostX - p.x - (vertical ? 0 : 280 * u)) * travel;
        const dy = (ghostY - p.y) * travel;
        return (
          <div
            key={`in-${i}`}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: (vertical ? 920 : 560) * u,
              translate: vertical ? `calc(-50% + ${dx}px) calc(-50% + ${dy}px)` : `${dx}px calc(-50% + ${dy}px)`,
              scale: interpolate(travel, [0, 1], [1, 0.15]),
              opacity: frame < start ? 0 : enter * interpolate(travel, [0, 0.8, 1], [1, 0.8, 0]),
              background: C.surface,
              borderLeft: `${4 * u}px solid ${C.orange}`,
              padding: `${12 * u}px ${18 * u}px`,
              boxShadow: "0 12px 24px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: (vertical ? 25 : 21) * u, color: C.muted, letterSpacing: 0.5 * u }}>
              {i + 1}. {a.question}
            </div>
            <div style={{ fontFamily: F.body, fontSize: (vertical ? 31 : 25) * u, color: C.paper, lineHeight: 1.3, marginTop: 4 * u }}>“{a.text}”</div>
          </div>
        );
      })}

      {answers.map((a, i) => {
        const arrive = answerArrival(i);
        const out = spring({ frame: frame - arrive, fps, config: { damping: 16, stiffness: 170 } });
        const p = outPos(i);
        const fromX = ghostX - p.x;
        const fromY = ghostY - p.y;
        return (
          <div
            key={`out-${i}`}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: (vertical ? 920 : 560) * u,
              translate: vertical
                ? `calc(-50% + ${fromX * (1 - out)}px) calc(-50% + ${fromY * (1 - out)}px)`
                : `calc(-100% + ${fromX * (1 - out)}px) calc(-50% + ${fromY * (1 - out)}px)`,
              scale: interpolate(out, [0, 1], [0.2, 1]),
              opacity: frame < arrive ? 0 : Math.min(1, out * 1.5),
              display: "flex",
              alignItems: "center",
              gap: 16 * u,
              background: C.raised,
              padding: `${16 * u}px ${18 * u}px`,
              boxShadow: "0 12px 24px rgba(0,0,0,0.45)",
            }}
          >
            <KindChip label={a.kind} color={KIND_COLOR[a.kind] ?? C.silver} u={u} />
            <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: (vertical ? 32 : 26) * u, color: C.paper, lineHeight: 1.2 }}>{a.result}</div>
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: vertical ? 70 * u : 110 * u,
          top: vertical ? 70 * u : 60 * u,
          right: vertical ? 70 * u : undefined,
          opacity: interpolate(frame, [6, 20], [0, 1], clamp),
        }}
      >
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: (vertical ? 64 : 60) * u, color: C.paper, lineHeight: 1 }}>Five answers. Two minutes.</div>
        <div style={{ fontFamily: F.mono, fontSize: 22 * u, color: C.muted, marginTop: 10 * u }}>
          ● REC {mmss(interpolate(frame, [0, duration], [38, 112], clamp))} / 02:00
        </div>
      </div>
      <Grime />
    </AbsoluteFill>
  );
};
