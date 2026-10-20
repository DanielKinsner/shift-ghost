import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Grime, Led, Tape, clamp, useLayout, useSceneFade } from "../parts";
import type { ExplainerProps } from "../schema";

const DAYS = ["Mon 12", "Tue 13", "Wed 14", "Thu 15", "Fri 16", "Sat 17", "Sun 18", "Mon 19", "Tue 20"];
/** Downtown ice-machine mentions from the seed: day index and time said. */
const MENTIONS: { day: number; time: string }[] = [
  { day: 0, time: "21:40" },
  { day: 2, time: "20:50" },
  { day: 3, time: "22:15" },
  { day: 5, time: "20:30" },
  { day: 6, time: "14:00" },
  { day: 8, time: "20:20" },
];
export const LIGHT_START = 40;
export const LIGHT_STEP = 18;
export const lightAt = (i: number) => LIGHT_START + i * LIGHT_STEP;

const T0 = 13 * 60;
const T1 = 23 * 60 + 30;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Scene 5 · The recurring ice-machine pattern illuminates across nine days. */
export const PatternReveal: React.FC<{ duration: number; location: string; pattern: ExplainerProps["pattern"] }> = ({ duration, location, pattern }) => {
  const frame = useCurrentFrame();
  const { width, height, vertical, u } = useLayout();
  const fade = useSceneFade(duration);
  const pad = (vertical ? 70 : 110) * u;

  const gridX = vertical ? pad : width * 0.47;
  const gridW = vertical ? width - pad * 2 : width - gridX - pad;
  const gridTop = vertical ? height * 0.37 : height * 0.16;
  const gridH = vertical ? height * 0.47 : height * 0.62;
  const colW = gridW / DAYS.length;
  const yFor = (hhmm: string) => gridTop + gridH - ((toMin(hhmm) - T0) / (T1 - T0)) * gridH;
  const eightY = yFor("20:00");
  const allLit = lightAt(MENTIONS.length - 1) + 10;
  const wash = interpolate(frame, [allLit, allLit + 24], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: C.night, opacity: fade }}>
      {/* copy block */}
      <div style={{ position: "absolute", left: pad, top: vertical ? 90 * u : height * 0.2, width: vertical ? width - pad * 2 : width * 0.36 }}>
        <div style={{ fontFamily: F.mono, fontSize: 22 * u, color: C.muted }}>Patterns · {location} · last 9 days</div>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: (vertical ? 92 : 84) * u, color: C.paper, lineHeight: 0.98, marginTop: 14 * u }}>
          {location} ice machine
        </div>
        <div
          style={{
            fontFamily: F.display,
            fontWeight: 600,
            fontSize: (vertical ? 64 : 58) * u,
            color: C.orange,
            lineHeight: 1.05,
            marginTop: 10 * u,
            opacity: interpolate(frame, [allLit - 6, allLit + 8], [0.25, 1], clamp),
          }}
        >
          Mentioned {pattern.mentions} times in {pattern.days} days
        </div>
        <div style={{ marginTop: 26 * u }}>
          <Tape width="100%" height={18 * u} sheen={interpolate(frame, [allLit, allLit + 50], [0, 1], clamp)} u={u} />
        </div>
        <div style={{ fontFamily: F.mono, fontSize: (vertical ? 30 : 28) * u, color: C.paper, marginTop: 24 * u, lineHeight: 1.5, opacity: interpolate(frame, [allLit + 6, allLit + 20], [0, 1], clamp) }}>
          {pattern.afterEight} of {pattern.mentions} after 8 PM
          <br />~{pattern.crewHours} crew hours lost
        </div>
        <div style={{ fontFamily: F.body, fontSize: (vertical ? 28 : 26) * u, color: C.silver, marginTop: 18 * u, opacity: interpolate(frame, [allLit + 24, allLit + 40], [0, 1], clamp) }}>
          A pattern, not a diagnosis. Every light links to the sentence that was said.
        </div>
      </div>

      {/* nine-day grid: each column is one day, 2 PM (bottom) → 11 PM (top) */}
      <div style={{ position: "absolute", left: gridX, top: gridTop, width: gridW, height: gridH, background: C.surface, outline: `${2 * u}px solid ${C.line}` }} />
      <div style={{ position: "absolute", left: gridX, top: gridTop, width: gridW, height: eightY - gridTop, background: `${C.orange}`, opacity: 0.1 * wash }} />
      {DAYS.map((d, i) => (
        <React.Fragment key={d}>
          {i > 0 ? <div style={{ position: "absolute", left: gridX + i * colW, top: gridTop, width: 1, height: gridH, background: C.line }} /> : null}
          <div style={{ position: "absolute", left: gridX + i * colW + colW / 2, top: gridTop + gridH + 14 * u, translate: "-50% 0", fontFamily: F.mono, fontSize: (vertical ? 19 : 20) * u, color: i === 8 ? C.paper : C.muted, textAlign: "center", lineHeight: 1.2 }}>
            {d.split(" ")[0]}
            <br />
            {d.split(" ")[1]}
          </div>
        </React.Fragment>
      ))}
      {["14:00", "17:00", "20:00", "23:00"].map((t) => (
        <div key={t} style={{ position: "absolute", left: gridX - 12 * u, top: yFor(t), translate: "-100% -50%", fontFamily: F.mono, fontSize: 18 * u, color: t === "20:00" ? C.orange : C.muted }}>
          {t}
        </div>
      ))}
      <div style={{ position: "absolute", left: gridX, top: eightY, width: gridW, borderTop: `${3 * u}px dashed ${C.orange}`, opacity: 0.4 + 0.6 * wash }} />
      <div style={{ position: "absolute", left: gridX + colW + colW / 2, top: eightY + 10 * u, translate: "-50% 0", fontFamily: F.display, fontWeight: 600, fontSize: 22 * u, color: C.orange, opacity: wash, whiteSpace: "nowrap" }}>
        after 8 PM
      </div>

      {MENTIONS.map((m, i) => {
        const on = interpolate(frame, [lightAt(i), lightAt(i) + 6], [0, 1], clamp);
        const late = toMin(m.time) >= 20 * 60;
        return (
          <div key={i} style={{ position: "absolute", left: gridX + m.day * colW + colW / 2, top: yFor(m.time) - ((vertical ? 48 : 52) * u) / 2, translate: "-50% 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 * u }}>
            <Led on={on} color={late ? C.red : C.amber} size={(vertical ? 48 : 52) * u} />
            <div style={{ fontFamily: F.mono, fontSize: 17 * u, color: C.paper, opacity: on }}>{m.time}</div>
          </div>
        );
      })}
      <Grime />
    </AbsoluteFill>
  );
};
