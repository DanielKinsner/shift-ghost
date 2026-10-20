/**
 * Spoken-number parsing for closeout speech: "eight twenty" (a time),
 * "three seventy five" (a fryer reading), "forty five minutes", "half a sleeve".
 */

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

export const NUMBER_WORD =
  "(?:\\d+|zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\\b";

/** Parse a single small number word or digits ("twelve", "12", "a"). */
export function wordToNumber(word: string): number | null {
  const w = word.toLowerCase().trim();
  if (/^\d+$/.test(w)) return Number(w);
  if (w in UNITS) return UNITS[w];
  if (w in TENS) return TENS[w];
  return null;
}

/**
 * Parse up to three number tokens into a compound value.
 * "forty five" → 45, "three ninety" → 390, "three seventy five" → 375.
 * Returns the value and how many tokens were consumed.
 */
export function parseCompound(tokens: string[]): { value: number; used: number } | null {
  const t = tokens.map((x) => x.toLowerCase());
  const first = wordToNumber(t[0] ?? "");
  if (first === null) return null;
  // digits stand alone
  if (/^\d+$/.test(t[0])) return { value: first, used: 1 };

  const second = t[1] !== undefined ? t[1] : "";
  if (first >= 20 && first % 10 === 0 && UNITS[second] !== undefined && UNITS[second] < 10 && UNITS[second] > 0) {
    // "forty five"
    return { value: first + UNITS[second], used: 2 };
  }
  if (first >= 1 && first <= 9 && TENS[second] !== undefined) {
    // "three ninety" (hundreds), optionally "three seventy five"
    const third = t[2] ?? "";
    const unit = UNITS[third] !== undefined && UNITS[third] > 0 && UNITS[third] < 10 ? UNITS[third] : 0;
    return { value: first * 100 + TENS[second] + unit, used: unit ? 3 : 2 };
  }
  if (first >= 1 && first <= 9 && UNITS[second] !== undefined && UNITS[second] >= 10) {
    // "three fifteen" → 315 (rare in readings, kept for completeness)
    return { value: first * 100 + UNITS[second], used: 2 };
  }
  return { value: first, used: 1 };
}

/** Durations: "ten minutes", "an hour", "half an hour", "forty five minutes", "an hour and a half". */
export function parseDurationMinutes(text: string): { minutes: number; match: string } | null {
  const lower = text.toLowerCase();
  const patterns: [RegExp, (m: RegExpMatchArray) => number][] = [
    [/\ban hour and a half\b/, () => 90],
    [/\bhalf an hour\b/, () => 30],
    [/\b(an|one) hour\b/, () => 60],
    [/\b(two|three|\d+) hours?\b/, (m) => (wordToNumber(m[1]) ?? 1) * 60],
    [
      new RegExp(`\\b(${NUMBER_WORD}(?:\\s+${NUMBER_WORD})?)\\s+minutes?\\b`),
      (m) => parseCompound(m[1].split(/\s+/))?.value ?? 0,
    ],
  ];
  for (const [re, fn] of patterns) {
    const m = lower.match(re);
    if (m) {
      const minutes = fn(m);
      if (minutes > 0) return { minutes, match: m[0] };
    }
  }
  return null;
}

/**
 * Times of day. "around eight twenty" → 20:20 on a closing shift.
 * Hours 1–11 are read as PM on a closing shift; "during lunch around two" → 14:00.
 */
export function parseTimeOfDay(
  text: string,
  shiftKind: "open" | "mid" | "close",
): { minutes: number; match: string; approximate: boolean; trigger: string } | null {
  const lower = text.toLowerCase();
  const re = new RegExp(
    `\\b(around|about|after|at|by|since|before)\\s+(${NUMBER_WORD})(?:\\s+(${NUMBER_WORD}(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?))?(?:\\s*(a\\.?m\\.?|p\\.?m\\.?))?(?!\\s*(?:minutes?|hours?|cases?|sleeves?|degrees|set|of\\b))`,
    "g",
  );
  for (const m of lower.matchAll(re)) {
    // Skip fryer readings like "reading three ninety at three fifty set".
    const idx = m.index ?? 0;
    const after = lower.slice(idx + m[0].length, idx + m[0].length + 6);
    if (/^\s*set/.test(after)) continue;
    const before = lower.slice(Math.max(0, idx - 28), idx);
    if (m[1] === "at" && /\b(reading|read|temp|set to)\b/.test(before)) continue;
    const hour = wordToNumber(m[2]);
    if (hour === null || hour < 1 || hour > 12) continue;
    let minute = 0;
    if (m[3]) {
      const tokens = m[3].split(/\s+/);
      if (tokens[0] === "oh" && tokens[1]) minute = wordToNumber(tokens[1]) ?? 0;
      else minute = parseCompound(tokens)?.value ?? 0;
      if (minute >= 60) continue; // "three fifty" style readings, not times
    }
    let h = hour;
    const meridiem = m[4]?.replace(/\./g, "");
    if (meridiem === "pm" && h < 12) h += 12;
    else if (meridiem === "am" && h === 12) h = 0;
    else if (!meridiem) {
      if (shiftKind === "close" || shiftKind === "mid") {
        if (h < 12) h += 12;
      } else if (h < 5) {
        h += 12; // "by two" on an opening shift = 2 PM
      }
    }
    return { minutes: h * 60 + minute, match: m[0], approximate: m[1] === "around" || m[1] === "about", trigger: m[1] };
  }
  return null;
}

/** "reading three ninety at three fifty set" → { value: 390, setpoint: 350 } */
export function parseReading(text: string): { value: number; setpoint: number | null } | null {
  const lower = text.toLowerCase();
  const m = lower.match(
    new RegExp(`\\b(?:reading|read|at)\\s+(${NUMBER_WORD}(?:\\s+${NUMBER_WORD}){0,2})`),
  );
  if (!m) return null;
  const parsed = parseCompound(m[1].split(/\s+/));
  if (!parsed || parsed.value < 30) return null;
  let setpoint: number | null = null;
  const s =
    lower.match(new RegExp(`\\b(?:at|when set to|set to|set at)\\s+(${NUMBER_WORD}(?:\\s+${NUMBER_WORD}){0,2})(?:\\s+set)?`, "g")) ?? [];
  for (const candidate of s) {
    const words = candidate.replace(/^(at|when set to|set to|set at)\s+/, "").replace(/\s+set$/, "").split(/\s+/);
    const v = parseCompound(words);
    if (v && v.value !== parsed.value && v.value >= 100) setpoint = v.value;
  }
  return { value: parsed.value, setpoint };
}
