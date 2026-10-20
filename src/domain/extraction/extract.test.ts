import { describe, expect, it } from "vitest";
import { extractTranscript, dedupeDrafts, type DraftItem } from "./extract";
import { joinAnswers, segmentSentences } from "./segment";
import { parseDurationMinutes, parseReading, parseTimeOfDay } from "./numbers";
import { PRIMARY_ANSWERS, PRIMARY_TRANSCRIPT, SEED_TRANSCRIPTS, SAMPLE_TRANSCRIPTS } from "@/data/transcripts";
import { DOWNTOWN_CTX } from "@/test/fixtures";

const BRIEF_TRANSCRIPT =
  "Okay, Downtown close. Ice machine started making that grinding noise again around eight twenty. Bri shut it down for ten minutes and it came back, but the bin is only half full. We have one case of avocado left and Northgate borrowed our last sleeve of large cups. Table twelve says their refund from Friday still hasn’t shown up. Luis needs to call them before lunch. The new dishwasher, Tasha, did great but still needs the chemical test walkthrough. Also the back door sensor flashed twice after ten. I checked the door and it was locked.";

function primary() {
  const { transcript, answers } = joinAnswers(
    PRIMARY_ANSWERS.map((a) => ({ ...a, prompt: a.questionId, source: "seeded" as const })),
  );
  return { transcript, result: extractTranscript(transcript, DOWNTOWN_CTX(answers)) };
}

const byTitle = (items: DraftItem[], re: RegExp) => {
  const found = items.find((i) => re.test(i.title));
  if (!found) throw new Error(`No item matching ${re}: ${items.map((i) => i.title).join(" | ")}`);
  return found;
};

describe("primary demo transcript", () => {
  it("guided answers join back into the brief's transcript exactly", () => {
    expect(PRIMARY_TRANSCRIPT).toBe(BRIEF_TRANSCRIPT);
  });

  it("extracts the five expected items and nothing else", () => {
    const { result } = primary();
    expect(result.items.map((i) => i.title)).toEqual([
      "Ice machine grinding again",
      "Avocado down to 1 case",
      "Large cups out, lent to Northgate",
      "Table 12 refund still not received",
      "Tasha needs the chemical test walkthrough",
      "Back door sensor flashed twice",
    ]);
    expect(result.unmapped).toEqual([]);
    expect(result.context.map((c) => c.text)).toEqual(["Okay, Downtown close."]);
  });

  it("ice machine: recurring grinding, temporary recovery, evidence attached", () => {
    const ice = byTitle(primary().result.items, /Ice machine/);
    expect(ice.kind).toBe("maintenance");
    expect(ice.topic).toBe("refrigeration");
    expect(ice.fields.again).toBe(true);
    expect(ice.fields.recovery).toBe("temporary");
    expect(ice.fields.occurredAt).toBe("2026-10-20T20:20:00Z");
    expect(ice.fields.laborMinutes).toBe(10);
    expect(ice.facts).toContain("Bin only half full");
    expect(ice.evidence.map((e) => e.role)).toEqual(["primary", "context"]);
    expect(ice.confidence).toBe("high");
  });

  it("inventory: avocado at one case, large cups at zero because of a transfer", () => {
    const { result } = primary();
    const avocado = byTitle(result.items, /Avocado/);
    expect(avocado.fields).toMatchObject({ qty: 1, unit: "case", par: 4, stockState: "low" });
    expect(avocado.evidence[0].text).toBe("We have one case of avocado left");

    const cups = byTitle(result.items, /Large cups/);
    expect(cups.fields).toMatchObject({ qty: 0, stockState: "out", transfer: { direction: "out", locationId: "loc-ngt", qty: 1 } });
    expect(cups.evidence[0].text).toBe("Northgate borrowed our last sleeve of large cups");
    // Zero was inferred, not stated, so a person must confirm it.
    expect(cups.confidence).toBe("review");
    expect(cups.inferences[0]).toMatchObject({ field: "On hand", value: "0", material: true });
  });

  it("customer: table 12 refund, owned by Luis, due before lunch, merged instead of duplicated", () => {
    const { result } = primary();
    const refund = byTitle(result.items, /Table 12/);
    expect(refund.kind).toBe("customer");
    expect(refund.subtype).toBe("refund");
    expect(refund.fields.ownerId).toBe("u-luis");
    expect(refund.fields.dueAt).toBe("2026-10-21T11:30:00Z");
    expect(refund.fields.dueLabel).toBe("before lunch");
    expect(refund.mergedKinds).toEqual(["task"]);
    expect(refund.task?.title).toBe("Call Table 12 about the Friday refund");
    expect(result.merges).toEqual([{ text: "Luis needs to call them before lunch.", into: refund.title, also: "task" }]);
    // No separate "call them" task item exists.
    expect(result.items.filter((i) => /call/i.test(i.title))).toHaveLength(0);
  });

  it("training: Tasha's chemical test walkthrough, due before the next rush", () => {
    const training = byTitle(primary().result.items, /Tasha/);
    expect(training.subtype).toBe("training");
    expect(training.task?.title).toBe("Walk Tasha through the chemical test");
    expect(training.task?.dueLabel).toBe("before lunch");
  });

  it("security watch: sensor flashed twice, door manually confirmed locked", () => {
    const sensor = byTitle(primary().result.items, /Back door/);
    expect(sensor.kind).toBe("incident");
    expect(sensor.subtype).toBe("security");
    expect(sensor.severity).toBe("watch");
    expect(sensor.fields.handled).toBe(true);
    expect(sensor.facts).toContain("Door manually confirmed locked");
    expect(sensor.confidence).toBe("review");
    expect(sensor.task).toBeNull();
  });

  it("every evidence span points at the exact transcript text and the right question", () => {
    const { transcript, result } = primary();
    for (const item of result.items) {
      for (const e of item.evidence) {
        expect(transcript.slice(e.start, e.end)).toBe(e.text);
        expect(e.questionId).not.toBeNull();
      }
    }
    expect(byTitle(result.items, /Table 12/).evidence.every((e) => e.questionId === "q-customer")).toBe(true);
  });

  it("keeps the kudos as a crew note rather than a task", () => {
    expect(primary().result.crewNotes.map((c) => c.text)).toEqual([
      "The new dishwasher, Tasha, did great but still needs the chemical test walkthrough.",
    ]);
  });
});

