"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CirclePlay, ArrowRight } from "lucide-react";
import { useStore } from "@/store/store";
import { useNow } from "@/store/hooks";
import { Wordmark } from "@/components/ui/brand";
import { Avatar, Button, Stamp, StatusLight, Tape, cx } from "@/components/ui/primitives";
import { ShiftLine } from "@/components/ui/ShiftLine";
import { setDemo } from "@/domain/commands";
import { guideProgress } from "@/domain/guide";
import { LANDING } from "@/components/shell/nav";
import { ROLE_TITLE } from "@/domain/permissions";

const ROLES = [
  { id: "u-maya", stamp: "Close · 14:30–23:00", does: "Record tonight's closeout, then confirm what Shift Ghost heard before it reaches the morning." },
  { id: "u-luis", stamp: "Open · 06:00–14:30", does: "Walk in at 6:15 AM to a brief, not a dashboard. Claim, resolve, escalate, or ask Maya." },
  { id: "u-bri", stamp: "Kitchen lead", does: "Pick up kitchen tasks from the brief. Rules and settings are off-limits, on purpose." },
  { id: "u-jordan", stamp: "Area · 3 stores", does: "See what keeps coming back across Downtown, Northgate and Canyon Plaza." },
];

export function Landing() {
  const router = useRouter();
  const db = useStore((s) => s.db);
  const dispatch = useStore((s) => s.dispatch);
  const now = useNow();

  const start = () => {
    if (!db) return;
    const next = guideProgress(db, now).find((g) => !g.done);
    if (!db.setup.completedAt) {
      // Setup belongs to the area manager; the closeout that follows belongs to Maya.
      dispatch(setDemo, { currentUserId: "u-jordan", currentLocationId: "loc-dtn" }, { silent: true, local: true });
      router.push("/setup");
      return;
    }
    if (next && (next.step === "submit" || next.step === "confirm")) dispatch(setDemo, { currentUserId: "u-maya", currentLocationId: "loc-dtn" }, { silent: true, local: true });
    router.push(next?.href ?? "/briefing");
  };

  const enterAs = (id: string) => {
    if (!db) return;
    const u = db.users[id];
    dispatch(setDemo, { currentUserId: id, currentLocationId: u.locationIds[0] }, { silent: true, local: true });
    router.push(LANDING[u.role]);
  };

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/explainer" className="rounded-md px-3 py-2 text-steel-300 hover:bg-night-800 hover:text-paper-100">
            Explainer
          </Link>
          <Link href="/briefing" className="hidden rounded-md px-3 py-2 text-steel-300 hover:bg-night-800 hover:text-paper-100 sm:inline">
            Open the app
          </Link>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-[1320px] px-4 pb-24 sm:px-8">
        <section className="grid items-center gap-10 py-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-14">
          <div className="flex flex-col items-start gap-6">
            <Stamp size="sm" rotate={-2}>
              Close · Downtown · Tue 20 Oct · 22:40
            </Stamp>
            <h1 className="font-display text-[2.6rem] font-bold leading-[0.98] tracking-[0.005em] text-paper-50 sm:text-6xl xl:text-[4.6rem]">
              Two minutes of talk at close. A brief the morning crew can act on.
            </h1>
            <p className="max-w-[34rem] text-lg leading-relaxed text-steel-300">
              Shift Ghost listens to a tired closing manager answer five questions, pulls out what broke, what ran low and what a guest is still owed, and hands the opening manager a prioritized brief. Every line points back to the sentence it came from.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="lg" onClick={start} disabled={!db} icon={<ArrowRight size={18} />} className="flex-row-reverse">
                Start the four-minute demo
              </Button>
              <Link href="/explainer">
                <Button size="lg" icon={<CirclePlay size={18} />}>
                  Watch the 45-second explainer
                </Button>
              </Link>
            </div>
            <p className="text-sm text-steel-500">Nightjar Kitchens is a fictional three-store restaurant group. All data is seeded and stays in this browser.</p>
          </div>

          <BeforeAfter />
        </section>

        <section aria-labelledby="line" className="py-10">
          <h2 id="line" className="sr-only">
            How a handoff moves
          </h2>
          <ShiftLine className="mx-auto max-w-4xl" />
        </section>

        <section aria-labelledby="roles" className="pt-10">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <h2 id="roles" className="font-display text-3xl font-semibold tracking-wide">
              Pick who you are tonight
            </h2>
            <p className="text-sm text-steel-400">You can switch people any time from Demo controls.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ROLES.map((r) => {
              const u = db?.users[r.id];
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => enterAs(r.id)}
                  disabled={!db}
                  className="panel plate group flex flex-col items-start gap-4 px-5 pb-5 pt-6 text-left transition-colors hover:border-steel-500 disabled:opacity-60"
                >
                  <Stamp tone="steel" size="xs" rotate={-1}>
                    {r.stamp}
                  </Stamp>
                  <div className="flex items-center gap-3">
                    {u ? <Avatar user={u} size={42} /> : <span className="skeleton h-[42px] w-[42px] rounded-full" />}
                    <div>
                      <p className="font-display text-xl font-semibold tracking-wide text-paper-100">{u?.name ?? " "}</p>
                      <p className="text-sm text-steel-400">{u ? `${ROLE_TITLE[u.role]} · ${u.locationIds.length > 1 ? "All stores" : db!.locations[u.locationIds[0]].name}` : " "}</p>
                    </div>
                  </div>
                  <p className="text-[0.95rem] leading-relaxed text-steel-300">{r.does}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-safety group-hover:underline">
                    Enter as {u?.firstName ?? "…"} <ArrowRight size={15} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-16 grid gap-3 text-sm md:grid-cols-2">
          <div className="panel px-5 py-4">
            <p className="mb-1 flex items-center gap-2 font-semibold text-paper-100">
              <StatusLight tone="ok" size={9} /> Working for real in this demo
            </p>
            <p className="text-steel-400">Extraction with evidence and confidence, review gate, rules, deduplication, pattern detection, offline queue, conflict detection, undo, audit trail.</p>
          </div>
          <div className="panel px-5 py-4">
            <p className="mb-1 flex items-center gap-2 font-semibold text-paper-100">
              <StatusLight tone="amber" size={9} /> Simulated behind clean boundaries
            </p>
            <p className="text-steel-400">Speech-to-text (the mic waveform is live; the words come from the seeded script), text and team-chat delivery, scheduling, inventory and maintenance connectors.</p>
          </div>
        </section>
      </main>
    </div>
  );
}

