"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Keyboard, Mic, Pause, Play, RotateCcw, Square, Volume2, WifiOff, X } from "lucide-react";
import { useStore } from "@/store/store";
import { useCurrentUser, useDb, useNow, useReducedMotionPref } from "@/store/hooks";
import { activeQuestions, createHandoff } from "@/domain/commands";
import { CaptureAnswerSchema } from "@/domain/schemas";
import { PRIMARY_ANSWERS } from "@/data/transcripts";
import { tonightsHandoff } from "@/domain/guide";
import { fmtDay, fmtElapsed, fmtTime, fmtRelative, at, dayKey, addDays } from "@/domain/time";
import { GhostMark } from "@/components/ui/brand";
import { Button, ButtonLink, Mono, Stamp, StatusLight, cx } from "@/components/ui/primitives";
import { Textarea, Switch } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { Waveform } from "@/components/ui/Waveform";
import { PermissionDenied } from "@/components/ui/states";
import { can, ROLE_TITLE } from "@/domain/permissions";
import { createSpeechRecognizer, speechRecognitionSupported, useRecorder } from "./useRecorder";

interface Answer {
  text: string;
  durationSec: number;
  source: "voice" | "typed" | "seeded";
  audioUrl: string | null;
}

type Phase = "intro" | "question" | "review" | "queued";

const SEEDED: Record<string, (typeof PRIMARY_ANSWERS)[number]> = Object.fromEntries(PRIMARY_ANSWERS.map((a) => [a.questionId, a]));

