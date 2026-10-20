import { buildSeed, DEMO_ANCHOR } from "@/data/seed";
import { PRIMARY_ANSWERS } from "@/data/transcripts";
import { buildExtractionContext, confirmItem, createHandoff, itemNeedsReview, processHandoff, publishHandoff, type Ctx } from "@/domain/commands";
import type { DemoDB } from "@/domain/types";
import type { ExtractionContext } from "@/domain/extraction/extract";
import { joinAnswers } from "@/domain/extraction/segment";

export const MAYA: Ctx = { now: DEMO_ANCHOR, actorId: "u-maya" };

export const DOWNTOWN_CTX = (answers = joinAnswers([]).answers): ExtractionContext => ({
  locationId: "loc-dtn",
  location: {
    name: "Downtown",
    doorsOpen: "10:30",
    lunchRush: "11:30",
    pars: { avocado: { qty: 4, unit: "case" }, "cups-large": { qty: 6, unit: "sleeve" }, chicken: { qty: 6, unit: "case" } },
  },
  shiftKind: "close",
  shiftDate: "2026-10-20",
  nextOpenDate: "2026-10-21",
  roster: [
    { id: "u-maya", firstName: "Maya" },
    { id: "u-luis", firstName: "Luis" },
    { id: "u-bri", firstName: "Bri" },
    { id: "c-tasha", firstName: "Tasha" },
    { id: "c-jess", firstName: "Jess" },
  ],
  answers,
  rushQuestionId: "q-rush",
});

export function primaryGuidedAnswers(db: DemoDB) {
  return PRIMARY_ANSWERS.map((a) => ({ ...a, prompt: db.questions[a.questionId].prompt, source: "seeded" as const }));
}

/** Seed + submit + extract tonight's Downtown closeout. Returns the handoff id. */
export function submitPrimary(db: DemoDB = buildSeed()): { db: DemoDB; handoffId: string } {
  const r = createHandoff(db, { locationId: "loc-dtn", authorId: "u-maya", mode: "guided", hasRecording: true, answers: primaryGuidedAnswers(db) }, MAYA);
  const handoffId = r.data!.handoffId as string;
  processHandoff(db, { handoffId }, MAYA);
  return { db, handoffId };
}

export function publishPrimary(): { db: DemoDB; handoffId: string } {
  const { db, handoffId } = submitPrimary();
  for (const item of Object.values(db.items).filter((i) => i.handoffId === handoffId && itemNeedsReview(i))) {
    confirmItem(db, { itemId: item.id }, MAYA);
  }
  publishHandoff(db, { handoffId }, MAYA);
  return { db, handoffId };
}

export { buildExtractionContext };
