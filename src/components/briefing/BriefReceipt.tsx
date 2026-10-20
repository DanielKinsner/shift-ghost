"use client";

import type { BriefingView } from "@/domain/briefing";
import { fmtDay, fmtTime } from "@/domain/time";
import { cx } from "@/components/ui/primitives";

const SEV_TONE = { critical: "text-paper-red", high: "text-[#9a4300]", normal: "text-ink-soft", watch: "text-ink-soft" } as const;

/** Compact thermal-paper rendering of a brief: the "printout" the opening manager would get. */
export function BriefReceipt({ view, className, compact }: { view: BriefingView; className?: string; compact?: boolean }) {
  return (
    <div className={cx("thermal rounded-t-md px-5 pt-5 sm:px-6", className)}>
      <div className="flex items-baseline justify-between gap-3 font-mono text-[0.7rem] uppercase tracking-wider text-ink-soft">
        <span>Opening brief · {view.location.name}</span>
        <span>{fmtDay(view.readyAt)}</span>
      </div>
      {view.author && view.handoff && (
        <p className="mt-1 font-mono text-[0.7rem] text-ink-soft">
          From {view.author.name}&apos;s closeout, {fmtTime(view.handoff.submittedAt ?? view.handoff.createdAt)}
        </p>
      )}
      <hr className="thermal-rule my-3" />
      {view.state === "awaiting" ? (
        <p className="pb-2 text-sm text-ink-soft">Waiting for the closeout.</p>
      ) : (
        <>
          <p className="font-display text-sm font-bold uppercase tracking-wider text-ink">What can hurt today</p>
          <ul className="mt-2 flex flex-col gap-2">
            {view.risks.length === 0 && <li className="text-sm text-ink-soft">Nothing flagged.</li>}
            {view.risks.slice(0, compact ? 3 : 6).map((r) => (
              <li key={r.key} className="grid grid-cols-[4.2rem_1fr] gap-2 text-[0.92rem]">
                <span className={cx("font-display text-xs font-bold uppercase tracking-wider", SEV_TONE[r.severity])}>{r.severity}</span>
                <span className="font-semibold text-ink">{r.title}</span>
              </li>
            ))}
          </ul>
          <hr className="thermal-rule my-3" />
          <p className="font-display text-sm font-bold uppercase tracking-wider text-ink">Before opening</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[0.92rem] text-ink">
            {[...view.risks.filter((r) => r.task).map((r) => r.task!), ...view.mustDo.map((m) => m.task!).filter(Boolean)]
              .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
              .slice(0, compact ? 4 : 8)
              .map((t) => (
                <li key={t.id} className="flex gap-2">
                  <span aria-hidden>☐</span>
                  <span>
                    {t.title}
                    {t.dueAt && <span className="font-mono text-[0.75rem] text-ink-soft"> · {fmtTime(t.dueAt)}</span>}
                  </span>
                </li>
              ))}
          </ul>
          {view.handled.length > 0 && (
            <>
              <hr className="thermal-rule my-3" />
              <p className="text-[0.85rem] text-ink-soft">
                Already handled: {view.handled.map((h) => h.title.toLowerCase()).join("; ")}.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
