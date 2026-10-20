"use client";

import Link from "next/link";
import { GhostMark } from "@/components/ui/brand";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" role="alert" className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-6">
      <GhostMark size={56} />
      <p className="font-mono text-sm text-signal">Error{error.digest ? ` · ${error.digest}` : ""}</p>
      <h1 className="font-display text-5xl font-bold tracking-wide">This screen hit a problem</h1>
      <p className="text-steel-300">Your closeouts and tasks are saved on this device. Try the screen again; if it keeps failing, reset the demo from Demo controls.</p>
      <p className="font-mono text-xs text-steel-500">{error.message}</p>
      <div className="flex gap-2">
        <button type="button" onClick={reset} className="rounded-lg bg-safety px-4 py-2.5 font-semibold text-night-950">
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-night-500 px-4 py-2.5 text-paper-100">
          Demo home
        </Link>
      </div>
    </main>
  );
}
