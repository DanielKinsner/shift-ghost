import { z } from "zod";

/** Zod schemas for every form in the app. Messages are written for the person filling the form. */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, like 22:45");

export const CompanySchema = z.object({
  name: z.string().trim().min(2, "Give the company a name").max(60, "Keep it under 60 characters"),
  industry: z.string().min(1),
});

export const LocationFormSchema = z.object({
  name: z.string().trim().min(2, "Name the store").max(40, "Keep it under 40 characters"),
  address: z.string().trim().min(5, "Add a street address").max(90),
  doorsOpen: hhmm,
  lunchRush: hhmm,
});

export const ShiftFormSchema = z
  .object({
    openStart: hhmm,
    openEnd: hhmm,
    closeStart: hhmm,
    closeEnd: hhmm,
    closeoutDue: hhmm,
    briefAt: hhmm,
  })
  .refine((v) => v.closeoutDue <= v.closeEnd && v.closeoutDue >= v.closeStart, { message: "The closeout has to be due during the closing shift", path: ["closeoutDue"] })
  .refine((v) => v.briefAt >= v.openStart && v.briefAt < v.openEnd, { message: "Deliver the brief during the opening shift", path: ["briefAt"] })
  .refine((v) => v.openEnd > v.openStart, { message: "The opening shift has to end after it starts", path: ["openEnd"] });

export const QuestionsSchema = z
  .array(z.object({ prompt: z.string().trim().min(8, "Questions need at least a few words").max(140, "Keep each question under 140 characters"), hint: z.string().max(140) }))
  .length(5, "Pick exactly five questions. Five keeps a closeout near two minutes.")
  .refine((qs) => new Set(qs.map((q) => q.prompt.toLowerCase())).size === qs.length, "Each question should be different");

export const ThresholdsSchema = z.object({
  escalateUnackedCriticalMinutes: z.coerce.number().int().min(5, "At least 5 minutes").max(240, "At most 4 hours"),
  patternMinMentions: z.coerce.number().int().min(2, "At least 2 mentions").max(10, "At most 10"),
  patternWindowDays: z.coerce.number().int().min(3, "At least 3 days").max(60, "At most 60 days"),
  lowStockPercentOfPar: z.coerce.number().int().min(10).max(100),
});

export const RetentionSchema = z.object({
  audioDays: z.coerce.number().int().min(1, "Keep audio at least a day").max(365, "At most a year"),
  transcriptDays: z.coerce.number().int().min(30, "Keep transcripts at least 30 days").max(1095, "At most three years"),
});

export const InviteSchema = z.object({
  name: z.string().trim().min(3, "Add their full name").max(60).regex(/\s/, "Add a first and last name"),
  role: z.enum(["closing_manager", "opening_manager", "kitchen_lead", "area_manager"]),
  locationId: z.string().min(1),
  contact: z
    .string()
    .trim()
    .refine((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || /^\+?[\d\s().-]{10,}$/.test(v), "Enter an email address or a mobile number"),
});

export const AskSchema = z.object({ body: z.string().trim().min(3, "Ask a question").max(280, "Keep it under 280 characters") });

export const EscalateSchema = z.object({
  toUserId: z.string().min(1, "Choose who to escalate to"),
  channel: z.enum(["sms", "push", "email", "team_chat"]),
  note: z.string().trim().max(280, "Keep the note under 280 characters"),
});

export const ResolveSchema = z.object({ note: z.string().trim().max(280, "Keep the note under 280 characters") });

export const CorrectionSchema = z.object({
  title: z.string().trim().min(3, "Describe the item").max(120),
  severity: z.enum(["critical", "high", "normal", "watch"]),
  qty: z.union([z.literal(""), z.coerce.number().min(0, "Can't be negative").max(999)]).optional(),
  note: z.string().trim().max(200).optional(),
});

export const DismissSchema = z.object({ reason: z.string().trim().min(3, "Say why, so the closer can learn from it").max(200) });

export const RuleFormSchema = z.object({
  name: z.string().trim().min(3, "Name the rule").max(60),
  condition: z.discriminatedUnion("type", [
    z.object({ type: z.literal("mentions"), topic: z.enum(["refrigeration", "fire", "safety", "security", "water", "customer_money", "cooking"]) }),
    z.object({ type: z.literal("below_par"), itemKey: z.string().min(1) }),
    z.object({ type: z.literal("open_at"), subject: z.enum(["refund", "customer", "any_task"]), time: hhmm }),
    z.object({ type: z.literal("uncertain") }),
  ]),
  actions: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("set_severity"), severity: z.enum(["critical", "high", "normal", "watch"]) }),
        z.object({ type: z.literal("notify"), role: z.enum(["closing_manager", "opening_manager", "kitchen_lead", "area_manager"]), channel: z.enum(["sms", "push", "email", "team_chat"]) }),
        z.object({ type: z.literal("create_task"), template: z.enum(["order_prep", "service_call", "callback"]) }),
        z.object({ type: z.literal("escalate"), role: z.enum(["closing_manager", "opening_manager", "kitchen_lead", "area_manager"]) }),
        z.object({ type: z.literal("require_confirmation") }),
      ]),
    )
    .min(1, "Add at least one thing the rule should do"),
  locationIds: z.union([z.literal("all"), z.array(z.string()).min(1, "Pick at least one store")]),
  enabled: z.boolean(),
});

export const CaptureAnswerSchema = z.object({
  text: z.string().trim().min(2, "Say or type an answer, or skip this question").max(1500, "That's a long answer. Split it across questions."),
});

/** Flatten a Zod error into { field: message } for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
