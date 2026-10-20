import { loadFont as loadArchivoNarrow } from "@remotion/google-fonts/ArchivoNarrow";
import { loadFont as loadPlexSans } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadPlexMono } from "@remotion/google-fonts/IBMPlexMono";

/** Brand tokens shared with the Shift Ghost app (see DECISIONS D-20). */
export const C = {
  night: "#0B1017",
  surface: "#141C27",
  raised: "#1C2633",
  line: "#273343",
  paper: "#E9E4D6",
  paperShade: "#D9D2C0",
  ink: "#1A1A17",
  orange: "#FF6B1A",
  silver: "#B7BFC8",
  muted: "#8C97A4",
  red: "#FF4A3D",
  paperRed: "#B3261E",
  amber: "#FFB020",
  green: "#39D98A",
} as const;

const display = loadArchivoNarrow("normal", { weights: ["500", "600", "700"], subsets: ["latin"] });
const body = loadPlexSans("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const mono = loadPlexMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const F = {
  display: display.fontFamily,
  body: body.fontFamily,
  /** Timestamps and durations only. */
  mono: mono.fontFamily,
} as const;
