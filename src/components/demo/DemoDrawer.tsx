"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Check, Clock, FlaskConical, Ghost, RotateCcw, Users as UsersIcon, WifiOff, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useStore } from "@/store/store";
import { useNow } from "@/store/hooks";
import { Sheet, Dialog } from "@/components/ui/overlay";
import { Avatar, Button, Mono, cx } from "@/components/ui/primitives";
import { Select, Switch } from "@/components/ui/form";
import { ROLE_TITLE } from "@/domain/permissions";
import { LANDING } from "@/components/shell/nav";
import { createHandoff, processHandoff, restartOnboarding, setClock, setDemo } from "@/domain/commands";
import { fmtDay, fmtTime } from "@/domain/time";
import { guideProgress } from "@/domain/guide";
import { SAMPLE_TRANSCRIPTS } from "@/data/transcripts";
import { DEMO_ANCHOR, MORNING_ANCHOR } from "@/data/seed";

type Section = "guide" | "users" | "clock" | "sim";
const useDrawer = create<{ open: boolean; section: Section; set: (o: boolean, s?: Section) => void }>((set) => ({
  open: false,
  section: "guide",
  set: (open, section) => set((st) => ({ open, section: section ?? st.section })),
}));

export function openDemoDrawer(section: Section = "guide") {
  useDrawer.getState().set(true, section);
}

const DEMO_USERS = ["u-maya", "u-luis", "u-bri", "u-jordan"];

export function DemoDrawer() {
  const { open, section, set } = useDrawer();
  const db = useStore((s) => s.db);
  const hydrated = useStore((s) => s.hydrated);
  if (!hydrated || !db) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => set(true, "guide")}
        className="fixed right-0 top-[64%] z-50 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 border-night-500 bg-night-800/95 px-1 py-2.5 sm:px-1.5 sm:py-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-steel-300 shadow-lg backdrop-blur hover:border-safety hover:text-paper-100"
        aria-label="Open demo controls"
      >
        <Ghost size={15} className="text-safety" />
        <span className="hidden rotate-180 [writing-mode:vertical-rl] sm:inline">Demo</span>
      </button>
      <Sheet open={open} onOpenChange={(o) => set(o)} title="Demo controls" description="Not part of the product. Switch people, move the clock, and simulate failures.">
        <DrawerBody section={section} onClose={() => set(false)} />
      </Sheet>
    </>
  );
}

