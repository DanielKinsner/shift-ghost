# Decisions

Consequential product, design, and technical decisions for the Shift Ghost demo, with the reasoning behind each. Newest decisions are appended at the bottom of each section.

## Product

**D-01 · The handoff is the product, not the dashboard.** Every screen is organized around one closeout becoming one briefing. Navigation follows the shift: Capture (closing crew) → Review (closing crew) → Briefing (opening crew) → Patterns (area manager). Settings-type screens (rules, locations, team, audit) sit behind a quieter "Operations" group.

**D-02 · Guided capture uses the five closeout questions; the seeded demo transcript is split across them.** The brief's primary transcript is one monologue, but the storyboard shows "five voice answers". The seeded transcript is split into five answers at natural sentence boundaries, and the joined answers equal the brief's transcript exactly. Evidence spans point at offsets in the joined transcript, so the original text is always reconstructable.

**D-03 · Extraction is a deterministic, explainable rule engine standing in for an LLM.** No paid APIs are needed. The engine is lexicon- and pattern-based (`src/domain/extraction`). It records *why* it believes something (`inferences[]`), never invents a field without flagging it, and sends anything it can't classify to an "Unmapped" tray instead of dropping it. The engine sits behind an `Extractor` interface so an LLM-backed extractor can replace it.

**D-04 · Confidence is language, not percentages.** `high`, `review`, `uncertain`. An item drops below `high` when a field is inferred (e.g. "borrowed our last sleeve" → 0 on hand), when a reference is resolved from a pronoun, or when the speaker hedges ("I think", "maybe"). Anything below `high` blocks publishing until a person confirms, corrects, or dismisses it.

**D-05 · Issues persist across shifts; mentions accumulate.** A new extracted item that matches an open issue's subject (e.g. `asset:ice-machine` at Downtown) attaches to that issue as a new mention instead of creating a duplicate. That is what powers both task deduplication and recurring-pattern intelligence.

**D-06 · One sentence, one item.** When a sentence maps to more than one category ("Luis needs to call them before lunch" = task + customer follow-up), the engine merges into one item and records the merge, so the reviewer sees "also matched: next-shift task — merged to avoid a duplicate".

**D-07 · Patterns describe correlation only.** Pattern copy uses "mentioned", "clusters after", "co-occurs with"; never "caused by". Every pattern links to its evidence (the exact sentences). False alarms are shown but excluded from counts; contradictory reports are shown side by side without picking a winner.

**D-08 · Labor-hour estimates come from crew-stated durations.** "Shut it down for ten minutes" → 10 minutes. No invented ROI; the UI labels the number "crew-reported".

**D-09 · Demo clock.** The demo runs on its own clock anchored to Tuesday 20 Oct 2026, 10:40 PM (Downtown close). "Advance time to morning" jumps to Wednesday 6:15 AM. All seeded data is relative to the anchor so the demo is deterministic whenever it's viewed.

**D-10 · Integrations are simulated behind a connector boundary.** Team chat, scheduling, inventory, and maintenance-ticket connectors show the exact payload they *would* send, and "Send test" writes a delivery log entry. This answers the commercial question ("can it send into our tools?") without live credentials.

## Design

**D-20 · Industrial night-shift palette (from the brief).** Night `#0B1017`, surfaces `#141C27`, dirty paper `#E9E4D6`, safety orange `#FF6B1A`, reflective silver `#B7BFC8`, warning red `#FF4A3D` (on paper: `#B3261E`). All text pairs checked for WCAG AA.

**D-21 · Type.** Archivo Narrow for display and stamped labels; IBM Plex Sans for body; IBM Plex Mono only for timestamps and durations (as the brief specifies).

**D-22 · One bold element.** The morning briefing prints as a thermal-paper receipt against the dark interface. Everything else stays quiet so that moment and the handoff transformation animation carry the personality.

**D-23 · Physical status lights.** Severity and sync state use a bezel-and-lens LED component, not colored pills. Critical lights pulse only when not acknowledged, and never under `prefers-reduced-motion`.

## Technical

**D-30 · Next.js 16.4 App Router, React 19, TypeScript, Tailwind v4.** Pages are client-rendered over a local data store; the server renders skeletons that match final layout so hydration never causes layout jumps.

**D-31 · Local-first store behind an adapter.** Zustand holds a normalized `DemoDB`. All mutations are pure functions in `src/domain/commands.ts` (`(db, input) → db`), each writing audit events. Persistence goes through a `DataAdapter` interface (`src/data/adapter.ts`); the shipped implementation is `localStorage`. A Supabase/Postgres adapter would implement the same interface, and each command maps 1:1 to a future API mutation.

**D-32 · Optimistic UI with undo.** Actions apply immediately and show an undo toast. A simulated sync layer marks changes "saving → synced"; when offline they queue in an outbox with a visible unsynced count.

**D-33 · Conflicts via entity versions.** Tasks carry a `version`. Commands take the version the UI rendered; a mismatch raises a conflict dialog naming who changed what. Cross-tab edits sync through the `storage` event, so two browser tabs as two managers produce a real conflict.

**D-34 · Remotion lives in `/remotion` and shares the repo root.** One `package.json`; Remotion's `public/` is the Next `public/` folder, so `staticFile()` works in both the Remotion CLI and the in-app `@remotion/player`. Zod is pinned to the version Remotion requires (4.5.4).

**D-35 · Tests.** Vitest for the extraction fixtures, rule evaluation, pattern detection and task deduplication; Playwright for the end-to-end setup → closeout → morning claim → resolution journey.
