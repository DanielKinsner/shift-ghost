"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Check, GitMerge, Lightbulb, Pencil, Quote, RotateCcw, X } from "lucide-react";
import type { DemoDB, ExtractedItem } from "@/domain/types";
import { itemNeedsReview } from "@/domain/commands";
import { fmtTime } from "@/domain/time";
import { Button, ConfidenceTag, SeverityTag, cx } from "@/components/ui/primitives";

export const KIND_LABEL: Record<ExtractedItem["kind"], string> = {
  incident: "Incident",
  inventory: "Inventory",
  customer: "Customer follow-up",
  maintenance: "Maintenance",
  task: "Next-shift task",
};

export function ItemCard({
  db,
  item,
  activeEvidence,
  onEvidence,
  onConfirm,
  onCorrect,
  onDismiss,
  onRestore,
  canReview,
  published,
}: {
  db: DemoDB;
  item: ExtractedItem;
  activeEvidence: string | null;
  onEvidence: (id: string) => void;
  onConfirm: () => void;
  onCorrect: () => void;
  onDismiss: () => void;
  onRestore: () => void;
  canReview: boolean;
  published: boolean;
}) {
  const needs = itemNeedsReview(item);
  const dismissed = item.status === "dismissed";
  const reviewer = item.reviewedById ? db.users[item.reviewedById] : null;
  const task = item.proposedTask;
  const owner = task?.ownerId ? db.users[task.ownerId] : null;
  return (
    <motion.article
      layout="position"
      className={cx(
        "panel relative overflow-hidden",
        needs && "border-amber/60 shadow-[0_0_0_1px_rgba(255,176,32,0.15)]",
        dismissed && "opacity-55",
      )}
      aria-label={`${KIND_LABEL[item.kind]}: ${item.title}`}
    >
      {needs && (
        <div className="flex items-center gap-2 border-b border-amber/30 bg-amber-900/50 px-4 py-1.5 text-xs font-semibold text-amber">
          <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden /> Needs your confirmation before it reaches the morning
        </div>
      )}
      <div className="px-4 pb-4 pt-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <SeverityTag severity={item.severity} />
          <ConfidenceTag confidence={item.confidence} />
          <span className="ml-auto text-xs text-steel-500">{KIND_LABEL[item.kind]}</span>
        </div>
        <h3 className={cx("mt-2 font-display text-[1.3rem] font-semibold leading-snug tracking-wide text-paper-50", dismissed && "line-through")}>{item.title}</h3>
        {item.facts.length > 0 && <p className="mt-1 text-sm text-steel-300">{item.facts.join(" · ")}</p>}

        {item.confidence !== "high" && (
          <p className={cx("mt-2 text-sm", needs ? "text-amber/95" : "text-steel-400")}>
            {needs ? item.confidenceReason : `Checked by a person. Flagged because: ${item.confidenceReason.charAt(0).toLowerCase()}${item.confidenceReason.slice(1)}`}
          </p>
        )}

        <ul className="mt-3 flex flex-col gap-1.5">
          {item.evidenceIds.map((eid) => {
            const e = db.evidence[eid];
            if (!e) return null;
            const answerIdx = db.handoffs[item.handoffId]?.answers.findIndex((a) => e.start >= a.start && e.start < a.end) ?? -1;
            return (
              <li key={eid}>
                <button
                  type="button"
                  onClick={() => onEvidence(eid)}
                  aria-pressed={activeEvidence === eid}
                  className={cx(
                    "group flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left text-[0.92rem] transition-colors",
                    activeEvidence === eid ? "border-safety/70 bg-safety-900/60" : "border-night-600 bg-night-900/50 hover:border-night-500",
                  )}
                >
                  <Quote size={14} className="mt-1 flex-none text-safety" aria-hidden />
                  <span className="min-w-0">
                    <span className="text-steel-100">{e.text}</span>
                    <span className="mt-0.5 block font-mono text-[0.68rem] text-steel-500">
                      {e.role === "primary" ? "Source" : e.role === "action" ? "Owner and due" : e.role === "handled" ? "Handled" : "Context"}
                      {answerIdx >= 0 ? ` · answer ${answerIdx + 1}` : ""} · show in transcript
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {item.inferences.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {item.inferences.map((inf) => (
              <li key={inf.field + inf.value} className="flex gap-2 text-steel-300">
                <Lightbulb size={14} className={cx("mt-0.5 flex-none", inf.material ? "text-amber" : "text-steel-500")} aria-hidden />
                <span>
                  <span className="text-steel-400">Inferred {inf.field.toLowerCase()}:</span> {inf.value}. <span className="text-steel-500">{inf.reason}.</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {item.mergedKinds.length > 0 && (
          <p className="mt-2 flex items-start gap-2 text-sm text-steel-400">
            <GitMerge size={14} className="mt-0.5 flex-none" aria-hidden />
            Also matched {item.mergedKinds.map((k) => KIND_LABEL[k].toLowerCase()).join(", ")}. Merged so the morning gets one item, not two.
          </p>
        )}

        {(item.ruleHits.length > 0 || task) && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-night-600 pt-3 text-sm">
            {item.ruleHits.map((h) => (
              <p key={h.ruleId} className="text-steel-300">
                <span className="font-semibold text-paper-100">Rule:</span> {db.rules[h.ruleId]?.name ?? h.summary} <span className="text-steel-500">(matched “{h.matched}”)</span>
              </p>
            ))}
            {task && (
              <p className="text-steel-300">
                <span className="font-semibold text-paper-100">{published ? "Task" : "Creates task"}:</span> {task.title}
                {owner ? ` · ${owner.firstName}` : " · unassigned"}
                {task.dueAt ? ` · ${task.dueLabel ?? "due"} (${fmtTime(task.dueAt)})` : ""}
              </p>
            )}
          </div>
        )}

        {item.correctionNote && (
          <p className="mt-2 text-sm text-steel-400">
            <span className="text-steel-300">Reviewer note:</span> {item.correctionNote}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {dismissed ? (
            <>
              <span className="text-sm text-steel-400">Dismissed{reviewer ? ` by ${reviewer.firstName}` : ""}</span>
              {canReview && !published && (
                <Button size="sm" variant="ghost" onClick={onRestore} icon={<RotateCcw size={14} />}>
                  Restore
                </Button>
              )}
            </>
          ) : item.status === "confirmed" || item.status === "corrected" ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-go">
              <Check size={15} /> {item.status === "corrected" ? "Corrected" : "Confirmed"}
              {reviewer ? ` by ${reviewer.firstName}` : ""}
            </span>
          ) : published ? null : (
            <span className="text-sm text-steel-500">{needs ? "" : "Accepted as heard unless you change it"}</span>
          )}
          {item.issueId && published && (
            <Link href={`/issues/${item.issueId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-safety hover:underline">
              Open issue thread <ArrowUpRight size={14} />
            </Link>
          )}
          {canReview && !published && !dismissed && (
            <span className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={onDismiss} icon={<X size={14} />}>
                Dismiss
              </Button>
              <Button size="sm" onClick={onCorrect} icon={<Pencil size={14} />}>
                Correct
              </Button>
              {item.status === "proposed" && (
                <Button size="sm" variant={needs ? "primary" : "secondary"} onClick={onConfirm} icon={<Check size={14} />}>
                  Confirm
                </Button>
              )}
            </span>
          )}
        </div>
      </div>
    </motion.article>
  );
}
