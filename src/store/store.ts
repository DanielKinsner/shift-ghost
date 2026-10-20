"use client";

import { create } from "zustand";
import { toast } from "sonner";
import type { DemoDB, ID, ISO } from "@/domain/types";
import {
  CommandError,
  ConflictError,
  flushQueuedHandoffs,
  nextId,
  processHandoff,
  remoteEdit,
  runCommand,
  runTimedRules,
  undoTouched,
  type Command,
  type CommandResult,
  type ConflictInfo,
  type Touched,
} from "@/domain/commands";
import { freshSeed } from "@/data/seed";
import { localStorageAdapter, type DataAdapter } from "@/data/adapter";
import { fromMs, toMs } from "@/domain/time";

export const adapter: DataAdapter = localStorageAdapter;

export function demoNow(demo: DemoDB["demo"], nowMs = Date.now()): ISO {
  if (demo.clockFrozen || !demo.clockSetAtMs) return demo.clockAnchor;
  const elapsed = Math.max(0, nowMs - demo.clockSetAtMs);
  // Round to the minute so renders are stable between ticks.
  return fromMs(Math.floor((toMs(demo.clockAnchor) + elapsed) / 60_000) * 60_000);
}

interface LastAction {
  label: string;
  touched: Touched[];
  prevDb: DemoDB;
  at: number;
}

export interface DispatchOptions {
  label?: string;
  undoable?: boolean;
  silent?: boolean;
  actorId?: ID | null;
  /** Message shown in the toast; defaults to the command's own message. */
  toastMessage?: string;
  /** Local-only demo controls don't go through the sync/outbox. */
  local?: boolean;
}

interface StoreState {
  db: DemoDB | null;
  hydrated: boolean;
  syncing: number;
  lastAction: LastAction | null;
  conflict: (ConflictInfo & { retry: () => void }) | null;
  hydrate: () => void;
  dispatch: <I>(cmd: Command<I>, input: I, opts?: DispatchOptions) => CommandResult | null;
  /** Task mutations go through here so demo conflict simulation can intercept them. */
  dispatchTask: <I extends { taskId: ID; expectedVersion?: number }>(cmd: Command<I>, input: I, opts?: DispatchOptions) => CommandResult | null;
  undo: () => void;
  clearConflict: () => void;
  replaceDb: (db: DemoDB) => void;
  reset: () => void;
  setOnline: (online: boolean) => void;
}

const WRITE_FREE_LABELS = new Set(["demo"]);

