"use client";

import { Fragment, type ReactNode } from "react";
import type { DemoDB, Handoff } from "@/domain/types";
import { cx } from "@/components/ui/primitives";

interface Mark {
  id: string;
  start: number;
  end: number;
  kind: "evidence" | "review" | "unmapped";
}

/**
 * The original transcript, never hidden: answers in order with their question,
 * evidence spans highlighted, unmapped sentences underlined.
 */
export function Transcript({
  db,
  handoff,
  active,
  revealed,
  inline,
  className,
}: {
  db: DemoDB;
  handoff: Handoff;
  active: string | null;
  /** Evidence ids to highlight; others render as plain text (used while the transform plays). */
  revealed?: Set<string> | null;
  /** Elements to render right after a given evidence span (the flying item chips). */
  inline?: Record<string, ReactNode>;
  className?: string;
}) {
  const items = Object.values(db.items).filter((i) => i.handoffId === handoff.id);
  const marks: Mark[] = [];
  for (const item of items) {
    for (const eid of item.evidenceIds) {
      const e = db.evidence[eid];
      if (!e || (revealed && !revealed.has(eid))) continue;
      marks.push({ id: eid, start: e.start, end: e.end, kind: item.confidence !== "high" && item.status === "proposed" ? "review" : "evidence" });
    }
  }
  handoff.unmapped.forEach((u, i) => marks.push({ id: `un-${i}`, start: u.start, end: u.end, kind: "unmapped" }));

  const answers = handoff.answers.length ? handoff.answers : [{ questionId: null, prompt: "Closeout", text: handoff.transcript, start: 0, end: handoff.transcript.length, durationSec: 0, source: "typed" as const }];

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      {answers.map((a, idx) => (
        <section key={idx} aria-label={a.prompt}>
          {handoff.mode === "guided" && (
            <p className="mb-1 font-display text-[0.8rem] font-semibold uppercase tracking-wider text-steel-500">
              <span className="font-mono">{idx + 1}</span> · {a.prompt}
            </p>
          )}
          <p className="text-[1.02rem] leading-[1.75] text-steel-100">{renderRange(handoff.transcript, a.start, a.end, marks, active, inline)}</p>
        </section>
      ))}
    </div>
  );
}

function renderRange(text: string, from: number, to: number, marks: Mark[], active: string | null, inline?: Record<string, ReactNode>) {
  const inRange = marks.filter((m) => m.end > from && m.start < to);
  const cuts = new Set<number>([from, to]);
  inRange.forEach((m) => {
    cuts.add(Math.max(from, m.start));
    cuts.add(Math.min(to, m.end));
  });
  const points = Array.from(cuts).sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i];
    const e = points[i + 1];
    const covering = inRange.filter((m) => m.start <= s && m.end >= e);
    const piece = text.slice(s, e);
    if (!covering.length) {
      out.push(<Fragment key={s}>{piece}</Fragment>);
      continue;
    }
    const unmapped = covering.every((m) => m.kind === "unmapped");
    const ev = covering.filter((m) => m.kind !== "unmapped");
    out.push(
      <span
        key={s}
        data-ev={ev.map((m) => m.id).join(" ") || undefined}
        className={unmapped ? "unmapped-span" : "evidence"}
        data-role={ev.some((m) => m.kind === "review") ? "review" : undefined}
        data-active={ev.some((m) => m.id === active) ? "true" : undefined}
        title={unmapped ? "Not turned into an item. Kept in the transcript." : undefined}
      >
        {piece}
      </span>,
    );
    // Chips sit after the span that ends here.
    for (const m of ev) if (m.end === e && inline?.[m.id]) out.push(<Fragment key={`chip-${m.id}`}>{inline[m.id]}</Fragment>);
  }
  return out;
}
