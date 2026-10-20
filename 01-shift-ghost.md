# Claude Build Prompt — Shift Ghost

Copy everything below this line into Claude Code as the build brief.

---

## Product brief — read this first

- **Product:** A voice-first shift-handoff system that turns a tired employee's end-of-day explanation into tomorrow's prioritized operating brief.
- **Company and buyer:** Nightjar Kitchens is the fictional demo company. The real buyers are owners, district managers, and operations leaders at restaurants, retail groups, warehouses, shops, and other multi-shift businesses.
- **Problem being solved:** Expensive context dies between shifts. Shortages, equipment problems, customer promises, and unfinished work live in memory, sticky notes, and chaotic group texts until they become delays, waste, or blame.
- **Business value:** Fewer missed opening tasks, faster issue ownership, less manager chasing, and visibility into problems that repeat across locations.
- **Core product story:** Record a two-minute closeout; verify what the system extracted; hand the next manager a useful briefing; then reveal a recurring issue the company could not previously see.
- **Feature center of gravity:** Guided voice capture, source-linked extraction, uncertainty review, next-shift actions, acknowledgements, escalation, and cross-location pattern intelligence.
- **Design character:** Industrial night-shift utility—dark, tactile, calm under pressure, and unmistakably mobile rather than another pastel SaaS dashboard.
- **Commercial conversation this demo should create:** “Could this use our existing shift questions and send the result into the tools our managers already use?”

## Product judgment and creative latitude

Treat the detailed brief below as a strong product hypothesis, not a cage. Preserve the buyer problem, trustworthy handoff, fictional company, and end-to-end proof, but improve the information architecture, feature sequence, interaction model, and technical architecture when you see a materially better solution. You may combine, defer, or replace secondary features if that makes the four-minute sales story stronger. Do not ask Dan to choose ordinary framework, database, auth, chart, or component details; make sensible decisions, document consequential assumptions, and keep integrations simulated behind clean boundaries. When ambition conflicts with polish, complete the most convincing commercial journey first.

## Commercial handoff

Create `SALES_HANDOFF.md` alongside the app. Include the ideal buyer, costly problem, one-sentence promise, four-minute demo talk track, business outcomes to discuss without inventing ROI, what is real versus simulated, likely integration path, five discovery questions for a prospect, and the smallest credible paid pilot. This is part of the deliverable, not optional marketing garnish.

## Your role

Act as a senior product designer, staff frontend engineer, backend architect, QA lead, and motion designer. Build a polished, production-shaped interactive demo named **Shift Ghost**. Do not stop at a static dashboard. The product must tell a complete story from an employee closing a shift to a manager beginning the next one with a useful briefing.

If this is a new repository, initialize it. If a suitable repository already exists, inspect it first and preserve its conventions. Keep a running checklist in `BUILD_STATUS.md`. Make reasonable decisions without waiting for clarification, document assumptions, and finish the full demo.

## Product thesis

Shift Ghost converts messy end-of-shift voice notes into a structured handoff, actionable tasks, and recurring-problem intelligence.

Target customers: restaurants, retail stores, warehouses, fabrication shops, field-service depots, and any multi-shift operation where important context disappears between crews.

The memorable before/after:

- Before: sticky notes, group texts, forgotten shortages, vague blame.
- After: a two-minute spoken closeout becomes a prioritized morning briefing with owners and proof.

## Suggested implementation foundation — adapt when better

- React + TypeScript in the current stable project framework; prefer Next.js App Router for a new project.
- CSS variables plus Tailwind or well-structured CSS modules.
- Local seeded data first. Use an adapter boundary so a future Supabase/Postgres implementation can replace it.
- Zod validation for all forms and imported mock transcripts.
- Recharts or handcrafted SVG for small charts only; avoid dashboard-chart wallpaper.
- Optional browser microphone capture using `MediaRecorder`, with a deterministic typed/transcript fallback.
- Remotion in `/remotion` for a short explainer video.
- No paid APIs are required for demo mode.