export const useStore = create<StoreState>((set, get) => {
  const persist = (db: DemoDB) => adapter.save(db);

  const simulateSync = () => {
    const db = get().db;
    if (!db || db.demo.network === "offline") return;
    set((s) => ({ syncing: s.syncing + 1 }));
    setTimeout(() => set((s) => ({ syncing: Math.max(0, s.syncing - 1) })), 650);
  };

  const dispatch: StoreState["dispatch"] = (cmd, input, opts = {}) => {
    const prev = get().db;
    if (!prev) return null;
    const ctx = { now: demoNow(prev.demo), actorId: opts.actorId === undefined ? prev.demo.currentUserId : opts.actorId };
    try {
      const { db, result } = runCommand(prev, cmd, input, ctx);
      if (!opts.local && db.demo.network === "offline" && !WRITE_FREE_LABELS.has(opts.label ?? "")) {
        db.demo.outbox.push({ id: nextId(db, "ob"), at: ctx.now, label: opts.label ?? result.message ?? "Change", kind: "action", refId: result.touched[0]?.id ?? null });
      }
      set({
        db,
        lastAction: opts.undoable ? { label: opts.label ?? result.message ?? "change", touched: result.touched, prevDb: prev, at: Date.now() } : get().lastAction,
      });
      persist(db);
      if (!opts.local) simulateSync();
      if (!opts.silent) {
        const message = opts.toastMessage ?? result.message ?? opts.label;
        if (message) {
          toast(message, {
            description: db.demo.network === "offline" && !opts.local ? "Saved on this device. Will sync when you're back online." : undefined,
            action: opts.undoable ? { label: "Undo", onClick: () => get().undo() } : undefined,
            duration: opts.undoable ? 6000 : 3500,
          });
        }
      }
      return result;
    } catch (e) {
      if (e instanceof ConflictError) {
        set({
          conflict: {
            ...e.info,
            retry: () => {
              const fresh = get().db;
              const task = fresh?.tasks[e.info.taskId];
              set({ conflict: null });
              if (task) get().dispatch(cmd, { ...(input as object), expectedVersion: task.version } as typeof input, opts);
            },
          },
        });
        return null;
      }
      if (e instanceof CommandError) {
        toast.error(e.message);
        return null;
      }
      throw e;
    }
  };

  return {
    db: null,
    hydrated: false,
    syncing: 0,
    lastAction: null,
    conflict: null,

    hydrate: () => {
      if (get().hydrated) return;
      let db = adapter.load();
      if (!db) {
        db = freshSeed(Date.now());
        persist(db);
      } else if (!db.demo.clockSetAtMs) {
        db.demo.clockSetAtMs = Date.now();
      }
      set({ db, hydrated: true });
      adapter.subscribe((external) => set({ db: external }));
    },

    dispatch,

    dispatchTask: (cmd, input, opts) => {
      const db = get().db;
      if (db?.demo.simulateConflictNext && db.tasks[input.taskId]) {
        // Another manager edits the same task a moment before this tap lands.
        const actor = db.demo.currentUserId === "u-bri" ? "u-luis" : "u-bri";
        const { db: edited } = runCommand(db, remoteEdit, { taskId: input.taskId, userId: actor }, { now: demoNow(db.demo), actorId: actor });
        edited.demo.simulateConflictNext = false;
        set({ db: edited });
        persist(edited);
      }
      return dispatch(cmd, input, opts);
    },

    undo: () => {
      const la = get().lastAction;
      const db = get().db;
      if (!la || !db) return;
      const next = undoTouched(db, la.prevDb, la.touched, { now: demoNow(db.demo), actorId: db.demo.currentUserId }, la.label);
      set({ db: next, lastAction: null });
      persist(next);
      simulateSync();
      toast("Undone", { description: la.label, duration: 2500 });
    },

    clearConflict: () => set({ conflict: null }),

    replaceDb: (db) => {
      set({ db });
      persist(db);
    },

    reset: () => {
      const db = freshSeed(Date.now());
      adapter.clear();
      persist(db);
      set({ db, lastAction: null, conflict: null });
    },

    setOnline: (online) => {
      const db = get().db;
      if (!db) return;
      if (online && db.demo.network === "offline") {
        const queued = db.demo.outbox.length;
        const { db: flushed, result } = runCommand(db, flushQueuedHandoffs, {}, { now: demoNow(db.demo), actorId: db.demo.currentUserId });
        flushed.demo.network = "online";
        let next = flushed;
        for (const id of (result.data?.ids as string[]) ?? []) {
          next = runCommand(next, processHandoff, { handoffId: id }, { now: demoNow(next.demo), actorId: null }).db;
        }
        set({ db: next });
        persist(next);
        simulateSync();
        const captures = ((result.data?.ids as string[]) ?? []).length;
        toast("Back online", { description: captures ? `${captures} closeout synced and processed.` : queued ? `${queued} queued change${queued === 1 ? "" : "s"} synced.` : "Everything is up to date." });
      } else if (!online) {
        const next = structuredClone(db);
        next.demo.network = "offline";
        set({ db: next });
        persist(next);
        toast("You're offline", { description: "Captures and changes are saved on this device and sync when you reconnect." });
      }
    },
  };
});

export function runClockRules() {
  const { db, dispatch } = useStore.getState();
  if (!db) return;
  dispatch(runTimedRules, {}, { silent: true, local: true, actorId: null });
}
