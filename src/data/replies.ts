import type { ExtractedItem } from "@/domain/types";

/**
 * Demo-only: the previous shift "answers" an Ask-previous-shift question a few
 * seconds later, so the loop visibly closes. In production this is a real reply
 * from the closer's phone.
 */
export function cannedReply(item: ExtractedItem | null): string {
  if (!item) return "I'll check my notes and get back to you before open.";
  if (item.subjectKey === "asset:ice-machine") {
    return "Same grinding as last week but louder. I left the front panel off so the tech can see the auger. Bar ice is bagged in the walk-in if you need it.";
  }
  if (item.subjectKey.startsWith("customer:") && item.subtype === "refund") {
    return "Card was charged twice Friday. Refund went in through the POS Saturday, receipt #4471 is in the office binder.";
  }
  if (item.subjectKey === "stock:cups-large") {
    return "Dev at Northgate took the last sleeve around 9. He said he'd send two back with their Thursday delivery.";
  }
  if (item.subjectKey === "asset:back-door-sensor") {
    return "Flashed around 10:05 and 10:40. Door was shut and locked both times. Might be the magnet on the frame.";
  }
  if (item.subtype === "training") {
    return "She knows the dish machine. Just hasn't done the sanitizer test strips with a lead yet.";
  }
  if (item.kind === "inventory") return "That count is from the walk-in at close. Didn't check dry storage.";
  return "That's everything I saw. Call me if it gets worse.";
}