function DrawerBody({ section, onClose }: { section: Section; onClose: () => void }) {
  const router = useRouter();
  const db = useStore((s) => s.db)!;
  const dispatch = useStore((s) => s.dispatch);
  const setOnline = useStore((s) => s.setOnline);
  const reset = useStore((s) => s.reset);
  const now = useNow();
  const [confirmReset, setConfirmReset] = useState(false);
  const [sample, setSample] = useState(SAMPLE_TRANSCRIPTS[0].id);
  const refs = { guide: useRef<HTMLElement>(null), users: useRef<HTMLElement>(null), clock: useRef<HTMLElement>(null), sim: useRef<HTMLElement>(null) };

  useEffect(() => {
    const el = refs[section].current;
    if (el && section !== "guide") el.scrollIntoView({ block: "start" });
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  const guide = guideProgress(db, now);
  const nextStep = guide.find((g) => !g.done);

  const switchUser = (id: string, morning = false) => {
    const u = db.users[id];
    dispatch(setDemo, { currentUserId: id, currentLocationId: u.locationIds.includes(db.demo.currentLocationId) ? db.demo.currentLocationId : u.locationIds[0] }, { silent: true, local: true });
    if (morning) dispatch(setClock, { iso: MORNING_ANCHOR, nowMs: Date.now() }, { silent: true, local: true });
    onClose();
    router.push(LANDING[u.role]);
  };

  const jump = (iso: string, label: string) => dispatch(setClock, { iso, nowMs: Date.now() }, { local: true, toastMessage: label });

  const inject = () => {
    const s = SAMPLE_TRANSCRIPTS.find((x) => x.id === sample)!;
    const r = dispatch(
      createHandoff,
      { locationId: s.locationId, authorId: s.authorId, mode: "free", hasRecording: false, answers: [{ questionId: null, prompt: "Free closeout", text: s.text, durationSec: Math.round(s.text.split(" ").length / 2.4), source: "typed" }] },
      { silent: true, actorId: s.authorId },
    );
    const id = r?.data?.handoffId as string | undefined;
    if (!id) return;
    if (db.demo.network === "offline") {
      onClose();
      return;
    }
    dispatch(processHandoff, { handoffId: id }, { actorId: null, toastMessage: `New closeout from ${db.locations[s.locationId].name} is ready for review` });
    onClose();
    router.push(`/handoffs/${id}`);
  };

  return (
    <div className="flex flex-col gap-7 pb-6">
      <section ref={refs.guide} aria-labelledby="dg-guide">
        <h3 id="dg-guide" className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-steel-400">
          Four-minute story
        </h3>
        <ol className="flex flex-col gap-1">
          {guide.map((g, i) => (
            <li key={g.step}>
              <Link href={g.href} onClick={onClose} className={cx("flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-night-700", g === nextStep && "bg-night-700/70 ring-1 ring-safety/40")}>
                <span className={cx("mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full border font-mono text-xs", g.done ? "border-go bg-go-900 text-go" : g === nextStep ? "border-safety text-safety" : "border-night-500 text-steel-500")}>
                  {g.done ? <Check size={13} strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={cx("block text-[0.95rem]", g.done ? "text-steel-400" : "text-paper-100")}>{g.label}</span>
                  <span className="block text-xs text-steel-500">{g.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        {nextStep?.step === "switch" && (
          <Button variant="primary" className="mt-3 w-full" onClick={() => switchUser("u-luis", true)} icon={<ArrowRight size={16} />}>
            Switch to Luis at 6:15 AM
          </Button>
        )}
      </section>

      <section ref={refs.users} aria-labelledby="dg-users">
        <h3 id="dg-users" className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-steel-400">
          <UsersIcon size={14} /> View as
        </h3>
        <div className="flex flex-col gap-1.5">
          {DEMO_USERS.map((id) => {
            const u = db.users[id];
            const current = db.demo.currentUserId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => switchUser(id)}
                aria-pressed={current}
                className={cx("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors", current ? "border-safety/60 bg-night-700" : "border-night-600 hover:border-night-500 hover:bg-night-700")}
              >
                <Avatar user={u} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-paper-100">{u.name}</span>
                  <span className="block text-xs text-steel-400">
                    {ROLE_TITLE[u.role]} · {u.locationIds.length > 1 ? "All three stores" : db.locations[u.locationIds[0]].name}
                  </span>
                </span>
                {current && <span className="text-xs font-semibold text-safety">Viewing</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section ref={refs.clock} aria-labelledby="dg-clock">
        <h3 id="dg-clock" className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-steel-400">
          <Clock size={14} /> Demo clock
        </h3>
        <p className="mb-3 text-paper-100">
          <Mono className="text-steel-400">{fmtDay(now)}</Mono> <Mono className="text-xl">{fmtTime(now)}</Mono>
        </p>
        <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
          <Button onClick={() => jump(MORNING_ANCHOR, "Advanced to Wed 6:15 AM")}>Advance to morning</Button>
          <Button onClick={() => jump("2026-10-21T09:01:00Z", "Jumped to 9:01 AM: refund rule check")}>Jump to 9:01 AM</Button>
          <Button onClick={() => jump(DEMO_ANCHOR, "Back to Tue 10:40 PM close")}>Back to closing time</Button>
          <Button onClick={() => dispatch(setDemo, { clockFrozen: !db.demo.clockFrozen }, { local: true, toastMessage: db.demo.clockFrozen ? "Clock running" : "Clock frozen" })}>
            {db.demo.clockFrozen ? "Resume clock" : "Freeze clock"}
          </Button>
        </div>
      </section>

      <section ref={refs.sim} aria-labelledby="dg-sim" className="flex flex-col gap-4">
        <h3 id="dg-sim" className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-steel-400">
          <FlaskConical size={14} /> Simulate
        </h3>
        <Switch
          checked={db.demo.network === "offline"}
          onChange={(v) => setOnline(!v)}
          label={
            <span className="inline-flex items-center gap-2">
              <WifiOff size={15} /> Offline mode
            </span>
          }
          description="Captures queue on the device with an unsynced count."
        />
        <Switch
          checked={db.demo.simulateConflictNext}
          onChange={(v) => dispatch(setDemo, { simulateConflictNext: v }, { silent: true, local: true })}
          label="A teammate edits the same task"
          description="Your next claim or resolve collides with an edit from another phone."
        />
        <Switch
          checked={db.demo.failNextExtraction}
          onChange={(v) => dispatch(setDemo, { failNextExtraction: v }, { silent: true, local: true })}
          label="Next extraction fails"
          description="Shows the error state; the transcript is never lost."
        />
        <div className="flex flex-col gap-2 rounded-lg border border-night-600 p-3">
          <label htmlFor="dg-inject" className="text-[0.95rem] font-medium text-paper-100">
            Inject a closeout from another store
          </label>
          <Select id="dg-inject" value={sample} onChange={(e) => setSample(e.target.value)}>
            {SAMPLE_TRANSCRIPTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={inject}>
            Inject and open review
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-night-600 pt-5">
        <Button
          icon={<RotateCcw size={15} />}
          onClick={() => {
            dispatch(restartOnboarding, {}, { silent: true, local: true });
            dispatch(setDemo, { currentUserId: "u-jordan" }, { silent: true, local: true });
            onClose();
            router.push("/setup");
          }}
        >
          Restart onboarding
        </Button>
        <Button variant="ghost" className="text-signal hover:text-signal" onClick={() => setConfirmReset(true)}>
          Reset all demo data
        </Button>
      </section>

      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the demo?"
        description="This restores Nightjar Kitchens to its seeded state: nine nights of history, tonight's closeout not yet submitted, 10:40 PM on Tuesday."
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Keep my changes</Button>
            <Button
              variant="danger"
              onClick={() => {
                reset();
                setConfirmReset(false);
                onClose();
                router.push("/");
              }}
            >
              Reset demo data
            </Button>
          </>
        }
      />
    </div>
  );
}
