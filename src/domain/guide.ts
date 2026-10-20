import type { DemoDB, GuideStep, ISO } from "./types";
import { toMs } from "./time";
import { SEED_TRANSCRIPTS } from "@/data/transcripts";

export interface GuideItem {
  step: GuideStep;
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

const SEEDED = new Set(SEED_TRANSCRIPTS.map((t) => t.id));

export function tonightsHandoff(db: DemoDB) {
  return Object.values(db.handoffs)
    .filter((h) => h.locationId === "loc-dtn" && !SEEDED.has(h.id) && db.shiftInstances[h.shiftInstanceId]?.date === "2026-10-20")
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))[0];
}

/** The four-minute acceptance story, derived from real state wherever possible. */
export function guideProgress(db: DemoDB, now: ISO): GuideItem[] {
  const h = tonightsHandoff(db);
  const published = h?.status === "published";
  const luisTasks = Object.values(db.tasks).filter((t) => t.locationId === "loc-dtn" && h && t.itemIds.some((id) => db.items[id]?.handoffId === h.id));
  const claimed = (pred: (title: string) => boolean) => luisTasks.some((t) => pred(t.title) && (t.claimedById === "u-luis" || t.resolvedById === "u-luis"));
  return [
    { step: "configure", label: "Configure Nightjar Kitchens", hint: "Five-step setup, or skip with defaults", href: "/setup", done: Boolean(db.setup.completedAt) },
    { step: "submit", label: "Submit tonight's closeout as Maya", hint: "Record, type, or use the seeded answers", href: "/capture", done: Boolean(h) && h.status !== "draft" },
    { step: "confirm", label: "Confirm or correct the extraction", hint: "Two items need a person; publish to the opening crew", href: h ? `/handoffs/${h.id}` : "/capture", done: published },
    { step: "switch", label: "Switch to Luis the next morning", hint: "Opening manager, 6:15 AM", href: "/briefing", done: db.demo.currentUserId === "u-luis" && toMs(now) >= toMs("2026-10-21T06:00:00Z") },
    { step: "claim", label: "Claim the refund call and the ice machine", hint: "Optimistic, with undo", href: "/briefing", done: claimed((t) => /Table 12/.test(t)) && claimed((t) => /ice machine/i.test(t)) },
    { step: "pattern", label: "Discover the recurring ice machine problem", hint: "Six mentions in nine days", href: "/patterns", done: Boolean(db.demo.guide.pattern) },
    { step: "explainer", label: "Play the 45-second explainer", hint: "Remotion, 16:9 and 9:16", href: "/explainer", done: Boolean(db.demo.guide.explainer) },
  ];
}
