import type { RuleTopic, Topic } from "../types";

/**
 * The extraction engine's vocabulary. Kept as data so an operator could tune it
 * per industry (a warehouse would swap fryers for forklifts and dock doors).
 */

export interface AssetDef {
  key: string;
  label: string;
  re: RegExp;
  topic: Topic;
  /** "fryer two" → key "fryer-2", label "Fryer 2" */
  numbered?: boolean;
}

export const ASSETS: AssetDef[] = [
  { key: "ice-machine", label: "Ice machine", re: /\bice (?:machine|maker)\b/i, topic: "refrigeration" },
  { key: "walk-in", label: "Walk-in cooler", re: /\bwalk-?in(?: cooler| freezer)?\b/i, topic: "refrigeration" },
  { key: "reach-in", label: "Reach-in cooler", re: /\breach-?in(?: cooler)?\b/i, topic: "refrigeration" },
  { key: "fryer", label: "Fryer", re: /\bfryer(?:\s+(one|two|three|four|1|2|3|4))?\b(?!\s+oil)/i, topic: "cooking", numbered: true },
  { key: "dish-machine", label: "Dish machine", re: /\bdish machine\b/i, topic: "sanitation" },
  { key: "back-door-sensor", label: "Back door sensor", re: /\bback door (?:sensor|alarm)\b/i, topic: "security" },
  { key: "hood-fan", label: "Hood fan", re: /\b(?:hood|exhaust) fan\b/i, topic: "fire" },
  { key: "soda-fountain", label: "Soda fountain", re: /\bsoda (?:fountain|machine)\b/i, topic: "beverage" },
  { key: "mop-sink", label: "Mop sink", re: /\bmop sink\b/i, topic: "water" },
  { key: "ticket-printer", label: "Ticket printer", re: /\b(?:ticket|kitchen) printer\b/i, topic: "tech" },
  { key: "card-reader", label: "Card reader", re: /\bcard reader\b/i, topic: "tech" },
  { key: "flat-top", label: "Flat-top grill", re: /\bflat-?top\b/i, topic: "cooking" },
];

export interface StockDef {
  key: string;
  label: string;
  re: RegExp;
  unit: string;
}

export const STOCK: StockDef[] = [
  { key: "avocado", label: "Avocado", re: /\bavocados?\b/i, unit: "case" },
  { key: "cups-large", label: "Large cups", re: /\blarge cups?\b/i, unit: "sleeve" },
  { key: "lids", label: "Cup lids", re: /\blids\b/i, unit: "sleeve" },
  { key: "chicken", label: "Chicken", re: /\bchicken\b/i, unit: "case" },
  { key: "tortillas", label: "Tortillas", re: /\btortillas?\b/i, unit: "case" },
  { key: "limes", label: "Limes", re: /\blimes?\b/i, unit: "case" },
  { key: "cilantro", label: "Cilantro", re: /\bcilantro\b/i, unit: "case" },
  { key: "rice", label: "Rice", re: /\brice\b/i, unit: "bag" },
  { key: "to-go-bags", label: "To-go bags", re: /\bto-?go bags?\b/i, unit: "case" },
  { key: "napkins", label: "Napkins", re: /\bnapkins?\b/i, unit: "case" },
  { key: "queso", label: "Queso", re: /\bqueso\b/i, unit: "bag" },
  { key: "sour-cream", label: "Sour cream", re: /\bsour cream\b/i, unit: "case" },
  { key: "fryer-oil", label: "Fryer oil", re: /\bfryer oil\b/i, unit: "jug" },
];

export const UNIT_RE = /\b(case|cases|sleeve|sleeves|bag|bags|box|boxes|jug|jugs|bunch|bunches)\b/i;

export const FAILURE: { re: RegExp; phrase: string; short: string; ifPhrase: string }[] = [
  { re: /\bgrind(?:ing)?\b/i, phrase: "grinding", short: "grinding", ifPhrase: "the grinding returns" },
  { re: /\bjamm?ed\b/i, phrase: "jammed", short: "jams", ifPhrase: "it jams again" },
  { re: /\bleak(?:ing|s)?\b/i, phrase: "leaking", short: "leaks", ifPhrase: "the leak continues" },
  { re: /\b(?:drift(?:ing)?|running hot|ran hot|runs hot)\b/i, phrase: "running hot", short: "drift", ifPhrase: "it keeps running hot" },
  { re: /\breading (?:thirty|forty)\b/i, phrase: "running warm", short: "warm readings", ifPhrase: "it reads above 38°F again" },
  { re: /\bnot reaching temp\b/i, phrase: "not reaching temp", short: "temp problems", ifPhrase: "it stays under temp" },
  { re: /\bflash(?:ed|ing)\b/i, phrase: "flashed", short: "alerts", ifPhrase: "alerts continue" },
  { re: /\b(?:alarm went off|alarm(?:ed)?|chirp(?:ed|ing)?|beep(?:ed|ing)?)\b/i, phrase: "alarm", short: "alerts", ifPhrase: "alerts continue" },
  { re: /\brattl(?:e|ing)\b/i, phrase: "rattling", short: "rattling", ifPhrase: "the rattle continues" },
  { re: /\bloud\b/i, phrase: "running loud", short: "noise", ifPhrase: "the noise continues" },
  { re: /\bdropping\b/i, phrase: "dropping connections", short: "drops", ifPhrase: "it keeps dropping" },
  { re: /\b(?:not working|broke(?:n)?|stopped working|died|is down)\b/i, phrase: "not working", short: "failures", ifPhrase: "it fails again" },
  { re: /\bmaking (?:a |that )?(?:\w+ )?noise\b/i, phrase: "making noise", short: "noise", ifPhrase: "the noise continues" },
];

