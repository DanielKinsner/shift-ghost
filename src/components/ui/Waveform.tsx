"use client";

import { useEffect, useRef } from "react";
import { cx } from "./primitives";

/**
 * Waveform ribbon. Draws mirrored bars from live microphone levels when an
 * AnalyserNode is supplied, or a believable simulated voice when it isn't.
 */
export function Waveform({
  active,
  analyser,
  className,
  bars = 56,
  height = 96,
  reducedMotion,
  label = "Voice level",
}: {
  active: boolean;
  analyser?: AnalyserNode | null;
  className?: string;
  bars?: number;
  height?: number;
  reducedMotion?: boolean;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>(Array.from({ length: bars }, () => 0.04));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const data = analyser ? new Uint8Array(analyser.fftSize) : null;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      let level = 0.03;
      if (active) {
        if (analyser && data) {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          level = Math.min(1, Math.sqrt(sum / data.length) * 4.2);
        } else {
          // Simulated speech: syllable bursts with pauses between words.
          t += 1;
          const syllable = Math.max(0, Math.sin(t / 3.1)) * Math.max(0, Math.sin(t / 17 + 1.2));
          const breath = Math.sin(t / 61) > -0.75 ? 1 : 0.15;
          level = 0.08 + syllable * 0.8 * breath + (Math.random() - 0.5) * 0.12 * breath;
        }
      }
      const arr = levels.current;
      if (!reducedMotion || !active) {
        arr.shift();
        arr.push(Math.max(0.03, Math.min(1, level)));
      } else {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.max(0.05, level * (0.6 + 0.4 * Math.sin(i)));
      }

      const gap = 3;
      const bw = Math.max(2, (w - gap * (bars - 1)) / bars);
      const mid = h / 2;
      for (let i = 0; i < bars; i++) {
        const v = arr[i];
        const bh = Math.max(2, v * (h - 6));
        const x = i * (bw + gap);
        const fresh = i > bars - 6;
        ctx.fillStyle = active ? (fresh ? "#ffd2b8" : `rgba(255,107,26,${0.35 + v * 0.65})`) : "rgba(183,191,200,0.28)";
        ctx.beginPath();
        ctx.roundRect(x, mid - bh / 2, bw, bh, bw / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, analyser, bars, reducedMotion]);

  return <canvas ref={canvasRef} className={cx("block w-full", className)} style={{ height }} role="img" aria-label={active ? `${label}: recording` : `${label}: idle`} />;
}
