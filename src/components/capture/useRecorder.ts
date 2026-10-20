"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MicState = "unknown" | "live" | "simulated";

/**
 * Microphone capture with MediaRecorder + an AnalyserNode for the waveform.
 * If the mic is unavailable or permission is denied, it falls back to a
 * simulated recording so the closeout can still be completed.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mic, setMic] = useState<MicState>("unknown");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const accumulated = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    setElapsed(accumulated.current + (Date.now() - startedAt.current) / 1000);
  }, []);

  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMic("simulated");
      return null;
    }
    try {
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000)),
      ]);
      streamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      ctxRef.current = ctx;
      setAnalyser(an);
      setMic("live");
      return stream;
    } catch {
      setMic("simulated");
      return null;
    }
  }, []);

  const start = useCallback(async () => {
    const stream = await ensureStream();
    chunks.current = [];
    accumulated.current = 0;
    startedAt.current = Date.now();
    setElapsed(0);
    setPaused(false);
    setRecording(true);
    if (stream) {
      try {
        const rec = new MediaRecorder(stream);
        rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        rec.start(250);
        recRef.current = rec;
      } catch {
        recRef.current = null;
      }
    }
    timer.current = setInterval(tick, 200);
  }, [ensureStream, tick]);

  const pause = useCallback(() => {
    if (!recording || paused) return;
    accumulated.current += (Date.now() - startedAt.current) / 1000;
    if (timer.current) clearInterval(timer.current);
    if (recRef.current?.state === "recording") recRef.current.pause();
    setPaused(true);
  }, [recording, paused]);

  const resume = useCallback(() => {
    if (!recording || !paused) return;
    startedAt.current = Date.now();
    timer.current = setInterval(tick, 200);
    if (recRef.current?.state === "paused") recRef.current.resume();
    setPaused(false);
  }, [recording, paused, tick]);

  const stop = useCallback(async (): Promise<{ url: string | null; durationSec: number }> => {
    if (timer.current) clearInterval(timer.current);
    const total = paused ? accumulated.current : accumulated.current + (Date.now() - startedAt.current) / 1000;
    setRecording(false);
    setPaused(false);
    setElapsed(total);
    const rec = recRef.current;
    recRef.current = null;
    if (!rec || rec.state === "inactive") return { url: null, durationSec: total };
    const url = await new Promise<string | null>((resolve) => {
      rec.onstop = () => resolve(chunks.current.length ? URL.createObjectURL(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" })) : null);
      rec.stop();
    });
    return { url, durationSec: total };
  }, [paused]);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close().catch(() => {});
    },
    [],
  );

  return { recording, paused, elapsed, mic, analyser, start, pause, resume, stop };
}

/** Optional real transcription through the browser's speech service (Chrome). */
export function speechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
};

export function createSpeechRecognizer(onText: (text: string) => void): { start: () => void; stop: () => void } | null {
  if (!speechRecognitionSupported()) return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition)!;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  rec.onresult = (e) => {
    let text = "";
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    onText(text.trim());
  };
  rec.onerror = () => {};
  return {
    start: () => {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* not running */
      }
    },
  };
}
