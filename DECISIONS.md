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

**D-11 · Setup belongs to the area manager; the closeout belongs to Maya.** "Start the four-minute demo" signs in as Jordan for setup, then hands over to Maya for the closeout. Running setup as a closing manager shows a permission screen, which is what a real workspace would do.

**D-12 · Seeded history predates setup.** The nine nights of history represent the pilot so far. Setup re-runs on the same workspace (it is resumable and can be restarted from Demo controls or Settings) so a reviewer can configure Nightjar without wiping the evidence that makes patterns meaningful.

**D-13 · The demo clock ticks.** It starts at Tuesday 10:40 PM and moves in real time, so "due in 4 min" and "doors open in 4h 15m" stay honest. Demo controls jump to 6:15 AM, 9:01 AM (the refund rule) or back, and can freeze the clock.

**D-14 · Inventory tasks come from a rule, aggregated per store.** "Below par → order prep" creates one open order-prep task per store; later shortages append to it instead of creating a second task. Placing the order closes the stock threads it covered.

**D-15 · Mentions keep their state.** A mention is a fault, an all-clear ("held 350 all night"), handled on shift, a transfer, or a false alarm. All-clears never rename an issue thread; a fault after a resolution reopens it and is called out as "came back" in the brief.

**D-16 · The previous shift answers.** "Ask Maya" sends a real comment and notification; in demo mode a canned reply arrives a few seconds later so the loop visibly closes. Replies are written as Maya would say them, specific to the item.

## Design

**D-20 · Industrial night-shift palette (from the brief).** Night `#0B1017`, surfaces `#141C27`, dirty paper `#E9E4D6`, safety orange `#FF6B1A`, reflective silver `#B7BFC8`, warning red `#FF4A3D` (on paper: `#B3261E`). All text pairs checked for WCAG AA.

**D-21 · Type.** Archivo Narrow for display and stamped labels; IBM Plex Sans for body; IBM Plex Mono only for timestamps and durations (as the brief specifies).

**D-22 · One bold element.** The morning briefing prints as a thermal-paper receipt against the dark interface. Everything else stays quiet so that moment and the handoff transformation animation carry the personality.

**D-23 · Physical status lights.** Severity and sync state use a bezel-and-lens LED component, not colored pills. Critical lights pulse only when not acknowledged, and never under `prefers-reduced-motion`.

**D-24 · The portfolio attribution stays at the edge of the product.** The landing footer identifies Daniel Kinsner and links to the portfolio and source; the operational app shell remains fully in-world. That lets a buyer find the builder without weakening the product illusion during the walkthrough.

## Technical

**D-30 · Next.js 16.4 App Router, React 19, TypeScript, Tailwind v4.** Pages are client-rendered over a local data store; the server renders skeletons that match final layout so hydration never causes layout jumps.

**D-31 · Local-first store behind an adapter.** Zustand holds a normalized `DemoDB`. All mutations are pure functions in `src/domain/commands.ts` (`(db, input) → db`), each writing audit events. Persistence goes through a `DataAdapter` interface (`src/data/adapter.ts`); the shipped implementation is `localStorage`. A Supabase/Postgres adapter would implement the same interface, and each command maps 1:1 to a future API mutation.

**D-32 · Optimistic UI with undo.** Actions apply immediately and show an undo toast. A simulated sync layer marks changes "saving → synced"; when offline they queue in an outbox with a visible unsynced count.

**D-33 · Conflicts via entity versions.** Tasks carry a `version`. Commands take the version the UI rendered; a mismatch raises a conflict dialog naming who changed what. Cross-tab edits sync through the `storage` event, so two browser tabs as two managers produce a real conflict.

**D-34 · Remotion lives in `/remotion` and shares the repo root.** One `package.json`; Remotion's `public/` is the Next `public/` folder, so `staticFile()` works in both the Remotion CLI and the in-app `@remotion/player`. Zod is pinned to the version Remotion requires (4.5.4).

**D-35 · Tests.** Vitest for the extraction fixtures, rule evaluation, pattern detection and task deduplication; Playwright for the end-to-end setup → closeout → morning claim → resolution journey.

**D-36 · Hydration-gated pages opt out of instant-navigation validation.** Next 16.4 with Cache Components validates that navigations render instantly. Every app page renders from on-device data after hydration (with a layout-matched skeleton before), so each page sets `export const instant = false`. A hosted data adapter would move data reads to the server and let these pages opt back in.

**D-37 · Microphone first, simulated second.** `useRecorder` uses MediaRecorder and an AnalyserNode for a live waveform and playable answers. If the mic is unavailable or blocked (as in embedded previews), it falls back to a simulated waveform and says so. Words come from the seeded script unless the closer opts into the browser speech service. Either way the transcript is editable before submitting.

**D-38 · The transformation is a shared-layout animation.** Each item renders as a chip inline after its evidence span, then moves into its category column via a shared `layoutId`. It plays once per closeout and is skipped entirely under `prefers-reduced-motion`.

**D-39 · Tests are layered.** Unit tests cover the pure domain (extraction fixtures including the brief's exact expected extraction, rules, deduplication, patterns, briefing, conflicts, undo). Playwright covers the acceptance journey, safeguards (conflict, undo, ask-previous-shift reply, critical escalation, offline, permissions) and an axe WCAG 2.1 AA scan. State for focused tests is prepared with the same commands the app uses and injected into localStorage.

**D-40 · The rendered explainer ships in `public/video`.** The 16:9 MP4 (about 9.5 MB) is committed so the page offers a download without a render step; the in-app player renders the composition live from the same props.

**D-41 · Hosted on Vercel, deployed from `main`.** The project `daniel-kinsners-projects/shift-ghost` is linked to the GitHub repo, so pushes to `main` deploy to https://shift-ghost.vercel.app. `vercel.json` pins the framework to Next.js because the project was first detected as "Other". No environment variables or secrets are needed: all data stays in each visitor's browser, so every visitor gets their own private copy of the demo.

**D-42 · Rich marketing metadata belongs to the static landing route.** Open Graph, Twitter, canonical, creator and structured-product metadata live on `/`, with the social image generated by a dedicated `/api/og` route. Keeping those fields out of the root layout preserves Next 16.4 partial prerendering for parameterized issue and handoff routes.

**D-43 · Clean-clone reproducibility is a product feature.** The lockfile is verified with `npm ci`, and the typecheck script runs `next typegen` before TypeScript so route-aware globals exist in a new checkout. A portfolio reviewer should never need the original builder's warm `.next` directory to validate the work.
