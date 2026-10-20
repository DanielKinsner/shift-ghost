import React from "react";
import { interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F } from "./theme";

/** u = 1 on the short side of a 1080 frame, so one design works for 16:9 and 9:16. */
export function useLayout() {
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const vertical = height > width;
  const u = Math.min(width, height) / 1080;
  return { width, height, fps, vertical, u, durationInFrames };
}

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Fade a whole scene in and out at its edges (local frames). */
export function useSceneFade(duration: number, inFrames = 12, outFrames = 12) {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, inFrames, duration - outFrames, duration], [0, 1, 1, 0], clamp);
}

/** The Shift Ghost mark: a ghost whose bottom edge is a waveform, with two LED eye slits. */
export const GhostMark: React.FC<{ size: number; eyes?: number; wave?: number; id: string }> = ({ size, eyes = 1, wave = 0, id }) => {
  const frame = useCurrentFrame();
  const left = 14;
  const right = 106;
  const segments = 12;
  const pts: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const x = right - ((right - left) * i) / segments;
    const amp = 4 + 9 * Math.abs(Math.sin(i * 1.7 + frame * 0.18 * wave)) * (i % 2 === 0 ? 1 : -0.6);
    pts.push(`L ${x.toFixed(2)} ${(122 + (i % 2 === 0 ? amp : -Math.abs(amp) * 0.5)).toFixed(2)}`);
  }
  const d = `M ${left} 66 A 46 46 0 0 1 ${right} 66 L ${right} 122 ${pts.join(" ")} Z`;
  return (
    <svg width={size} height={(size * 140) / 120} viewBox="0 0 120 140" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.paper} />
          <stop offset="1" stopColor={C.paperShade} />
        </linearGradient>
        <filter id={`${id}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      <path d={d} fill={`url(#${id}-body)`} stroke={C.silver} strokeOpacity={0.5} strokeWidth={1.2} />
      <g opacity={0.25 + 0.75 * eyes}>
        <rect x={39} y={56} width={13} height={22} rx={2} fill={C.orange} filter={`url(#${id}-glow)`} />
        <rect x={68} y={56} width={13} height={22} rx={2} fill={C.orange} filter={`url(#${id}-glow)`} />
      </g>
      <rect x={39} y={56} width={13} height={22} rx={2} fill={C.orange} opacity={0.35 + 0.65 * eyes} />
      <rect x={68} y={56} width={13} height={22} rx={2} fill={C.orange} opacity={0.35 + 0.65 * eyes} />
    </svg>
  );
};

/** A physical status light: bezel + lens, glowing when on. */
export const Led: React.FC<{ on: number; color: string; size: number }> = ({ on, color, size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: "radial-gradient(circle at 35% 30%, #3a4656, #0a0e14 70%)",
      boxShadow: `inset 0 ${size * 0.04}px ${size * 0.08}px rgba(255,255,255,0.08), 0 ${size * 0.06}px ${size * 0.12}px rgba(0,0,0,0.6)`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: size * 0.62,
        height: size * 0.62,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,${0.15 + 0.55 * on}) 0, ${color} 38%, #000 140%)`,
        opacity: 0.28 + 0.72 * on,
        boxShadow: `0 0 ${size * 0.9 * on}px ${size * 0.15 * on}px ${color}`,
      }}
    />
  </div>
);

/** Reflective tape divider: diagonal orange/ink stripes with a travelling sheen. */
export const Tape: React.FC<{ width: number | string; height: number; sheen?: number; u: number }> = ({ width, height, sheen = 0, u }) => (
  <div
    style={{
      width,
      height,
      position: "relative",
      overflow: "hidden",
      background: `repeating-linear-gradient(-45deg, ${C.orange} 0 ${18 * u}px, ${C.ink} ${18 * u}px ${36 * u}px)`,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.0) 40%, rgba(230,236,242,0.55) 50%, rgba(255,255,255,0) 60%, transparent 100%)",
        translate: `${interpolate(sheen, [0, 1], [-100, 100])}% 0`,
      }}
    />
  </div>
);