export function Capture() {
  const db = useDb();
  const user = useCurrentUser();
  const now = useNow();
  const router = useRouter();
  const dispatch = useStore((s) => s.dispatch);
  const reduce = useReducedMotionPref();
  const questions = useMemo(() => activeQuestions(db), [db]);
  const location = db.locations[db.demo.currentLocationId];
  const close = Object.values(db.shiftTemplates).find((t) => t.locationId === location.id && t.kind === "close");
  const shiftDate = Number(now.slice(11, 13)) < 6 ? addDays(dayKey(now), -1) : dayKey(now);
  const dueAt = at(shiftDate, close?.handoffAt ?? "22:45");
  const existing = location.id === "loc-dtn" ? tonightsHandoff(db) : undefined;

  const [phase, setPhase] = useState<Phase>("intro");
  const [mode, setMode] = useState<"voice" | "typed">("voice");
  const [useBrowserSpeech, setUseBrowserSpeech] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map(() => ({ text: "", durationSec: 0, source: "voice", audioUrl: null })));
  const [liveText, setLiveText] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedId, setQueuedId] = useState<string | null>(null);
  const rec = useRecorder();
  const speech = useRef<ReturnType<typeof createSpeechRecognizer>>(null);
  const pressAt = useRef(0);
  const wasRecording = useRef(false);

  const q = questions[index];
  const seeded = q ? SEEDED[q.id] : undefined;
  const offline = db.demo.network === "offline";
  const anyAnswer = answers.some((a) => a.text.trim());

  // Simulated transcription: reveal the seeded words at speaking pace while recording.
  const seededWords = (seeded?.text ?? "").split(" ");
  const heardSoFar = useBrowserSpeech ? liveText : seededWords.slice(0, Math.min(seededWords.length, Math.floor(rec.elapsed * 3.1))).join(" ");

  if (!can(user, "capture")) return <PermissionDenied permission="capture" what="Closeout capture" role={ROLE_TITLE[user.role]} />;

  const setAnswer = (i: number, patch: Partial<Answer>) => setAnswers((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const startRec = async () => {
    setLiveText("");
    setError(null);
    if (useBrowserSpeech) {
      speech.current = createSpeechRecognizer((t) => setLiveText(t));
      speech.current?.start();
    }
    await rec.start();
  };

  const stopRec = async () => {
    speech.current?.stop();
    const { url, durationSec } = await rec.stop();
    const heard = useBrowserSpeech ? liveText : seeded?.text ?? "";
    setAnswer(index, { text: heard || answers[index].text, durationSec: Math.max(durationSec, 1), source: "voice", audioUrl: url ?? answers[index].audioUrl });
    if (!heard) setError("No words came through. Type the answer, or record again.");
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pressAt.current = Date.now();
    wasRecording.current = rec.recording;
    if (!rec.recording) void startRec();
  };
  const onPointerUp = () => {
    const held = Date.now() - pressAt.current;
    // Hold-to-talk releases stop; a quick tap starts, a second tap stops.
    if (wasRecording.current || held > 450) void stopRec();
  };
  const onKeyToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail !== 0) return; // pointer handled above; keyboard "clicks" have detail 0
    if (rec.recording) void stopRec();
    else void startRec();
  };

  const goNext = () => {
    if (rec.recording) return;
    const parsed = CaptureAnswerSchema.safeParse({ text: answers[index].text });
    if (!parsed.success && answers[index].text.trim()) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    setLiveText("");
    if (index < questions.length - 1) setIndex(index + 1);
    else setPhase("review");
  };

  const useSeededAll = () => {
    setAnswers(questions.map((qq) => ({ text: SEEDED[qq.id]?.text ?? "", durationSec: SEEDED[qq.id]?.durationSec ?? 0, source: "seeded", audioUrl: null })));
    setPhase("review");
  };

  const submit = () => {
    const payload = questions
      .map((qq, i) => ({ questionId: qq.id, prompt: qq.prompt, text: answers[i].text.trim(), durationSec: Math.round(answers[i].durationSec), source: answers[i].source }))
      .filter((a) => a.text);
    const r = dispatch(
      createHandoff,
      { locationId: location.id, authorId: user.id, mode: "guided", hasRecording: answers.some((a) => a.source !== "typed"), answers: payload, queued: offline, shiftDate },
      { toastMessage: offline ? "Closeout saved on this device" : "Closeout submitted" },
    );
    const id = r?.data?.handoffId as string | undefined;
    if (!id) return;
    if (offline) {
      setQueuedId(id);
      setPhase("queued");
    } else {
      router.push(`/handoffs/${id}?fresh=1`);
    }
  };

  const totalSec = answers.reduce((s, a) => s + a.durationSec, 0);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top strip: deliberately sparse */}
      <header className="flex items-center gap-3 px-4 pb-2 pt-4 sm:px-6">
        <button type="button" onClick={() => (anyAnswer && phase !== "queued" ? setConfirmLeave(true) : router.push("/briefing"))} className="grid h-10 w-10 place-items-center rounded-full text-steel-300 hover:bg-night-800" aria-label="Leave closeout">
          <X size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[0.95rem] font-semibold tracking-wide">
            {location.name} close · {fmtDay(dueAt)}
          </p>
          <p className="font-mono text-xs text-steel-400">Due {fmtTime(dueAt)} · {fmtRelative(dueAt, now)}</p>
        </div>
        {offline && (
          <span className="flex items-center gap-1.5 rounded-full border border-amber/50 px-2.5 py-1 text-xs text-amber">
            <WifiOff size={13} /> Offline
          </span>
        )}
      </header>

      {phase === "question" && (
        <div className="px-4 sm:px-6" role="progressbar" aria-label="Closeout progress" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={index + 1} aria-valuetext={`Question ${index + 1} of ${questions.length}`}>
          <div className="mx-auto flex max-w-md gap-1.5">
            {questions.map((_, i) => (
              <span key={i} className={cx("h-1.5 flex-1 rounded-full", i < index || answers[i].text ? (i === index ? "bg-safety" : "bg-steel-300") : i === index ? "bg-safety" : "bg-night-600")} />
            ))}
          </div>
        </div>
      )}

      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-6 sm:px-6">
        <AnimatePresence mode="wait">
          {phase === "intro" && (
            <motion.section key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col pt-8">
              <Stamp rotate={-2} className="self-start">
                Close · {location.code} · {fmtDay(dueAt)}
              </Stamp>
              <h1 className="mt-6 font-display text-[2.6rem] font-bold leading-[1.02] tracking-wide">Five questions. About two minutes.</h1>
              <p className="mt-3 text-steel-300">
                Talk like you&apos;d text the morning manager. Shift Ghost pulls out the problems, ties each one to what you said, and asks you to check anything it isn&apos;t sure about.
              </p>

              {existing && existing.status !== "draft" && (
                <div className="panel mt-6 flex items-center gap-3 px-4 py-3">
                  <StatusLight tone={existing.status === "published" ? "ok" : "amber"} size={10} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="text-paper-100">Tonight&apos;s closeout was submitted at {fmtTime(existing.submittedAt ?? existing.createdAt)}.</p>
                    <p className="text-steel-400">{existing.status === "published" ? "Published to the opening crew." : existing.status === "queued" ? "Waiting to sync." : "Waiting for review."}</p>
                  </div>
                  <Link href={`/handoffs/${existing.id}`} className="text-sm font-semibold text-safety hover:underline">
                    Open
                  </Link>
                </div>
              )}

              <div className="mt-8 flex flex-col gap-3">
                <div role="radiogroup" aria-label="How do you want to answer?" className="grid grid-cols-2 gap-2">
                  {(["voice", "typed"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      onClick={() => setMode(m)}
                      className={cx("flex items-center justify-center gap-2 rounded-xl border px-3 py-4 font-medium", mode === m ? "border-safety bg-night-800 text-paper-100" : "border-night-600 text-steel-400")}
                    >
                      {m === "voice" ? <Mic size={18} /> : <Keyboard size={18} />}
                      {m === "voice" ? "Talk" : "Type"}
                    </button>
                  ))}
                </div>
                {mode === "voice" && (
                  <div className="rounded-xl border border-night-600 p-3">
                    <Switch
                      checked={useBrowserSpeech}
                      onChange={setUseBrowserSpeech}
                      disabled={!speechRecognitionSupported()}
                      label="Transcribe my own words"
                      description={speechRecognitionSupported() ? "Uses this browser's speech service. Off: demo words come from Maya's script while the mic waveform stays live." : "This browser has no speech service. Demo words come from Maya's script."}
                    />
                  </div>
                )}
                <Button variant="primary" size="lg" className="mt-2 h-14 text-lg" onClick={() => setPhase("question")}>
                  Start closeout
                </Button>
                <button type="button" onClick={useSeededAll} className="py-2 text-sm text-steel-300 underline-offset-4 hover:text-paper-100 hover:underline">
                  Demo shortcut: fill in Maya&apos;s five answers
                </button>
              </div>
            </motion.section>
          )}

          {phase === "question" && q && (
            <motion.section key={`q-${index}`} initial={{ opacity: 0, x: reduce ? 0 : 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : -24 }} transition={{ duration: 0.22 }} className="flex flex-1 flex-col pt-6">
              <p className="font-mono text-sm text-steel-400">
                Question {index + 1} of {questions.length}
              </p>
              <h1 className="mt-2 font-display text-[2rem] font-bold leading-[1.08] tracking-wide sm:text-[2.2rem]">{q.prompt}</h1>
              {q.hint && <p className="mt-2 text-steel-400">{q.hint}</p>}

              {mode === "voice" ? (
                <>
                  <div className="mt-6 rounded-2xl border border-night-600 bg-night-850 px-3 pb-3 pt-4">
                    <Waveform active={rec.recording && !rec.paused} analyser={rec.mic === "live" ? rec.analyser : null} height={84} reducedMotion={reduce} />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs text-steel-400">
                        <StatusLight tone={rec.recording ? (rec.paused ? "amber" : "critical") : "normal"} off={!rec.recording} pulse={rec.recording && !rec.paused} size={9} />
                        {rec.recording ? (rec.paused ? "Paused" : "Recording") : answers[index].text ? "Recorded" : "Ready"}
                        {rec.mic === "simulated" && <span className="text-steel-500">· simulated mic</span>}
                      </span>
                      <Mono className="text-2xl text-paper-100" aria-live="off">
                        {fmtElapsed(rec.recording ? rec.elapsed : answers[index].durationSec)}
                      </Mono>
                    </div>
                  </div>

                  <div className="mt-4 min-h-[5.5rem]" aria-live="polite">
                    {rec.recording ? (
                      <p className="text-[1.05rem] leading-relaxed text-steel-100">
                        {heardSoFar}
                        <span className="ml-0.5 inline-block h-5 w-0.5 translate-y-1 animate-pulse bg-safety" aria-hidden />
                      </p>
                    ) : answers[index].text ? (
                      <Textarea aria-label="Transcript of your answer. Edit any words that are wrong." value={answers[index].text} onChange={(e) => setAnswer(index, { text: e.target.value })} className="min-h-28 text-[1.02rem]" />
                    ) : (
                      <p className="text-steel-500">Your words appear here as you talk.</p>
                    )}
                  </div>

                  <div className="mt-auto flex flex-col items-center pt-4">
                    <div className="flex items-center gap-6">
                      <button
                        type="button"
                        onClick={() => (rec.paused ? rec.resume() : rec.pause())}
                        disabled={!rec.recording}
                        className="grid h-14 w-14 place-items-center rounded-full border border-night-500 text-steel-300 disabled:opacity-0"
                        aria-label={rec.paused ? "Resume recording" : "Pause recording"}
                      >
                        {rec.paused ? <Play size={20} /> : <Pause size={20} />}
                      </button>
                      <button
                        type="button"
                        onPointerDown={onPointerDown}
                        onPointerUp={onPointerUp}
                        onClick={onKeyToggle}
                        onContextMenu={(e) => e.preventDefault()}
                        aria-pressed={rec.recording}
                        aria-label={rec.recording ? "Stop recording" : answers[index].text ? "Record this answer again" : "Hold to talk, or tap to start recording"}
                        className={cx(
                          "relative grid h-32 w-32 touch-none select-none place-items-center rounded-full transition-transform active:scale-95",
                          rec.recording ? "bg-signal text-night-950" : "bg-safety text-night-950",
                        )}
                        style={{ boxShadow: rec.recording ? "0 0 0 10px rgba(255,74,61,0.18), 0 0 60px -6px rgba(255,74,61,0.8)" : "0 0 0 10px rgba(255,107,26,0.12), 0 14px 40px -12px rgba(255,107,26,0.9), inset 0 -6px 0 rgba(0,0,0,0.18)" }}
                      >
                        {rec.recording ? <Square size={38} fill="currentColor" /> : answers[index].text ? <RotateCcw size={40} /> : <Mic size={46} strokeWidth={2.2} />}
                      </button>
                      <span className="h-14 w-14" aria-hidden />
                    </div>
                    <p className="mt-4 text-sm text-steel-400">{rec.recording ? "Release or tap to stop" : answers[index].text ? "Tap to record again" : "Hold to talk, or tap once to start"}</p>
                  </div>
                </>
              ) : (
                <div className="mt-6 flex flex-1 flex-col gap-2">
                  <Textarea autoFocus aria-label={q.prompt} value={answers[index].text} onChange={(e) => setAnswer(index, { text: e.target.value, source: "typed" })} className="min-h-40 text-[1.05rem]" placeholder="Type it the way you'd say it." />
                  {seeded && !answers[index].text && (
                    <button type="button" onClick={() => setAnswer(index, { text: seeded.text, source: "seeded", durationSec: seeded.durationSec })} className="self-start text-sm text-steel-300 underline-offset-4 hover:underline">
                      Use Maya&apos;s answer
                    </button>
                  )}
                </div>
              )}

              {error && (
                <p role="alert" className="mt-3 text-sm text-amber">
                  {error}
                </p>
              )}

              <div className="mt-6 flex items-center gap-2">
                <Button variant="ghost" onClick={() => (index === 0 ? setPhase("intro") : setIndex(index - 1))} disabled={rec.recording} icon={<ArrowLeft size={16} />}>
                  Back
                </Button>
                <Button variant="ghost" onClick={() => (index < questions.length - 1 ? setIndex(index + 1) : setPhase("review"))} disabled={rec.recording} className="ml-auto">
                  Skip
                </Button>
                <Button variant="primary" onClick={goNext} disabled={rec.recording || !answers[index].text.trim()} icon={<ArrowRight size={16} />} className="flex-row-reverse">
                  {index < questions.length - 1 ? "Next" : "Review"}
                </Button>
              </div>
            </motion.section>
          )}

          {phase === "review" && (
            <motion.section key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col pt-6">
              <p className="font-mono text-sm text-steel-400">
                {answers.filter((a) => a.text.trim()).length} of {questions.length} answered · {fmtElapsed(totalSec)}
              </p>
              <h1 className="mt-2 font-display text-[2.2rem] font-bold leading-tight tracking-wide">Read it back once</h1>
              <p className="mt-1 text-steel-400">Fix any words the mic got wrong. Nothing is sent until you submit.</p>
              <ol className="mt-5 flex flex-col gap-3">
                {questions.map((qq, i) => (
                  <li key={qq.id} className="panel px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-steel-300">
                        <span className="font-mono text-steel-500">{i + 1}.</span> {qq.prompt}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setIndex(i);
                          setPhase("question");
                        }}
                        className="flex-none text-xs font-semibold text-safety hover:underline"
                      >
                        {answers[i].text ? "Redo" : "Answer"}
                      </button>
                    </div>
                    {answers[i].text ? (
                      <>
                        <Textarea aria-label={`Answer to: ${qq.prompt}`} value={answers[i].text} onChange={(e) => setAnswer(i, { text: e.target.value })} className="mt-2 min-h-20 border-night-600 bg-night-900/60 text-[0.98rem]" />
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-steel-500">
                          <Mono>{fmtElapsed(answers[i].durationSec)}</Mono>
                          <span>{answers[i].source === "typed" ? "Typed" : answers[i].source === "seeded" ? "Seeded demo answer" : "Recorded"}</span>
                          {answers[i].audioUrl && <AudioButton url={answers[i].audioUrl!} />}
                        </div>
                      </>
                    ) : (
                      <p className="mt-1 text-sm italic text-steel-500">Skipped</p>
                    )}
                  </li>
                ))}
              </ol>
              <div className="sticky bottom-0 -mx-4 mt-6 border-t border-night-700 bg-night-900/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
                <Button variant="primary" size="lg" className="h-14 w-full text-lg" onClick={submit} disabled={!anyAnswer} icon={<Check size={20} />}>
                  {offline ? "Save closeout on this device" : "Submit closeout"}
                </Button>
                <p className="mt-2 text-center text-xs text-steel-500">{offline ? "It syncs and processes when you're back online." : "You'll check what Shift Ghost extracted before it reaches the morning."}</p>
              </div>
            </motion.section>
          )}

          {phase === "queued" && (
            <motion.section key="queued" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col items-start pt-10">
              <span className="grid h-16 w-16 place-items-center rounded-2xl border border-amber/50 bg-amber-900/50">
                <WifiOff className="text-amber" />
              </span>
              <h1 className="mt-6 font-display text-[2.2rem] font-bold leading-tight tracking-wide">Saved on this phone</h1>
              <p className="mt-2 text-steel-300">You&apos;re offline. Your closeout is safe here and will upload, process and reach review as soon as there&apos;s signal.</p>
              <div className="panel mt-6 flex w-full items-center gap-3 px-4 py-3">
                <StatusLight tone="amber" pulse size={10} />
                <span className="text-sm text-paper-100">1 closeout waiting to sync</span>
                <Mono className="ml-auto text-xs text-steel-500">{queuedId}</Mono>
              </div>
              <p className="mt-6 text-sm text-steel-400">Turn offline mode off in Demo controls to watch it sync.</p>
              <ButtonLink href="/handoffs" className="mt-4">See all handoffs</ButtonLink>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <Dialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Leave without submitting?"
        description="Your answers aren't saved yet. The opening manager won't get tonight's brief until a closeout is submitted."
        footer={
          <>
            <Button onClick={() => setConfirmLeave(false)}>Keep going</Button>
            <Button variant="danger" onClick={() => router.push("/briefing")}>
              Leave and discard
            </Button>
          </>
        }
      />
      <span className="sr-only">
        <GhostMark />
      </span>
    </div>
  );
}

function AudioButton({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          const a = ref.current;
          if (!a) return;
          if (playing) a.pause();
          else void a.play();
        }}
        className="inline-flex items-center gap-1 text-steel-300 hover:text-paper-100"
      >
        <Volume2 size={13} /> {playing ? "Stop" : "Play"}
      </button>
      <audio ref={ref} src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    </>
  );
}
