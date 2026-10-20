import type { TextSpan, TranscriptAnswer } from "../types";

/** Split a transcript into sentences, keeping exact character offsets. */
export function segmentSentences(transcript: string): TextSpan[] {
  const spans: TextSpan[] = [];
  const re = /[^.!?]+(?:[.!?]+["”’']?|$)/g;
  for (const m of transcript.matchAll(re)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) continue;
    const start = (m.index ?? 0) + lead;
    spans.push({ start, end: start + text.length, text });
  }
  return spans;
}

/** Split a sentence into clauses ("X and Y", "X, but Y") with absolute offsets. */
export function segmentClauses(sentence: TextSpan): TextSpan[] {
  const parts: TextSpan[] = [];
  const splitter = /\s+and\s+|,\s+(?:and\s+|but\s+)?|;\s+|\s+but\s+/gi;
  let cursor = 0;
  const body = sentence.text.replace(/[.!?]+$/, "");
  for (const m of body.matchAll(splitter)) {
    const idx = m.index ?? 0;
    const text = body.slice(cursor, idx).trim();
    if (text) parts.push({ start: sentence.start + cursor, end: sentence.start + idx, text });
    cursor = idx + m[0].length;
  }
  const tail = body.slice(cursor).trim();
  if (tail) parts.push({ start: sentence.start + cursor, end: sentence.start + cursor + tail.length, text: tail });
  return parts;
}

/**
 * Join guided answers into one transcript with offsets. The joined text is what
 * evidence spans point into; it is never rewritten after capture.
 */
export function joinAnswers(
  answers: Omit<TranscriptAnswer, "start" | "end">[],
): { transcript: string; answers: TranscriptAnswer[] } {
  let transcript = "";
  const out: TranscriptAnswer[] = [];
  for (const a of answers) {
    const text = a.text.trim();
    if (!text) continue;
    if (transcript) transcript += " ";
    const start = transcript.length;
    transcript += text;
    out.push({ ...a, text, start, end: transcript.length });
  }
  return { transcript, answers: out };
}

export function questionForOffset(answers: TranscriptAnswer[], offset: number): string | null {
  const a = answers.find((x) => offset >= x.start && offset < x.end);
  return a?.questionId ?? null;
}
