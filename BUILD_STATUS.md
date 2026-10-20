# Build status

Running checklist for the Shift Ghost demo. `[x]` = built and verified in the running app or by tests.

## Milestones

- [x] M0 · Scaffold (Next.js 16.4, Tailwind v4, Remotion 4, Vitest, Playwright), docs, public repo
- [x] M1 · Domain model, seed data, extraction engine, rules, patterns + unit tests
- [x] M2 · App shell, design system, demo entry, demo controls drawer
- [x] M3 · First-run setup wizard (five steps, shift-line diagram, skippable, resumable)
- [x] M4 · Mobile closing capture + transcript review / extraction confirmation
- [x] M5 · Opening briefing, actions (acknowledge / claim / resolve / escalate / ask previous shift), undo, conflicts
- [x] M6 · Issue detail + evidence timeline, recurring patterns
- [x] M7 · Rule builder with natural-language summary and test panel
- [x] M8 · Stores & shift templates, team & notifications, settings (retention, delete recording, integrations), audit trail, handoffs list
- [x] M9 · Remotion explainer (16:9 + 9:16, sound placeholders) + in-app player + rendered MP4s
- [x] M10 · E2E tests, accessibility scan, responsive QA, README, SALES_HANDOFF

## Acceptance story (verified by `e2e/journey.spec.ts`, about 6 s of browser time)

- [x] 1. Configure Nightjar Kitchens
- [x] 2. Submit the seeded closing transcript
- [x] 3. Confirm or correct extracted items
- [x] 4. Switch to Luis the next morning
- [x] 5. Claim the refund call and ice-machine task
- [x] 6. Discover the recurring ice-machine problem
- [x] 7. Play or preview the Remotion explainer

## Required screens

- [x] Demo entry / role chooser (`/`)
- [x] First-run setup wizard (`/setup`)
- [x] Mobile closing capture (`/capture`)
- [x] Transcript review and extraction confirmation (`/handoffs/[id]`)
- [x] Opening briefing (`/briefing`)
- [x] Issue detail with evidence timeline (`/issues/[id]`)
- [x] Recurring patterns (`/patterns`)
- [x] Rules and escalation builder (`/rules`)
- [x] Locations and shift templates (`/locations`)
- [x] Team and notification preferences (`/team`)
- [x] Audit trail (`/audit`)
- [x] Empty (brief awaiting closeout, no patterns, no audit matches), loading (layout-matched skeletons), permission-denied (Bri on rules/audit/settings), offline (banner + queued capture), and error (extraction failed with retry; route error and 404 screens) states

## Safeguards

- [x] Original transcript always visible, evidence highlighted, unmapped sentences kept
- [x] Every item links to its evidence spans
- [x] Confidence as language (high / needs review / uncertain); non-high items block publishing
- [x] One sentence, one item (merges recorded and shown); repeat mentions merge into open tasks
- [x] Offline capture queues locally with an unsynced count, processes on reconnect
- [x] Two managers editing the same task get a conflict dialog (entity versions; cross-tab via storage events)
- [x] Critical escalations require confirmation (publish and manual escalate)
- [x] Retention settings and a delete-recording action that keeps the transcript

## Verification (last run)

- `npm test`: 50 unit tests pass
- `npx playwright test`: 14 pass (journey, offline, permissions, conflict, undo, ask-previous-shift, critical escalation, axe on 7 screens)
- `npm run lint`: 0 problems · `npm run typecheck`: clean · `npm run build`: succeeds
- Screenshot sweep at 390 / 768 / 1440 / 2560 px reviewed; no horizontal scroll at 390 px
- Remotion: both compositions rendered to MP4 (45 s, 30 fps)

## Deployment

- [x] Live at https://shift-ghost.vercel.app (Vercel, production). All 14 Playwright tests pass against the live URL; every route, the MP4 and the sound files respond.

## Known limits (by design for a demo)

- Speech-to-text is simulated unless the browser speech service is enabled; the embedded preview pane blocks the mic.
- Data lives in this browser's localStorage; a second browser is a separate workspace (two tabs share one).
- Integrations show payloads and a delivery log; nothing is sent.