/** A rubber stamp that slams down: big and transparent → seated. `at` is the local frame it lands. */
export const Stamp: React.FC<{ text: string; sub?: string; at: number; u: number; color?: string; rotate?: number }> = ({
  text,
  sub,
  at,
  u,
  color = C.paperRed,
  rotate = -7,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 220, mass: 0.6 } });
  return (
    <div
      style={{
        border: `${4 * u}px solid ${color}`,
        outline: `${1.5 * u}px solid ${color}`,
        outlineOffset: `${3 * u}px`,
        color,
        padding: `${6 * u}px ${14 * u}px`,
        fontFamily: F.display,
        fontWeight: 700,
        fontSize: 30 * u,
        letterSpacing: 2 * u,
        textTransform: "uppercase",
        lineHeight: 1,
        textAlign: "center",
        rotate: `${rotate}deg`,
        scale: interpolate(s, [0, 1], [2.3, 1]),
        opacity: frame < at ? 0 : interpolate(s, [0, 0.4, 1], [0, 0.9, 0.88]),
        mixBlendMode: "multiply",
      }}
    >
      {text}
      {sub ? <div style={{ fontFamily: F.mono, fontWeight: 500, fontSize: 18 * u, letterSpacing: 1 * u, marginTop: 4 * u }}>{sub}</div> : null}
    </div>
  );
};

/** Zig-zag torn paper edge, as a clip-path polygon. */
function tornClip(teeth: number, depth: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= teeth; i++) pts.push(`${(i / teeth) * 100}% ${i % 2 ? depth : 0}px`);
  for (let i = teeth; i >= 0; i--) pts.push(`${(i / teeth) * 100}% calc(100% - ${i % 2 ? depth : 0}px)`);
  return `polygon(${pts.join(", ")})`;
}

/** A thermal-printer receipt card. */
export const ThermalCard: React.FC<{ width: number | string; u: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ width, u, children, style }) => (
  <div
    style={{
      width,
      background: `linear-gradient(180deg, ${C.paper} 0%, #E3DDCC 100%)`,
      color: C.ink,
      padding: `${26 * u}px ${28 * u}px`,
      clipPath: tornClip(40, 7 * u),
      fontFamily: F.body,
      boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
      ...style,
    }}
  >
    {children}
  </div>
);

/** A voice waveform ribbon: mirrored bars driven by the frame. */
export const Waveform: React.FC<{ width: number; height: number; bars: number; amplitude: number; color?: string; seed?: string }> = ({
  width,
  height,
  bars,
  amplitude,
  color = C.orange,
  seed = "wave",
}) => {
  const frame = useCurrentFrame();
  const gap = width / bars;
  const barW = gap * 0.55;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {Array.from({ length: bars }).map((_, i) => {
        const r = random(`${seed}-${i}`);
        const env = Math.sin((Math.PI * (i + 0.5)) / bars) ** 0.8;
        const live = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55 + frame * (0.16 + r * 0.12)) * Math.sin(i * 0.21 + frame * 0.07 + r * 6));
        const h = Math.max(2, height * 0.92 * env * live * amplitude);
        return (
          <rect
            key={i}
            x={i * gap + (gap - barW) / 2}
            y={(height - h) / 2}
            width={barW}
            height={h}
            rx={barW / 2}
            fill={i % 7 === 3 ? C.silver : color}
            opacity={0.55 + 0.45 * env}
          />
        );
      })}
    </svg>
  );
};

/** A small kind label in the app's voice: a stamped-looking chip. */
export const KindChip: React.FC<{ label: string; color: string; u: number }> = ({ label, color, u }) => (
  <span
    style={{
      fontFamily: F.display,
      fontWeight: 700,
      fontSize: 18 * u,
      letterSpacing: 1.5 * u,
      textTransform: "uppercase",
      color,
      border: `${2 * u}px solid ${color}`,
      padding: `${2 * u}px ${8 * u}px`,
      lineHeight: 1.1,
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </span>
);

/** Subtle grime + vignette over every scene. */
export const Grime: React.FC = () => (
  <>
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.035) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
        pointerEvents: "none",
      }}
    />
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.07, pointerEvents: "none" }}>
      <filter id="grime-noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grime-noise)" />
    </svg>
  </>
);

export { clamp };
