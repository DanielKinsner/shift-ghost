import { z } from "zod";

export const EXPLAINER_FPS = 30;
export const EXPLAINER_DURATION = 1350; // 45 s

export const explainerSchema = z.object({
  company: z.string(),
  location: z.string(),
  closer: z.string(),
  opener: z.string(),
  tagline: z.string(),
  answers: z
    .array(
      z.object({
        question: z.string(),
        text: z.string(),
        kind: z.string(),
        result: z.string(),
      }),
    )
    .length(5),
  items: z
    .array(
      z.object({
        kind: z.string(),
        title: z.string(),
        sentence: z.string(),
        evidence: z.string(),
        confidence: z.enum(["high", "review", "uncertain"]),
        time: z.string(),
      }),
    )
    .length(4),
  tasks: z.array(z.object({ title: z.string(), due: z.string(), claimedAt: z.string() })).length(3),
  pattern: z.object({
    mentions: z.number(),
    days: z.number(),
    afterEight: z.number(),
    crewHours: z.number(),
  }),
});

export type ExplainerProps = z.infer<typeof explainerSchema>;

export const defaultExplainerProps: ExplainerProps = {
  company: "Nightjar Kitchens",
  location: "Downtown",
  closer: "Maya Chen",
  opener: "Luis Ortega",
  tagline: "Every shift leaves the next one smarter.",
  answers: [
    { question: "What broke or behaved unusually?", text: "Ice machine started grinding again around 8:20…", kind: "Maintenance", result: "Ice machine grinding again" },
    { question: "What ran low?", text: "One case of avocado left. Northgate took our last sleeve of large cups.", kind: "Inventory", result: "Avocado 1 case · large cups 0" },
    { question: "Which customer issue is still open?", text: "Table 12's refund from Friday still hasn't shown up.", kind: "Customer", result: "Call Table 12 · Luis · before lunch" },
    { question: "What must happen before the next rush?", text: "Tasha still needs the chemical test walkthrough.", kind: "Next-shift task", result: "Walk Tasha through the chemical test" },
    { question: "What will the next manager be angry not to know?", text: "Back door sensor flashed twice. I checked, it was locked.", kind: "Incident", result: "Back door sensor · confirmed locked" },
  ],
  items: [
    {
      kind: "Maintenance",
      title: "Ice machine grinding again",
      sentence: "Ice machine started making that grinding noise again around eight twenty.",
      evidence: "grinding noise again around eight twenty",
      confidence: "high",
      time: "20:20",
    },
    {
      kind: "Inventory",
      title: "Large cups out, lent to Northgate",
      sentence: "We have one case of avocado left and Northgate borrowed our last sleeve of large cups.",
      evidence: "Northgate borrowed our last sleeve of large cups",
      confidence: "review",
      time: "22:40",
    },
    {
      kind: "Customer",
      title: "Table 12 refund still not received",
      sentence: "Table twelve says their refund from Friday still hasn’t shown up.",
      evidence: "refund from Friday still hasn’t shown up",
      confidence: "high",
      time: "22:40",
    },
    {
      kind: "Security",
      title: "Back door sensor flashed twice",
      sentence: "Also the back door sensor flashed twice after ten. I checked the door and it was locked.",
      evidence: "back door sensor flashed twice after ten",
      confidence: "review",
      time: "22:00",
    },
  ],
  tasks: [
    { title: "Call Table 12 about the Friday refund", due: "11:30 · before lunch", claimedAt: "06:19" },
    { title: "Check ice machine before open", due: "10:30 · before doors", claimedAt: "06:24" },
    { title: "Prep order: avocado, large cups", due: "10:30 · before doors", claimedAt: "06:31" },
  ],
  pattern: { mentions: 6, days: 9, afterEight: 5, crewHours: 3.5 },
};