## Demo company and users

Use the fictional company **Nightjar Kitchens**, a three-location fast-casual restaurant group.

Seed these roles:

- Maya Chen — closing manager, Downtown
- Luis Ortega — opening manager, Downtown
- Bri Ellis — kitchen lead
- Jordan Cole — area manager
- Demo viewer — can switch roles from a discreet demo toolbar

Seed three locations: Downtown, Northgate, and Canyon Plaza.

## Core product flows

### 1. First-run setup wizard

Create a five-step onboarding flow that feels like configuring a real operational system:

1. Company and location setup.
2. Shift schedule and handoff times.
3. Choose the five closeout questions.
4. Define escalation rules and severity thresholds.
5. Invite the next-shift recipients and preview the first briefing.

Use a visual shift-line diagram that connects closing crew → extraction → morning crew. Make the setup wizard skippable in demo mode and resumable.

Default closeout questions:

1. What broke, failed, or behaved unusually?
2. What ran low or needs to be ordered?
3. Which customer issue is still open?
4. What must happen before the next rush?
5. Is there anything the next manager will be angry not to know?

### 2. Mobile closing capture

Build a phone-first flow. The employee can hold a large record button or type a response. Show a live waveform or simulated waveform, elapsed time, question progress, pause/resume, and a final review.

After submission, animate the transcript transforming into:

- incidents
- inventory flags
- customer follow-ups
- maintenance items
- next-shift tasks

Every extracted item must show its source sentence and confidence. Low-confidence items must require confirmation rather than pretending certainty.

### 3. Morning briefing

The opening manager lands on a briefing, not a generic dashboard. It must answer:

- What can hurt today?
- What must be done before opening?
- What changed since yesterday?
- What did the prior crew already handle?

Provide `Acknowledge`, `Claim`, `Resolve`, `Escalate`, and `Ask previous shift` actions. Include optimistic UI and undo.

### 4. Recurring-problem intelligence

Add a page that reveals repeated issues across shifts and locations. Example: the Downtown ice machine was mentioned six times in nine days, usually after 8 PM, and has cost an estimated 3.5 labor hours.

Show an evidence trail. Never label correlation as a proven cause.

### 5. Manager rule builder

Let a manager define plain-language rules using a visual builder:

- If refrigeration is mentioned, mark critical and notify area manager.
- If an item is below par, create an order-prep task.
- If a customer refund remains open at 9 AM, escalate.

The rule builder must include a natural-language summary and a test panel using sample transcripts.

## Required screens

- Demo entry / role chooser
- First-run setup wizard
- Mobile closing capture
- Transcript review and extraction confirmation
- Opening briefing
- Issue detail with evidence timeline
- Recurring patterns
- Rules and escalation builder
- Locations and shift templates
- Team and notification preferences
- Audit trail
- Empty, loading, permission-denied, offline, and error states

## Visual direction — industrial night shift

Do not create a generic SaaS interface.

Use a **loading-dock-at-2-AM** aesthetic: nearly black blue, dirty off-white, fluorescent safety orange, reflective silver, and occasional warning red. Pair **Archivo Narrow or DIN Condensed-like display type** with **IBM Plex Sans** body copy and a restrained monospace for timestamps. Avoid Inter, Roboto, Space Grotesk, and purple gradients.

Visual motifs:

- stamped shift labels
- thermal-printer briefing cards
- reflective tape dividers
- waveform ribbons
- time rails running horizontally through the interface
- status lights that feel physical rather than decorative

The mobile capture screen should be dramatically simple. The manager briefing may be dense, but hierarchy must remain ruthless. Use motion for the handoff transformation, acknowledgment, and severity changes. Respect `prefers-reduced-motion`.

## Seed data

Include at least seven days of handoffs across three locations. The primary demo transcript is:

