import { z } from "zod";

/**
 * Mock transcripts, validated with Zod on import so a malformed fixture fails loudly
 * instead of producing a half-empty demo.
 */
export const SeedTranscriptSchema = z.object({
  id: z.string().regex(/^ho-[a-z]{3}-\d{4}$/),
  locationId: z.enum(["loc-dtn", "loc-ngt", "loc-cyp"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  authorId: z.string().min(1),
  submittedAt: z.string().regex(/^\d{2}:\d{2}$/),
  text: z.string().min(10).max(2000),
});
export type SeedTranscript = z.infer<typeof SeedTranscriptSchema>;

export const GuidedAnswerSchema = z.object({
  questionId: z.string(),
  text: z.string().min(1),
  durationSec: z.number().positive(),
});

/**
 * Tonight's Downtown closeout (Maya Chen), split across the five closeout questions.
 * Joined with single spaces, the answers equal the brief's primary transcript exactly.
 */
export const PRIMARY_ANSWERS = z.array(GuidedAnswerSchema).length(5).parse([
  {
    questionId: "q-broke",
    text: "Okay, Downtown close. Ice machine started making that grinding noise again around eight twenty. Bri shut it down for ten minutes and it came back, but the bin is only half full.",
    durationSec: 24,
  },
  {
    questionId: "q-low",
    text: "We have one case of avocado left and Northgate borrowed our last sleeve of large cups.",
    durationSec: 11,
  },
  {
    questionId: "q-customer",
    text: "Table twelve says their refund from Friday still hasn’t shown up. Luis needs to call them before lunch.",
    durationSec: 13,
  },
  {
    questionId: "q-rush",
    text: "The new dishwasher, Tasha, did great but still needs the chemical test walkthrough.",
    durationSec: 10,
  },
  {
    questionId: "q-angry",
    text: "Also the back door sensor flashed twice after ten. I checked the door and it was locked.",
    durationSec: 12,
  },
]);

export const PRIMARY_TRANSCRIPT = PRIMARY_ANSWERS.map((a) => a.text).join(" ");

const raw: SeedTranscript[] = [
  // ── Downtown (Maya closes most nights)
  { id: "ho-dtn-1012", locationId: "loc-dtn", date: "2026-10-12", authorId: "u-maya", submittedAt: "22:51", text: "Downtown close. Ice machine was grinding around nine forty and we spent about forty minutes bagging ice from the bar. Chicken is low, maybe two cases left. Marco did great on the line." },
  { id: "ho-dtn-1013", locationId: "loc-dtn", date: "2026-10-13", authorId: "u-maya", submittedAt: "22:44", text: "Downtown close. Fryer one was running hot around seven, reading three ninety at three fifty set. I turned it down and it held. Mop sink is leaking under the drain." },
  { id: "ho-dtn-1014", locationId: "loc-dtn", date: "2026-10-14", authorId: "u-maya", submittedAt: "22:48", text: "Downtown close. Ice machine grinding again around eight fifty and we lost half an hour hauling ice from the bar. Northgate borrowed two sleeves of large cups. Table four wants a call back about a catering order for Friday." },
  { id: "ho-dtn-1015", locationId: "loc-dtn", date: "2026-10-15", authorId: "u-luis", submittedAt: "22:57", text: "Downtown close. Ice machine jammed around ten fifteen and Bri spent an hour clearing it and cleaning the bin. We're out of cilantro. Mop sink is still leaking, plumber is booked for Thursday." },
  { id: "ho-dtn-1016", locationId: "loc-dtn", date: "2026-10-16", authorId: "u-maya", submittedAt: "23:02", text: "Downtown close. Table twelve was charged twice; I started a refund. Back door alarm chirped once around eleven. I walked it and the door was locked. Avocados are at three cases. Friday's catering order for table four is confirmed." },
  { id: "ho-dtn-1017", locationId: "loc-dtn", date: "2026-10-17", authorId: "u-maya", submittedAt: "22:46", text: "Downtown close. Ice machine was grinding again around eight thirty. Took twenty five minutes to reset it. Tasha's first night on dish went fine." },
  { id: "ho-dtn-1018", locationId: "loc-dtn", date: "2026-10-18", authorId: "u-maya", submittedAt: "22:39", text: "Downtown close. The ice machine started grinding during lunch around two and we lost forty five minutes on ice runs. Fryer one held temp all day. Large cups are low." },
  { id: "ho-dtn-1019", locationId: "loc-dtn", date: "2026-10-19", authorId: "u-maya", submittedAt: "22:42", text: "Downtown close. Quiet night. Mop sink is fixed, plumber came today. We need to order to-go bags before the weekend." },

  // ── Northgate (Dev Patel closes)
  { id: "ho-ngt-1012", locationId: "loc-ngt", date: "2026-10-12", authorId: "u-dev", submittedAt: "22:35", text: "Northgate close. Fryer two was drifting hot again, reading three seventy five at three fifty. Low on lids. Priya did great on register." },
  { id: "ho-ngt-1013", locationId: "loc-ngt", date: "2026-10-13", authorId: "u-dev", submittedAt: "22:40", text: "Northgate close. Soda fountain is leaking at the base. We ran out of large cups at seven and borrowed a sleeve from Canyon Plaza." },
  { id: "ho-ngt-1014", locationId: "loc-ngt", date: "2026-10-14", authorId: "u-dev", submittedAt: "22:31", text: "Northgate close. Fryer two ran hot again around six. We borrowed two sleeves of large cups from Downtown." },
  { id: "ho-ngt-1015", locationId: "loc-ngt", date: "2026-10-15", authorId: "u-dev", submittedAt: "22:52", text: "Northgate close. Ticket printer jammed twice during dinner. Jess called out, so we were short one on the line." },
  { id: "ho-ngt-1016", locationId: "loc-ngt", date: "2026-10-16", authorId: "u-dev", submittedAt: "22:38", text: "Northgate close. Fryer two reading three eighty when set to three fifty, I think the thermostat is going." },
  { id: "ho-ngt-1017", locationId: "loc-ngt", date: "2026-10-17", authorId: "u-sam", submittedAt: "22:49", text: "Northgate close. Fryer two held three fifty all night, no drift. Rice is low." },
  { id: "ho-ngt-1018", locationId: "loc-ngt", date: "2026-10-18", authorId: "u-dev", submittedAt: "22:33", text: "Northgate close. Large cups are low again. Hood fan is making a rattling noise." },
  { id: "ho-ngt-1019", locationId: "loc-ngt", date: "2026-10-19", authorId: "u-dev", submittedAt: "22:41", text: "Northgate close. Fryer two drifting hot around eight. Oil change done. Lids restocked." },
  { id: "ho-ngt-1020", locationId: "loc-ngt", date: "2026-10-20", authorId: "u-dev", submittedAt: "22:05", text: "Northgate close. We borrowed the last sleeve of large cups from Downtown. Fryer two was fine tonight." },

  // ── Canyon Plaza (Renée Alvarez closes)
  { id: "ho-cyp-1012", locationId: "loc-cyp", date: "2026-10-12", authorId: "u-renee", submittedAt: "22:58", text: "Canyon Plaza close. Walk-in cooler was reading thirty nine around nine, I moved the dairy to the reach-in. Tortillas are low." },
  { id: "ho-cyp-1013", locationId: "loc-cyp", date: "2026-10-13", authorId: "u-renee", submittedAt: "22:47", text: "Canyon Plaza close. Dish machine is not reaching temp, we used the three compartment sink. Eli did great on prep." },
  { id: "ho-cyp-1014", locationId: "loc-cyp", date: "2026-10-14", authorId: "u-renee", submittedAt: "22:36", text: "Canyon Plaza close. Smooth night. We need to order limes and napkins." },
  { id: "ho-cyp-1015", locationId: "loc-cyp", date: "2026-10-15", authorId: "u-renee", submittedAt: "22:44", text: "Canyon Plaza close. Walk-in alarm went off around nine but the probe was unplugged. Temp was thirty six. Plugged it back in." },
  { id: "ho-cyp-1016", locationId: "loc-cyp", date: "2026-10-16", authorId: "u-renee", submittedAt: "22:50", text: "Canyon Plaza close. Out of large cups by close. Card reader at register two keeps dropping." },
  { id: "ho-cyp-1017", locationId: "loc-cyp", date: "2026-10-17", authorId: "u-kofi", submittedAt: "22:43", text: "Canyon Plaza close. Walk-in reading thirty eight around eight. Dairy delivery is short two cases of sour cream." },
  { id: "ho-cyp-1018", locationId: "loc-cyp", date: "2026-10-18", authorId: "u-renee", submittedAt: "22:37", text: "Canyon Plaza close. Guest at table seven complained about a hair in their bowl, we comped it and apologized." },
  { id: "ho-cyp-1019", locationId: "loc-cyp", date: "2026-10-19", authorId: "u-renee", submittedAt: "22:45", text: "Canyon Plaza close. Hood fan is loud again. Queso is low." },
  { id: "ho-cyp-1020", locationId: "loc-cyp", date: "2026-10-20", authorId: "u-renee", submittedAt: "21:58", text: "Canyon Plaza close. Quiet night. Card reader at register two is still dropping, I rebooted it twice." },
];

export const SEED_TRANSCRIPTS: SeedTranscript[] = z.array(SeedTranscriptSchema).parse(raw);

/** Closeouts the demo drawer can inject, and samples for the rule test panel. */
export const SAMPLE_TRANSCRIPTS = z
  .array(z.object({ id: z.string(), label: z.string(), locationId: z.string(), authorId: z.string(), text: z.string().min(10) }))
  .parse([
    {
      id: "sample-ngt-uncertain",
      label: "Northgate close · unsure closer",
      locationId: "loc-ngt",
      authorId: "u-dev",
      text: "Northgate close. Fryer two drifting hot again, I think around nine, reading three eighty. We're almost out of large cups, maybe half a sleeve. Someone said the walk-in door is leaking cold air, not sure which one. Jess cut her finger on the mandoline, first aid done and she finished the shift.",
    },
    {
      id: "sample-cyp-cooler",
      label: "Canyon Plaza close · walk-in warm",
      locationId: "loc-cyp",
      authorId: "u-renee",
      text: "Canyon Plaza close. Walk-in cooler reading forty two around ten, I moved the dairy to the reach-in. Out of sour cream. Table nine wants a refund for a missing catering tray. Kofi needs to call them before lunch.",
    },
  ]);
