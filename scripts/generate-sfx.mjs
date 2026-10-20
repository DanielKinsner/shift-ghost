#!/usr/bin/env node
/**
 * Synthesizes the explainer's mechanical sound-design placeholders into public/sfx/.
 * No dependencies, deterministic output (seeded noise). Replace these WAVs with
 * produced sound design later; the composition only references the filenames.
 *
 *   node scripts/generate-sfx.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0.98 ? 0.98 / peak : 1;
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const render = (seconds, fn) => Array.from({ length: Math.round(seconds * RATE) }, (_, i) => fn(i / RATE, i));

/** A relay contact closing: a sharp transient plus a small bounce. */
function relayClick() {
  const rnd = mulberry32(7);
  return render(0.07, (t) => {
    const hit = (t0, amp) => (t >= t0 ? amp * Math.exp(-(t - t0) * 420) * ((rnd() * 2 - 1) * 0.7 + Math.sin(2 * Math.PI * 1850 * (t - t0)) * 0.6) : 0);
    return hit(0, 0.9) + hit(0.013, 0.35);
  });
}

/** A status LED clicking on: tiny high blip. */
function ledTick() {
  return render(0.04, (t) => Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 170) * 0.5 * Math.min(1, t * 2000));
}

/** A rubber stamp landing on a counter: falling low thud plus paper slap. */
function stampThunk() {
  const rnd = mulberry32(11);
  let lp = 0;
  let phase = 0;
  return render(0.32, (t) => {
    const f = 55 + 95 * Math.exp(-t * 30);
    phase += (2 * Math.PI * f) / RATE;
    const body = Math.sin(phase) * Math.exp(-t * 13) * 0.9;
    lp += ((rnd() * 2 - 1) - lp) * 0.18;
    const slap = t < 0.02 ? lp * (1 - t / 0.02) * 1.4 : 0;
    return body + slap;
  });
}

/** A thermal printer feeding paper: stepper ticks over a soft buzz. */
function thermalPrint() {
  const rnd = mulberry32(23);
  let hp = 0;
  let prev = 0;
  return render(0.9, (t) => {
    const n = rnd() * 2 - 1;
    hp = 0.92 * (hp + n - prev);
    prev = n;
    const stepPhase = (t * 96) % 1;
    const tick = Math.exp(-stepPhase * 22) * 0.5;
    const env = Math.min(1, t * 30) * Math.min(1, (0.9 - t) * 12);
    return env * (hp * tick * 0.6 + Math.sin(2 * Math.PI * 1150 * t) * 0.05 * tick);
  });
}

/** Fluorescent ballast hum, loopable (whole cycles of 60 Hz). */
function lowHum() {
  const rnd = mulberry32(31);
  let lp = 0;
  return render(4, (t) => {
    lp += ((rnd() * 2 - 1) - lp) * 0.02;
    const hum = Math.sin(2 * Math.PI * 60 * t) * 0.5 + Math.sin(2 * Math.PI * 120 * t) * 0.32 + Math.sin(2 * Math.PI * 180 * t) * 0.14;
    const edge = Math.min(1, t * 100) * Math.min(1, (4 - t) * 100);
    return (hum * 0.6 + lp * 0.5) * edge;
  });
}

mkdirSync(OUT, { recursive: true });
const files = {
  "relay-click.wav": relayClick(),
  "led-tick.wav": ledTick(),
  "stamp-thunk.wav": stampThunk(),
  "thermal-print.wav": thermalPrint(),
  "low-hum.wav": lowHum(),
};
for (const [name, samples] of Object.entries(files)) {
  writeFileSync(join(OUT, name), wav(samples));
  console.log(`public/sfx/${name}  ${(samples.length / RATE).toFixed(2)}s`);
}