> “Okay, Downtown close. Ice machine started making that grinding noise again around eight twenty. Bri shut it down for ten minutes and it came back, but the bin is only half full. We have one case of avocado left and Northgate borrowed our last sleeve of large cups. Table twelve says their refund from Friday still hasn’t shown up. Luis needs to call them before lunch. The new dishwasher, Tasha, did great but still needs the chemical test walkthrough. Also the back door sensor flashed twice after ten. I checked the door and it was locked.”

Expected extraction:

- Critical maintenance: ice machine recurring grinding noise; temporary recovery; evidence attached.
- Inventory: avocado at one case; large cups at zero because of transfer.
- Customer follow-up: table 12 refund; owner Luis; due before lunch.
- Training: Tasha chemical test walkthrough.
- Security watch: back door sensor flashed twice; door manually confirmed locked.

Seed recurring mentions of the ice machine, fryer temperature drift, and missing large cups. Include one resolved false alarm and one contradictory report so the evidence UI matters.

## Data model

Model at minimum:

- organizations
- locations
- users and roles
- shift templates
- shift instances
- closeout questions
- recordings / transcripts
- extracted items
- evidence spans
- tasks
- incidents
- inventory flags
- escalation rules
- acknowledgments
- comments
- audit events

Use stable IDs and timestamps. Create `src/data/seed.ts` or the equivalent plus a reset-demo action.

## Product intelligence and safeguards

- Never hide the original transcript.
- Every generated item must link back to source evidence.
- Show confidence as language: high, review, uncertain—not fake percentages unless seeded.
- Prevent duplicate tasks when the same sentence maps to multiple categories.
- Offline capture should queue locally and show unsynced status.
- Handle two managers editing the same task with a conflict message.
- Require confirmation for critical escalations.
- Include retention settings and a clear delete-recording action.

## Remotion explainer

Create a 40–50 second 1920×1080, 30 fps composition named `ShiftGhostExplainer` and a 1080×1920 variant using the same props.

Storyboard:

1. A voice waveform and chaotic sticky-note fragments appear: “The shift ends. Context disappears.”
2. The five voice answers flow through a central Shift Ghost mark.
3. Extracted issues snap into a timeline with evidence highlights.
4. The opening manager claims three tasks before the doors open.
5. A recurring ice-machine pattern illuminates across nine days.
6. End card: **“Every shift leaves the next one smarter.”**

All Remotion animation must use `useCurrentFrame()`, `interpolate()`, or `spring()`. Do not use CSS transitions or `useFrame()`. Use `<Sequence premountFor={fps}>`; use `<Img>` and `staticFile()` for local images. Include subtle mechanical sound design placeholders and render commands in the README.

## Demo mode

Add a persistent but unobtrusive `Demo controls` drawer:

- restart onboarding
- inject a new handoff
- switch user and location
- advance time to morning
- simulate offline mode
- reset seed data

The product should be fully demonstrable without authentication or external services.

## Quality requirements

- Responsive at 390 px, 768 px, 1440 px, and ultra-wide.
- Keyboard accessible and screen-reader labeled.
- WCAG AA contrast.
- No buttons that do nothing.
- Skeletons instead of layout jumps.
- Unit tests for transcript extraction fixtures, rule evaluation, and task deduplication.
- End-to-end test for setup → closeout → morning claim → resolution.
- No secrets in the repository.
- README with setup, architecture, demo script, reset steps, and screenshots to capture.

## Acceptance criteria

A reviewer must be able to complete this story in under four minutes:

1. Configure Nightjar Kitchens.
2. Submit the seeded closing transcript.
3. Confirm or correct extracted items.
4. Switch to Luis the next morning.
5. Claim the refund call and ice-machine task.
6. Discover the recurring ice-machine problem.
7. Play or preview the Remotion explainer.

The final result should feel like a real operational product with judgment and safeguards—not a voice memo glued to a task list.
