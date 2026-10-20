import type { Page } from "@playwright/test";
import { buildSeed, MORNING_ANCHOR, DEMO_ANCHOR, SCHEMA_VERSION } from "../src/data/seed";
import { PRIMARY_ANSWERS } from "../src/data/transcripts";
import { claimTask, completeSetup, confirmItem, createHandoff, itemNeedsReview, processHandoff, publishHandoff } from "../src/domain/commands";
import type { DemoDB } from "../src/domain/types";

export function freshState(): DemoDB {
  const db = buildSeed();
  db.demo.clockSetAtMs = Date.now();
  db.demo.clockFrozen = true;
  return db;
}

/** Tonight's closeout submitted, reviewed and published; Luis at 6:15 AM. */
export function morningState(opts: { claimIce?: boolean; user?: string } = {}): DemoDB {
  const db = freshState();
  const maya = { now: DEMO_ANCHOR, actorId: "u-maya" };
  completeSetup(db, { skipped: false }, { now: "2026-10-20T21:30:00Z", actorId: "u-jordan" });
  const r = createHandoff(
    db,
    {
      locationId: "loc-dtn",
      authorId: "u-maya",
      mode: "guided",
      hasRecording: true,
      answers: PRIMARY_ANSWERS.map((a) => ({ ...a, prompt: db.questions[a.questionId].prompt, source: "voice" as const })),
    },
    maya,
  );
  const id = r.data!.handoffId as string;
  processHandoff(db, { handoffId: id }, { ...maya, now: "2026-10-20T22:41:00Z" });
  for (const i of Object.values(db.items).filter((x) => x.handoffId === id && itemNeedsReview(x))) {
    confirmItem(db, { itemId: i.id }, { ...maya, now: "2026-10-20T22:43:00Z" });
  }
  publishHandoff(db, { handoffId: id }, { ...maya, now: "2026-10-20T22:44:00Z" });
  db.demo.seenTransform.push(id);
  if (opts.claimIce) {
    const t = Object.values(db.tasks).find((x) => x.locationId === "loc-dtn" && x.kind === "service" && x.status !== "done")!;
    claimTask(db, { taskId: t.id }, { now: "2026-10-21T06:14:00Z", actorId: "u-luis" });
  }
  db.demo.clockAnchor = MORNING_ANCHOR;
  db.demo.currentUserId = opts.user ?? "u-luis";
  db.demo.currentLocationId = "loc-dtn";
  return db;
}

export function handoffIdOf(db: DemoDB): string {
  return Object.values(db.handoffs).find((h) => h.locationId === "loc-dtn" && h.createdAt.startsWith("2026-10-20T22:4"))!.id;
}

/** Load a prepared database into localStorage before the app boots (once per test). */
export async function primeState(page: Page, db: DemoDB) {
  await page.addInitScript(
    ([key, json]) => {
      if (!sessionStorage.getItem("sg-seeded")) {
        localStorage.setItem(key, json);
        sessionStorage.setItem("sg-seeded", "1");
      }
    },
    [`shift-ghost:db:v${SCHEMA_VERSION}`, JSON.stringify(db)] as const,
  );
}
