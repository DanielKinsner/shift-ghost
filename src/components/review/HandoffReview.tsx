"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowRight, CircleHelp, Plus, Send, Siren, Trash2, WifiOff } from "lucide-react";
import { useStore } from "@/store/store";
import { useCurrentUser, useDb, useNow, useReducedMotionPref } from "@/store/hooks";
import {
  confirmItem,
  correctItem,
  createItemFromSpan,
  deleteRecording,
  dismissItem,
  itemNeedsReview,
  markTransformSeen,
  processHandoff,
  publishHandoff,
  publishPreview,
  restoreItem,
  setClock,
  setDemo,
} from "@/domain/commands";
import { can, ROLE_TITLE } from "@/domain/permissions";
import { CorrectionSchema, DismissSchema, fieldErrors } from "@/domain/schemas";
import { fmtDateTime, fmtElapsed, fmtTime } from "@/domain/time";
import type { ExtractedItem, ItemKind, Severity } from "@/domain/types";
import { MORNING_ANCHOR } from "@/data/seed";
import { Avatar, Button, Mono, SectionHeading, Skeleton, Stamp, StatusLight, Tape, cx } from "@/components/ui/primitives";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { GhostMark } from "@/components/ui/brand";
import { ItemCard, KIND_LABEL } from "./ItemCard";
import { Transcript } from "./Transcript";

const COLUMNS: { kind: ItemKind; label: string }[] = [
  { kind: "incident", label: "Incidents" },
  { kind: "inventory", label: "Inventory flags" },
  { kind: "customer", label: "Customer follow-ups" },
  { kind: "maintenance", label: "Maintenance" },
  { kind: "task", label: "Next-shift tasks" },
];

type Stage = "processing" | "transform" | "review";