export const OK_REPORT = /\b(?:held(?: temp| three| \w+)?|no drift|was fine|is fine|running fine|working fine|fixed|back to normal|no issues)\b/i;
export const RECOVERY = /\b(?:came back|came back on|back up|restarted|reset it|rebooted|plugged it back in)\b/i;
export const HANDLED = /\b(?:checked|walked it|verified|confirmed|tested)\b[^.]*\b(?:locked|secure|fine|okay|ok|normal)\b|\bplugged it back in\b|\bwe comped\b|\bapologized\b/i;
export const AGAIN = /\b(?:again|still)\b/i;

export const HEDGES = /\b(?:i think|i'm not sure|not sure|maybe|might|kind of|sort of|probably|i guess|possibly|seemed like|i don't know|could be|someone said)\b/i;

export const CUSTOMER = /\b(?:refund|charged twice|overcharged|complain(?:ed|t)?|catering order|call back|callback|hair in|wrong order|allergy|comped)\b/i;
export const TABLE = /\btable (\w+)\b/i;
export const DAY_REF = /\bfrom (monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|last week)\b/i;

export const TRAINING =
  /\b(?:still )?needs? (?:the |a |her |his |their )?([\w-]+(?: [\w-]+){0,2}?) (walkthrough|training|refresher|sign-?off)\b/i;

export const STAFFING = /\b(called out|call-?out|no-?show|short(?:-| )staffed|short one)\b/i;

export const KUDOS = /\b(?:did great|great job|crushed it|killed it|shout ?out|was awesome|went fine)\b/i;

export const SAFETY = /\b(?:cut (?:his|her|their) (?:hand|finger)|burned (?:his|her|their)|slipp?ed|fell|first aid|injur(?:y|ed))\b/i;

export const SECURITY_GENERIC = /\b(?:door|sensor|alarm|unlocked|camera|safe|window)\b/i;

export const STOCK_SIGNAL =
  /\b(?:left|low|out of|ran out|run(?:ning)? out|86(?:'?d)?|short|order|borrowed|lent|last (?:case|sleeve|bag|box)|only \w+ (?:case|sleeve|bag)|at \w+ (?:case|sleeve|bag)s?|restocked|almost out)\b/i;

export const CONTEXT_ONLY =
  /^(?:okay|ok|alright|so|um|uh)?[,\s]*(?:downtown|northgate|canyon plaza)\s+(?:close|closing|open|opening)\.?$|^(?:quiet|smooth|easy|slow|busy) night\.?$|^that'?s it\.?$/i;

/** Rule topics map to the vocabulary the rule builder exposes in plain language. */
export const RULE_TOPICS: Record<RuleTopic, { label: string; re: RegExp; topics: Topic[] }> = {
  refrigeration: {
    label: "refrigeration",
    re: /\b(?:ice machine|ice maker|walk-?in|cooler|freezer|fridge|reach-?in|refrigerat\w*)\b/i,
    topics: ["refrigeration"],
  },
  fire: { label: "fire or smoke", re: /\b(?:fire|smoke|smoking|burning smell|gas smell|hood fan)\b/i, topics: ["fire"] },
  safety: { label: "an injury", re: SAFETY, topics: ["safety"] },
  security: { label: "doors, alarms or security", re: /\b(?:door|alarm|sensor|unlocked|break-?in|camera)\b/i, topics: ["security"] },
  water: { label: "leaks or water", re: /\b(?:leak\w*|flood\w*|drain|backing up)\b/i, topics: ["water"] },
  customer_money: { label: "a refund or charge", re: /\b(?:refund|charged twice|overcharged|chargeback|comped)\b/i, topics: ["customer_money"] },
  cooking: { label: "cooking equipment", re: /\b(?:fryer|flat-?top|grill|oven)\b/i, topics: ["cooking"] },
};

export const LOCATION_NAMES: { re: RegExp; id: string }[] = [
  { re: /\bdowntown\b/i, id: "loc-dtn" },
  { re: /\bnorthgate\b/i, id: "loc-ngt" },
  { re: /\bcanyon(?: plaza)?\b/i, id: "loc-cyp" },
];

export const DUE_PHRASES: { re: RegExp; resolve: "lunch" | "open" | "first" | "noon" | "clock"; label: string }[] = [
  { re: /\bbefore (?:the )?lunch(?: rush)?\b/i, resolve: "lunch", label: "before lunch" },
  { re: /\bbefore (?:the )?rush\b/i, resolve: "lunch", label: "before the rush" },
  { re: /\bbefore (?:we )?open(?:ing)?\b|\bbefore doors\b/i, resolve: "open", label: "before opening" },
  { re: /\bfirst thing\b/i, resolve: "first", label: "first thing" },
  { re: /\bby noon\b/i, resolve: "noon", label: "by noon" },
];
