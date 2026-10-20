import type { DemoDB } from "@/domain/types";
import { SCHEMA_VERSION } from "./seed";

/**
 * Persistence boundary. The demo ships a localStorage adapter; a Supabase or
 * Postgres adapter would implement the same four methods (and the commands in
 * src/domain/commands.ts become API mutations). See DECISIONS D-31.
 */
export interface DataAdapter {
  load(): DemoDB | null;
  save(db: DemoDB): void;
  clear(): void;
  /** Called when another tab or device changes the data. */
  subscribe(onExternalChange: (db: DemoDB) => void): () => void;
}

const KEY = `shift-ghost:db:v${SCHEMA_VERSION}`;

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const localStorageAdapter: DataAdapter = {
  load() {
    const ls = safeStorage();
    if (!ls) return null;
    try {
      const raw = ls.getItem(KEY);
      if (!raw) return null;
      const db = JSON.parse(raw) as DemoDB;
      return db.schemaVersion === SCHEMA_VERSION ? db : null;
    } catch {
      return null;
    }
  },
  save(db) {
    const ls = safeStorage();
    if (!ls) return;
    try {
      ls.setItem(KEY, JSON.stringify(db));
    } catch {
      // Storage full or blocked (private mode). The demo keeps working in memory.
    }
  },
  clear() {
    const ls = safeStorage();
    try {
      ls?.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
  subscribe(onExternalChange) {
    if (typeof window === "undefined") return () => {};
    const handler = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        const db = JSON.parse(e.newValue) as DemoDB;
        if (db.schemaVersion === SCHEMA_VERSION) onExternalChange(db);
      } catch {
        /* ignore malformed */
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  },
};