export function HandoffReview({ handoffId, fresh }: { handoffId: string; fresh: boolean }) {
  const db = useDb();
  const user = useCurrentUser();
  const now = useNow();
  const router = useRouter();
  const reduce = useReducedMotionPref();
  const dispatch = useStore((s) => s.dispatch);
  const handoff = db.handoffs[handoffId];
  const items = useMemo(
    () =>
      Object.values(db.items)
        .filter((i) => i.handoffId === handoffId)
        .sort((a, b) => (db.evidence[a.evidenceIds[0]]?.start ?? 0) - (db.evidence[b.evidenceIds[0]]?.start ?? 0)),
    [db.items, db.evidence, handoffId],
  );
  const [active, setActive] = useState<string | null>(null);
  const shouldAnimate = fresh && handoff && !db.demo.seenTransform.includes(handoffId) && !reduce;
  const [stage, setStage] = useState<Stage>(() => (handoff?.status === "processing" && !handoff.error ? "processing" : shouldAnimate ? "transform" : "review"));
  const [placed, setPlaced] = useState(shouldAnimate ? 0 : Number.MAX_SAFE_INTEGER);
  const [atSource, setAtSource] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<ExtractedItem | null>(null);
  const [dismissing, setDismissing] = useState<ExtractedItem | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creating, setCreating] = useState<number | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const canReview = Boolean(handoff) && can(user, "review_handoff") && (handoff.authorId === user.id || user.role !== "closing_manager");

  // 1 · Server-side extraction (simulated latency so the scan is visible)
  useEffect(() => {
    if (!handoff || handoff.status !== "processing" || handoff.error) return;
    const t = setTimeout(() => {
      dispatch(processHandoff, { handoffId }, { silent: true, actorId: null });
      setStage(shouldAnimate ? "transform" : "review");
      if (!shouldAnimate) setPlaced(Number.MAX_SAFE_INTEGER);
    }, reduce ? 200 : 1400);
    return () => clearTimeout(t);
  }, [handoff?.status, handoff?.error]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2 · The transformation: each item lifts out of its sentence and drops into its column.
  useEffect(() => {
    if (stage !== "transform") return;
    if (placed >= items.length) {
      const t = setTimeout(() => {
        setStage("review");
        dispatch(markTransformSeen, { handoffId }, { silent: true, local: true });
        router.replace(`/handoffs/${handoffId}`, { scroll: false });
      }, 900);
      return () => clearTimeout(t);
    }
    const item = items[placed];
    if (atSource !== item.id) {
      const t = setTimeout(() => setAtSource(item.id), 260);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setAtSource(null);
      setPlaced((p) => p + 1);
    }, 620);
    return () => clearTimeout(t);
  }, [stage, placed, atSource, items, dispatch, handoffId, router]);

  const showEvidence = useCallback((eid: string) => {
    setActive(eid);
    const el = transcriptRef.current?.querySelector(`[data-ev~="${eid}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  if (!handoff) {
    return <EmptyState title="That closeout isn't here" body="It may have been removed when the demo was reset." action={<Link href="/handoffs"><Button>See all handoffs</Button></Link>} />;
  }

  const location = db.locations[handoff.locationId];
  const author = db.users[handoff.authorId];
  const preview = publishPreview(db, handoffId);
  const published = handoff.status === "published";
  const placedIds = new Set(items.slice(0, placed).map((i) => i.id));
  const revealedEvidence = stage === "transform" ? new Set(items.filter((i) => placedIds.has(i.id) || i.id === atSource).flatMap((i) => i.evidenceIds)) : null;
  const needsCount = items.filter(itemNeedsReview).length;
  const canDelete = can(user, "delete_recordings") && (user.id === handoff.authorId || user.role === "area_manager");

  const doPublish = () => {
    setConfirmPublish(false);
    const r = dispatch(publishHandoff, { handoffId }, { toastMessage: "Published to the opening crew" });
    if (r) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Stamp size="xs" rotate={-1.5}>
              Close · {location.code} · {fmtDateTime(handoff.createdAt).replace(",", "")}
            </Stamp>
            <StatusChip status={handoff.status} error={Boolean(handoff.error)} needs={needsCount} />
          </div>
          <h1 className="mt-3 font-display text-[2.2rem] font-bold leading-tight tracking-wide sm:text-5xl">{location.name} closeout</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-steel-300">
            <span className="inline-flex items-center gap-2">
              <Avatar user={author} size={22} /> {author?.name}
            </span>
            <span className="text-night-500">/</span>
            <span>
              {handoff.mode === "guided" ? `${handoff.answers.length} answers` : "Free closeout"} · <Mono>{fmtElapsed(handoff.audio.durationSec)}</Mono>
            </span>
            <span className="text-night-500">/</span>
            <span>Submitted {fmtTime(handoff.submittedAt ?? handoff.createdAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {handoff.audio.hasRecording ? (
            <span className="text-sm text-steel-400">
              Audio kept until <Mono>{handoff.audio.retainedUntil?.slice(0, 10)}</Mono>
            </span>
          ) : handoff.audio.deletedAt ? (
            <span className="text-sm text-steel-400">Recording deleted {fmtDateTime(handoff.audio.deletedAt)}</span>
          ) : (
            <span className="text-sm text-steel-400">Typed closeout, no audio</span>
          )}
          {handoff.audio.hasRecording && canDelete && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} icon={<Trash2 size={14} />}>
              Delete recording
            </Button>
          )}
        </div>
      </div>

      {handoff.status === "queued" && (
        <div className="panel flex items-center gap-3 border-amber/50 px-4 py-3 text-sm">
          <WifiOff size={16} className="text-amber" /> Saved on {author?.firstName}&apos;s phone while offline. It processes as soon as the device reconnects.
        </div>
      )}

      {handoff.error && (
        <ErrorState
          title="Extraction didn't finish"
          body={
            <>
              {handoff.error} Nothing was lost: the transcript is below, and you can run extraction again. If it keeps failing, publish the transcript as-is from the handoff list and Shift Ghost retries overnight.
            </>
          }
          onRetry={() => {
            setStage("processing");
            dispatch(processHandoff, { handoffId }, { toastMessage: "Extraction finished", actorId: null });
            setStage("review");
            setPlaced(Number.MAX_SAFE_INTEGER);
          }}
          retryLabel="Run extraction again"
        />
      )}

      {published && <PublishedBanner handoffId={handoffId} now={now} />}

      <LayoutGroup>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.2fr)] xl:gap-8">
        {/* Transcript: never hidden */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="panel flex max-h-none flex-col lg:max-h-[calc(100dvh-7rem)]">
            <div className="flex items-center justify-between gap-3 border-b border-night-600 px-4 py-3">
              <h2 className="font-display text-lg font-semibold tracking-wide">Original transcript</h2>
              <span className="text-xs text-steel-500">Highlights are evidence. Dotted means unmapped.</span>
            </div>
            <div ref={transcriptRef} tabIndex={0} aria-label="Original transcript text" className="relative overflow-y-auto px-4 py-4">
              {stage === "processing" && !handoff.error && <ScanLine />}
                <Transcript
                  db={db}
                  handoff={handoff}
                  active={active}
                  revealed={stage === "processing" ? new Set() : revealedEvidence}
                  inline={
                    stage === "transform" && atSource
                      ? Object.fromEntries(
                          (items.find((i) => i.id === atSource)?.evidenceIds.slice(0, 1) ?? []).map((eid) => [
                            eid,
                            <motion.span key={atSource} layoutId={`chip-${atSource}`} className="mx-1 inline-flex translate-y-[-1px] items-center gap-1.5 rounded-md border border-safety bg-night-700 px-2 py-0.5 align-middle text-sm font-semibold text-paper-100 shadow-[0_0_18px_-4px_rgba(255,107,26,0.9)]">
                              <StatusLight tone={items.find((i) => i.id === atSource)!.severity} size={8} />
                              {items.find((i) => i.id === atSource)!.title}
                            </motion.span>,
                          ]),
                        )
                      : undefined
                  }
                />
                {stage === "transform" && <span className="sr-only">Extracting items from the transcript</span>}
            </div>
          </div>
        </aside>

        {/* Extracted items */}
        <section aria-labelledby="extracted" className="min-w-0">
          <AnimatePresence mode="wait">
            {stage === "processing" && !handoff.error ? (
              <motion.div key="proc" exit={{ opacity: 0 }} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <GhostMark size={30} />
                  <p className="font-display text-xl font-semibold tracking-wide">Listening back to {handoff.answers.length} answers…</p>
                </div>
                {COLUMNS.map((c) => (
                  <Skeleton key={c.kind} className="h-20 w-full" />
                ))}
              </motion.div>
            ) : stage === "transform" ? (
              <motion.div key="transform" exit={{ opacity: 0 }} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {COLUMNS.map((c) => (
                    <div key={c.kind} className="panel min-h-28 px-3 py-3">
                      <p className="mb-2 flex items-center justify-between font-display text-sm font-semibold uppercase tracking-wider text-steel-400">
                        {c.label}
                        <Mono className="text-steel-500">{items.slice(0, placed).filter((i) => i.kind === c.kind).length}</Mono>
                      </p>
                      <div className="flex flex-col gap-2">
                        {items
                          .slice(0, placed)
                          .filter((i) => i.kind === c.kind)
                          .map((i) => (
                            <motion.div key={i.id} layoutId={`chip-${i.id}`} className="flex items-start gap-2 rounded-md border border-night-500 bg-night-700 px-2.5 py-2 text-sm text-paper-100" transition={{ type: "spring", stiffness: 260, damping: 26 }}>
                              <StatusLight tone={i.severity} size={8} className="mt-1.5" />
                              <span className="min-w-0">
                                <span className="block font-medium">{i.title}</span>
                                <span className={cx("text-xs", i.confidence === "high" ? "text-steel-500" : "text-amber")}>{i.confidence === "high" ? "High confidence" : i.confidence === "review" ? "Needs review" : "Uncertain"}</span>
                              </span>
                            </motion.div>
                          ))}
                      </div>
                    </div>
                  ))}
              </motion.div>
            ) : (
              <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-7">
                <div>
                  <SectionHeading id="extracted" aside={<span className="text-sm text-steel-400">{items.filter((i) => i.status !== "dismissed").length} items</span>}>
                    What Shift Ghost heard
                  </SectionHeading>
                  {!published && needsCount > 0 && canReview && (
                    <p className="mt-2 text-steel-300">
                      <span className="font-semibold text-amber">{needsCount} {needsCount === 1 ? "item needs" : "items need"} you.</span> Everything else was stated plainly and goes through as heard unless you change it.
                    </p>
                  )}
                  {!canReview && !published && (
                    <p className="mt-2 text-sm text-steel-400">You can read this closeout. {author?.firstName} or a manager confirms it before it publishes.</p>
                  )}
                </div>
                {items.length === 0 && (
                  <EmptyState title="Nothing to extract" body="Shift Ghost didn't find problems, shortages or open promises in this closeout. The transcript is kept as-is for the morning." />
                )}
                {COLUMNS.map((c) => {
                  const list = items.filter((i) => i.kind === c.kind);
                  if (!list.length) return null;
                  return (
                    <div key={c.kind}>
                      <h3 className="mb-2.5 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.12em] text-steel-400">
                        {c.label} <Mono className="text-steel-500">{list.length}</Mono>
                      </h3>
                      <div className="flex flex-col gap-3">
                        {list.map((item) => (
                          <ItemCard
                            key={item.id}
                            db={db}
                            item={item}
                            activeEvidence={active}
                            onEvidence={showEvidence}
                            canReview={canReview}
                            published={published}
                            onConfirm={() => dispatch(confirmItem, { itemId: item.id }, { undoable: true, label: `Confirm “${item.title}”`, toastMessage: "Confirmed" })}
                            onCorrect={() => setCorrecting(item)}
                            onDismiss={() => setDismissing(item)}
                            onRestore={() => dispatch(restoreItem, { itemId: item.id }, { toastMessage: "Restored for review" })}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {handoff.unmapped.length > 0 && (
                  <div>
                    <h3 className="mb-2.5 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.12em] text-steel-400">
                      <CircleHelp size={14} /> Not turned into an item
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {handoff.unmapped.map((u, idx) => (
                        <li key={u.start} className="panel flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                          <p className="min-w-0 flex-1 text-steel-100">“{u.text}”</p>
                          <span className="text-xs text-steel-500">Kept in the transcript</span>
                          {canReview && !published && (
                            <Button size="sm" onClick={() => setCreating(idx)} icon={<Plus size={14} />}>
                              Make it an item
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {handoff.crewNotes.length > 0 && (
                  <div>
                    <h3 className="mb-2.5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-steel-400">Crew notes for the brief</h3>
                    {handoff.crewNotes.map((c) => (
                      <p key={c.start} className="text-steel-300">
                        “{c.text}”
                      </p>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
      </LayoutGroup>

      {/* Publish bar */}
      {stage === "review" && !published && handoff.status === "review" && canReview && (
        <div className="sticky bottom-[72px] z-20 -mx-4 border-t border-night-600 bg-night-900/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:bottom-0 lg:-mx-10 lg:px-10">
          <div className="mx-auto flex max-w-[1480px] flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-steel-300" aria-live="polite">
              {preview.blocking.length ? (
                <>
                  <StatusLight tone="amber" size={9} className="mr-2 align-middle" />
                  {preview.blocking.length} {preview.blocking.length === 1 ? "item needs" : "items need"} confirmation before publishing.
                </>
              ) : (
                <>
                  <StatusLight tone="ok" size={9} className="mr-2 align-middle" />
                  Ready.{" "}
                  {Object.values(db.users)
                    .filter((u) => u.appUser && u.locationIds.includes(handoff.locationId) && (u.role === "opening_manager" || u.role === "kitchen_lead"))
                    .map((u) => u.name)
                    .join(" and ") || "The opening crew"}{" "}
                  get this at {fmtTime(`2026-01-01T${Object.values(db.shiftTemplates).find((t) => t.locationId === handoff.locationId && t.kind === "open")?.handoffAt ?? "06:00"}:00Z`)}.
                </>
              )}
            </p>
            <Button
              variant="primary"
              size="lg"
              className="sm:ml-auto"
              disabled={preview.blocking.length > 0}
              onClick={() => (preview.critical.length ? setConfirmPublish(true) : doPublish())}
              icon={<Send size={17} />}
            >
              Publish to the opening crew
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <Dialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        tone="critical"
        title="This will page someone tonight"
        description="Critical items notify people as soon as you publish. Check that this is real."
        footer={
          <>
            <Button onClick={() => setConfirmPublish(false)}>Go back</Button>
            <Button variant="danger" onClick={doPublish} icon={<Siren size={16} />}>
              Publish and notify
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-2">
          {preview.critical.map((c) => (
            <li key={c.item.id + c.channel} className="rounded-lg border border-signal/40 bg-signal-900/50 px-3 py-2.5">
              <p className="font-semibold text-paper-100">{c.item.title}</p>
              <p className="text-sm text-steel-300">
                {c.channel === "sms" ? "Text message" : c.channel} to {c.recipients.map((r) => `${r.name} (${ROLE_TITLE[r.role].toLowerCase()})`).join(", ")}
              </p>
            </li>
          ))}
        </ul>
      </Dialog>

      {correcting && <CorrectDialog key={correcting.id} item={correcting} onClose={() => setCorrecting(null)} />}
      {dismissing && <DismissDialog key={dismissing.id} item={dismissing} onClose={() => setDismissing(null)} />}
      {creating !== null && <CreateFromSpanDialog key={creating} handoffId={handoffId} index={creating} onClose={() => setCreating(null)} />}

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this recording?"
        description="The audio is removed for everyone, permanently. The transcript, evidence links and items stay, so the brief and audit trail still make sense."
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Keep recording</Button>
            <Button
              variant="danger"
              onClick={() => {
                dispatch(deleteRecording, { handoffId });
                setConfirmDelete(false);
              }}
              icon={<Trash2 size={15} />}
            >
              Delete recording
            </Button>
          </>
        }
      />
    </div>
  );
}

function StatusChip({ status, error, needs }: { status: string; error: boolean; needs: number }) {
  const map: Record<string, { tone: "ok" | "amber" | "critical" | "normal"; label: string }> = {
    published: { tone: "ok", label: "Published" },
    review: { tone: needs ? "amber" : "ok", label: needs ? `${needs} to confirm` : "Ready to publish" },
    processing: { tone: "amber", label: "Processing" },
    queued: { tone: "amber", label: "Waiting to sync" },
    draft: { tone: "normal", label: "Draft" },
  };
  const s = error ? { tone: "critical" as const, label: "Extraction failed" } : map[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-night-500 bg-night-800 px-2.5 py-1 text-xs font-medium text-steel-100">
      <StatusLight tone={s.tone} size={8} pulse={s.tone === "amber" && status === "processing"} /> {s.label}
    </span>
  );
}

function ScanLine() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-safety/15 to-transparent"
      initial={{ top: "-10%" }}
      animate={{ top: "100%" }}
      transition={{ duration: 1.3, repeat: Infinity, ease: "linear" }}
    />
  );
}

function PublishedBanner({ handoffId, now }: { handoffId: string; now: string }) {
  const db = useDb();
  const router = useRouter();
  const dispatch = useStore((s) => s.dispatch);
  const h = db.handoffs[handoffId];
  const publisher = h.publishedById ? db.users[h.publishedById] : null;
  const isTonight = h.locationId === "loc-dtn" && h.createdAt.startsWith("2026-10-20") && now < MORNING_ANCHOR;
  return (
    <div className="panel overflow-hidden">
      <Tape thin className="rounded-none" />
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
        <Stamp tone="go" size="md" rotate={-3}>
          Published {h.publishedAt ? fmtTime(h.publishedAt) : ""}
        </Stamp>
        <p className="text-steel-300">
          {publisher?.firstName ?? "Someone"} handed this to the opening crew. It becomes their brief at 6:00 AM, and every item links back here.
        </p>
        {isTonight && (
          <Button
            variant="primary"
            className="flex-row-reverse sm:ml-auto"
            icon={<ArrowRight size={16} />}
            onClick={() => {
              dispatch(setDemo, { currentUserId: "u-luis", currentLocationId: "loc-dtn" }, { silent: true, local: true });
              dispatch(setClock, { iso: MORNING_ANCHOR, nowMs: Date.now() }, { local: true, toastMessage: "Wednesday, 6:15 AM. You're Luis." });
              router.push("/briefing");
            }}
          >
            Be Luis at 6:15 AM
          </Button>
        )}
      </div>
    </div>
  );
}

function CorrectDialog({ item, onClose }: { item: ExtractedItem; onClose: () => void }) {
  const db = useDb();
  const dispatch = useStore((s) => s.dispatch);
  const [form, setForm] = useState({ title: item.title, severity: item.severity as Severity, qty: item.fields.qty != null ? String(item.fields.qty) : "", ownerId: item.proposedTask?.ownerId ?? "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const people = Object.values(db.users).filter((u) => u.appUser && u.locationIds.includes(item.locationId));
  const save = () => {
    const r = CorrectionSchema.safeParse({ title: form.title, severity: form.severity, qty: form.qty, note: form.note });
    if (!r.success) return setErrors(fieldErrors(r.error));
    const qtyChanged = item.kind === "inventory" && form.qty !== "" && Number(form.qty) !== item.fields.qty;
    dispatch(
      correctItem,
      {
        itemId: item.id,
        title: form.title !== item.title ? form.title : undefined,
        severity: form.severity,
        qty: qtyChanged ? Number(form.qty) : undefined,
        ownerId: item.proposedTask ? form.ownerId || null : undefined,
        note: form.note,
      },
      { undoable: true, label: `Correct “${item.title}”`, toastMessage: "Correction saved" },
    );
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Correct this item"
      description={`${KIND_LABEL[item.kind]} from: “${db.evidence[item.evidenceIds[0]]?.text}”`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save correction
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="What it is" htmlFor="c-title" error={errors.title}>
          <Input id="c-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Severity" htmlFor="c-sev">
            <Select id="c-sev" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="watch">Watch</option>
            </Select>
          </Field>
          {item.kind === "inventory" && (
            <Field label={`On hand (${item.fields.unit}s)`} htmlFor="c-qty" error={errors.qty}>
              <Input id="c-qty" type="number" min={0} inputMode="numeric" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </Field>
          )}
          {item.proposedTask && (
            <Field label="Task owner" htmlFor="c-owner">
              <Select id="c-owner" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                <option value="">Unassigned</option>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Note for the morning (optional)" htmlFor="c-note" error={errors.note}>
          <Textarea id="c-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="min-h-20" />
        </Field>
      </div>
    </Dialog>
  );
}

function DismissDialog({ item, onClose }: { item: ExtractedItem; onClose: () => void }) {
  const dispatch = useStore((s) => s.dispatch);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Dismiss “${item.title}”?`}
      description="It stays in the transcript and the audit trail, but won't reach the morning brief."
      footer={
        <>
          <Button onClick={onClose}>Keep it</Button>
          <Button
            variant="danger"
            onClick={() => {
              const r = DismissSchema.safeParse({ reason });
              if (!r.success) return setError(r.error.issues[0].message);
              dispatch(dismissItem, { itemId: item.id, reason: r.data.reason }, { undoable: true, label: `Dismiss “${item.title}”`, toastMessage: "Dismissed" });
              onClose();
            }}
          >
            Dismiss item
          </Button>
        </>
      }
    >
      <Field label="Why?" htmlFor="d-reason" error={error}>
        <Input id="d-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Already fixed before close" />
      </Field>
    </Dialog>
  );
}

function CreateFromSpanDialog({ handoffId, index, onClose }: { handoffId: string; index: number; onClose: () => void }) {
  const db = useDb();
  const dispatch = useStore((s) => s.dispatch);
  const [kind, setKind] = useState<ItemKind>("task");
  const [title, setTitle] = useState(() => db.handoffs[handoffId].unmapped[index]?.text.replace(/\.$/, "") ?? "");
  const span = db.handoffs[handoffId].unmapped[index];
  if (!span) return null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Make this an item"
      description={`From: “${span.text}”`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={title.trim().length < 3}
            onClick={() => {
              dispatch(createItemFromSpan, { handoffId, span, kind, title }, { toastMessage: "Item added" });
              onClose();
            }}
          >
            Add item
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Category" htmlFor="cs-kind">
          <Select id="cs-kind" value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
            {COLUMNS.map((c) => (
              <option key={c.kind} value={c.kind}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="What should the morning see?" htmlFor="cs-title">
          <Input id="cs-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