describe("other fixtures", () => {
  const run = (text: string) => extractTranscript(text, DOWNTOWN_CTX());

  it("hedged speech is uncertain, never high", () => {
    const r = run("Chicken is low, maybe two cases left.");
    expect(r.items[0].confidence).toBe("uncertain");
    expect(r.items[0].confidenceReason).toMatch(/maybe/);
    expect(r.items[0].fields.qty).toBe(2);
  });

  it("an all-clear report is not a fault", () => {
    const r = extractTranscript("Northgate close. Fryer two held three fifty all night, no drift.", DOWNTOWN_CTX());
    expect(r.items[0].fields.assertion).toBe("ok");
    expect(r.items[0].task).toBeNull();
  });

  it("derives a fault from a reading above setpoint", () => {
    const r = run("Fryer two reading three eighty when set to three fifty, I think the thermostat is going.");
    expect(r.items[0].title).toBe("Fryer 2 running hot");
    expect(r.items[0].fields.reading).toMatchObject({ value: 380, setpoint: 350 });
    expect(r.items[0].confidence).toBe("uncertain");
  });

  it("splits one sentence into two stock items by clause", () => {
    const r = run("We need to order limes and napkins.");
    expect(r.items.map((i) => i.fields.itemKey)).toEqual(["limes", "napkins"]);
    expect(r.items.every((i) => i.fields.stockState === "order")).toBe(true);
  });

  it("reads an incoming transfer as a shortage with a counterpart store", () => {
    const r = run("We ran out of large cups at seven and borrowed a sleeve from Canyon Plaza.");
    expect(r.items[0].fields).toMatchObject({ stockState: "out", transfer: { direction: "in", locationId: "loc-cyp", qty: 1 } });
    expect(r.items[0].fields.occurredAt).toBe("2026-10-20T19:00:00Z");
  });

  it("sends sentences it can't classify to the unmapped tray instead of dropping them", () => {
    const r = run("Oil change done. Walk-in reading forty two around ten.");
    expect(r.unmapped.map((u) => u.text)).toEqual(["Oil change done."]);
    expect(r.items).toHaveLength(1);
  });

  it("injury mentions become a safety incident", () => {
    const r = run("Jess cut her finger on the mandoline, first aid done and she finished the shift.");
    expect(r.items[0]).toMatchObject({ kind: "incident", subtype: "safety" });
  });

  it("extracts at least one item from every seeded closeout, with valid evidence", () => {
    for (const t of [...SEED_TRANSCRIPTS, ...SAMPLE_TRANSCRIPTS]) {
      const r = run(t.text);
      expect(r.items.length, t.id).toBeGreaterThan(0);
      for (const item of r.items) for (const e of item.evidence) expect(t.text.slice(e.start, e.end)).toBe(e.text);
    }
  });
});

describe("deduplication", () => {
  it("folds two mentions of the same subject in one closeout into a single item", () => {
    const r = extractTranscript(
      "Ice machine was grinding around nine. Later the ice machine jammed and we spent twenty minutes clearing it.",
      DOWNTOWN_CTX(),
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].evidence).toHaveLength(2);
    expect(r.items[0].fields.laborMinutes).toBe(20);
  });

  it("dedupeDrafts keeps the higher severity and the lower confidence", () => {
    const base = extractTranscript("Ice machine grinding around nine.", DOWNTOWN_CTX()).items[0];
    const hedged = { ...structuredClone(base), key: "x", severity: "critical" as const, confidence: "uncertain" as const };
    const [merged] = dedupeDrafts([structuredClone(base), hedged]);
    expect(merged.severity).toBe("critical");
    expect(merged.confidence).toBe("uncertain");
  });
});

describe("spoken numbers", () => {
  it("parses closing-shift times as PM", () => {
    expect(parseTimeOfDay("around eight twenty", "close")?.minutes).toBe(20 * 60 + 20);
    expect(parseTimeOfDay("after ten", "close")?.minutes).toBe(22 * 60);
    expect(parseTimeOfDay("during lunch around two", "close")?.minutes).toBe(14 * 60);
  });
  it("does not mistake a fryer reading for a time", () => {
    expect(parseTimeOfDay("reading three ninety at three fifty set", "close")).toBeNull();
    expect(parseReading("reading three seventy five at three fifty")).toEqual({ value: 375, setpoint: 350 });
  });
  it("parses durations", () => {
    expect(parseDurationMinutes("we lost half an hour")?.minutes).toBe(30);
    expect(parseDurationMinutes("took twenty five minutes")?.minutes).toBe(25);
    expect(parseDurationMinutes("spent an hour clearing it")?.minutes).toBe(60);
  });
  it("segments sentences with offsets", () => {
    const s = segmentSentences("One. Two two!  Three?");
    expect(s.map((x) => x.text)).toEqual(["One.", "Two two!", "Three?"]);
    expect(s[2].start).toBe(15);
  });
});
