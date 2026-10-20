import Link from "next/link";
import { GhostMark } from "@/components/ui/brand";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-6">
      <GhostMark size={56} />
      <p className="font-mono text-sm text-steel-500">404</p>
      <h1 className="font-display text-5xl font-bold tracking-wide">Nothing was handed off here</h1>
      <p className="text-steel-300">This page doesn&apos;t exist, or it was cleared when the demo was reset.</p>
      <div className="flex gap-2">
        <Link href="/briefing" className="rounded-lg bg-safety px-4 py-2.5 font-semibold text-night-950">
          Open the brief
        </Link>
        <Link href="/" className="rounded-lg border border-night-500 px-4 py-2.5 text-paper-100">
          Demo home
        </Link>
      </div>
    </main>
  );
}