const NOTES = [
  { text: "ice machine AGAIN??", r: -6, x: "4%", y: "6%" },
  { text: "tbl 12 refund — call?", r: 4, x: "48%", y: "0%" },
  { text: "cups → NGT (last one)", r: -3, x: "22%", y: "34%" },
  { text: "door beeped 2x ??", r: 7, x: "62%", y: "30%" },
];

function BeforeAfter() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="relative h-40 sm:h-44" aria-label="Before: sticky notes and group texts" role="img">
        {NOTES.map((n) => (
          <span
            key={n.text}
            className="absolute rounded-sm bg-[#d8cf9e] px-3 py-2 font-mono text-[0.82rem] text-ink shadow-[0_8px_16px_-8px_rgba(0,0,0,0.9)] opacity-80"
            style={{ left: n.x, top: n.y, transform: `rotate(${n.r}deg)` }}
          >
            {n.text}
          </span>
        ))}
        <span className="absolute bottom-0 right-0 font-display text-sm font-semibold uppercase tracking-widest text-steel-500">Before</span>
      </div>
      <Tape className="my-4" />
      <div className="relative">
      <div className="thermal rounded-t-md px-5 pt-5 sm:px-7" role="img" aria-label="After: the opening brief">
        <div className="flex items-baseline justify-between gap-3 font-mono text-[0.72rem] uppercase tracking-wider text-ink-soft">
          <span>Opening brief · Downtown</span>
          <span>Wed 21 Oct · 06:00</span>
        </div>
        <hr className="thermal-rule my-3" />
        <ul className="flex flex-col gap-3 text-[0.95rem]">
          {[
            { tone: "text-paper-red", sev: "Critical", t: "Ice machine grinding again", d: "6th mention in 9 days" },
            { tone: "text-[#9a4300]", sev: "High", t: "Large cups out, lent to Northgate", d: "None before the lunch rush" },
            { tone: "text-[#9a4300]", sev: "High", t: "Table 12 refund still not received", d: "Luis · before lunch" },
          ].map((row) => (
            <li key={row.t} className="grid grid-cols-[4.5rem_1fr] gap-2">
              <span className={cx("font-display text-sm font-bold uppercase tracking-wider", row.tone)}>{row.sev}</span>
              <span>
                <span className="block font-semibold text-ink">{row.t}</span>
                <span className="block text-sm text-ink-soft">{row.d}</span>
              </span>
            </li>
          ))}
        </ul>
        <hr className="thermal-rule my-3" />
        <p className="font-mono text-[0.75rem] leading-relaxed text-ink-soft">
          “Ice machine started making that grinding noise again around eight twenty.” <span className="whitespace-nowrap">— Maya, 10:41 PM</span>
        </p>
      </div>
      <span className="absolute -bottom-3 right-4">
        <Stamp tone="safety" size="sm" rotate={-6} className="bg-night-900/90">
          After
        </Stamp>
      </span>
      </div>
    </div>
  );
}
