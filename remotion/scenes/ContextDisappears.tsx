import React from "react";
import { AbsoluteFill, Easing, interpolate, random, spring, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Grime, Waveform, clamp, useLayout, useSceneFade } from "../parts";

const NOTES = [
  "ice machine??",
  "Table 12 refund",
  "out of cups",
  "who has the door code",
  "tasha — chem test?",
  "fryer 2 hot AGAIN",
  "call them before lunch",
];

/** Note centres as fractions of the frame, measured from the middle. */
const ANCHORS_H: [number, number][] = [
  [-0.34, -0.3],
  [0.02, -0.34],
  [0.33, -0.3],
  [0.36, 0.02],
  [-0.3, -0.04],
  [0.15, 0.3],
  [0.39, 0.34],
];
const ANCHORS_V: [number, number][] = [
  [-0.24, -0.38],
  [0.22, -0.31],
  [-0.22, -0.2],
  [0.24, -0.12],
  [-0.24, 0.12],
  [0.22, 0.17],
  [-0.06, 0.235],
];

/** Scene 1 · A voice waveform and chaotic sticky-note fragments. "The shift ends. Context disappears." */
export const ContextDisappears: React.FC<{ duration: number; location: string }> = ({ duration, location }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, vertical, u } = useLayout();
  const fade = useSceneFade(duration, 1, 14);
  // Context scatters and the voice flattens out.
  const scatter = interpolate(frame, [125, 185], [0, 1], { ...clamp, easing: Easing.bezier(0.55, 0, 0.75, 0.2) });
  const amplitude = interpolate(frame, [0, 20, 130, 190], [0.2, 1, 0.9, 0.03], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: C.night, opacity: fade }}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Waveform width={width * 0.86} height={(vertical ? 260 : 300) * u} bars={vertical ? 64 : 110} amplitude={amplitude} seed="close" />
      </AbsoluteFill>

      {NOTES.map((note, i) => {
        const appear = 8 + i * 13;
        const s = spring({ frame: frame - appear, fps, config: { damping: 11, stiffness: 160 } });
        const rx = random(`note-x-${i}`);
        const ry = random(`note-y-${i}`);
        const rr = random(`note-r-${i}`);
        // Fixed anchors keep the notes clear of the caption; a little jitter keeps them messy.
        const [ax, ay] = (vertical ? ANCHORS_V : ANCHORS_H)[i];
        const col = ax < 0 ? -1 : 1;
        const x = (ax + (rx - 0.5) * 0.03) * width;
        const y = (ay + (ry - 0.5) * 0.03) * height;
        const drift = scatter * (300 + rr * 400) * u;
        return (
          <div
            key={note}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 270 * u,
              marginLeft: -135 * u,
              marginTop: -70 * u,
              padding: `${22 * u}px ${20 * u}px`,
              background: i % 3 === 1 ? "#E6D59A" : C.paper,
              color: C.ink,
              fontFamily: F.display,
              fontWeight: 600,
              fontSize: 40 * u,
              lineHeight: 1.05,
              boxShadow: "0 18px 30px rgba(0,0,0,0.55)",
              translate: `${x + col * drift}px ${y + (rr - 0.5) * drift}px`,
              rotate: `${(rr - 0.5) * 22 + scatter * col * 35}deg`,
              scale: interpolate(s, [0, 1], [0.3, 1]),
              opacity: frame < appear ? 0 : (1 - scatter) * Math.min(1, s * 1.4),
              filter: `blur(${scatter * 8 * u}px)`,
            }}
          >
            <div style={{ width: 46 * u, height: 12 * u, background: "rgba(183,191,200,0.55)", margin: `${-30 * u}px auto ${14 * u}px`, rotate: `${(rx - 0.5) * 8}deg` }} />
            {note}
          </div>
        );
      })}

      <AbsoluteFill style={{ justifyContent: vertical ? "flex-end" : "flex-end", alignItems: "flex-start", padding: vertical ? `${150 * u}px ${70 * u}px` : `${80 * u}px ${110 * u}px` }}>
        <div style={{ fontFamily: F.mono, color: C.muted, fontSize: 24 * u, letterSpacing: 1 * u, marginBottom: 18 * u, opacity: interpolate(frame, [4, 18], [0, 1], clamp) }}>
          22:40 · {location} close
        </div>
        <div
          style={{
            fontFamily: F.display,
            fontWeight: 700,
            color: C.paper,
            fontSize: (vertical ? 96 : 112) * u,
            lineHeight: 0.95,
            letterSpacing: -0.5 * u,
            textShadow: "0 6px 30px rgba(0,0,0,0.8)",
          }}
        >
          <div style={{ opacity: interpolate(frame, [18, 34], [0, 1], clamp), translate: `0 ${interpolate(frame, [18, 34], [24, 0], clamp)}px` }}>The shift ends.</div>
          <div
            style={{
              color: C.orange,
              opacity: interpolate(frame, [70, 86], [0, 1], clamp) * interpolate(frame, [150, 200], [1, 0.25], clamp),
              translate: `0 ${interpolate(frame, [70, 86], [24, 0], clamp)}px`,
              letterSpacing: `${interpolate(frame, [150, 200], [-0.5, 14], clamp) * u}px`,
              filter: `blur(${interpolate(frame, [160, 205], [0, 6], clamp) * u}px)`,
            }}
          >
            Context disappears.
          </div>
        </div>
      </AbsoluteFill>
      <Grime />
    </AbsoluteFill>
  );
};
