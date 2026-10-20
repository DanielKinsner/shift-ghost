# Shift Ghost: sales handoff

## Ideal buyer

The **owner, district or area manager, or director of operations** at a business with **2 to 30 locations** and **at least two shifts a day**: fast-casual and full-service restaurant groups first, then retail chains, warehouses and distribution centers, fabrication shops and field-service depots.

They feel the problem personally. They are the ones who get the 7 AM call about the walk-in, who read the group chat at midnight, and who can't tell whether a store has a broken machine or a broken habit.

Signs of fit:
- Shift notes live in a group chat, a paper log, a whiteboard or nowhere.
- Openers routinely discover problems the closers knew about.
- Equipment and supply problems repeat, and nobody can say how often.
- The buyer already pays for scheduling, inventory or maintenance software but nothing connects the night to the morning.

## The costly problem

Context dies between shifts. The closer knows the ice machine ground to a halt twice, that the last sleeve of cups went to another store, and that a guest is still waiting on a refund. By morning that knowledge is in a sticky note, a text the opener didn't see, or someone's head. It comes back as a late opening, a lunch rush without cups, an angry guest, wasted labor and a round of blame. Because none of it is written down in a consistent way, the same problem can happen nine nights in a row without anyone above store level noticing.

## One-sentence promise

**A two-minute spoken closeout becomes a prioritized morning brief with owners and proof, and the problems that keep coming back finally show up with their evidence.**

## Four-minute demo talk track

**0:00 · The problem (20 s).** "Every night your closers know things your openers need. Today that lives in group texts and sticky notes. Watch what happens when the closer just talks."

**0:20 · Setup (30 s).** Start the demo. "This is Nightjar Kitchens, three stores. Setup takes five steps: stores, shift times, the five questions your closers answer, the rules, and who gets the brief. You can use your own questions." Show the questions step and the rules step, then finish.

**0:50 · The closeout (40 s).** As Maya on a phone-sized screen: "Five questions, about two minutes. Hold to talk." Record one answer to show the waveform, then use the demo shortcut and submit.

**1:30 · Trust (45 s).** The transcript turns into items. "Every item points to the sentence it came from. Two things it isn't sure about: it *inferred* the cups are at zero, and a door sensor alert could be a fault or a real event. It won't hand those to the morning until a person confirms." Confirm both. Publish. "The ice machine is refrigeration, so a rule makes it critical, and it asks before it texts the area manager tonight."

**2:15 · The morning (50 s).** Switch to Luis at 6:15 AM. "The opener doesn't get a dashboard. He gets four answers: what can hurt today, what must be done before opening, what changed since yesterday, and what last night already handled." Claim the refund call and the ice machine. Point at the 9 AM escalation rule on the refund. Optionally *Ask Maya* and wait for her reply.

**3:05 · The reveal (40 s).** Click "6th mention in 9 days". "This is what the company couldn't see before: the Downtown ice machine came up six times in nine days, five of them after 8 PM, and crews reported about three and a half hours dealing with it. It doesn't claim to know why. It shows the evidence and suggests what to test." Show the fryer reports that disagree, and the false alarm that isn't counted.

**3:45 · Close (15 s).** "Could this use your existing shift questions and send the result into the tools your managers already use?" Open Settings → *Where briefs and tickets go* to show the payloads.

## Business outcomes to discuss (without inventing ROI)

Ask the prospect for their numbers; don't supply them. Discuss:
- **Missed opening tasks:** how often an opener discovers something the closer knew. Track it before and during a pilot.
- **Time to ownership:** how long between "someone noticed" and "someone owns it". The brief shows claims with timestamps.
- **Manager chasing:** how much of an area manager's morning goes to texts and calls to reconstruct the night.
- **Repeat problems:** how many issues recur more than three times a month, by store. Patterns make this countable for the first time.
- **Guest recovery:** open refunds and call-backs that slip past a shift change.
- **Equipment labor:** crew-reported time spent working around failing equipment, which helps justify a repair or replacement.

## What is real versus simulated in this demo

**Real:** the extraction engine (evidence spans, inferences, confidence, deduplication, unmapped sentences), the review gate, rules and their plain-language summaries and test panel, pattern detection with contradictions and false alarms, offline queue, conflict detection between two managers, undo, the append-only audit trail with CSV export, permissions by role.

**Simulated:** speech-to-text (live mic waveform; words come from a script unless the browser speech service is switched on), SMS/push/email/team-chat delivery, connectors to scheduling, inventory and maintenance tools, and other people's actions (a closer's reply, a teammate's conflicting claim). The extractor is deterministic and rule-based; a production version would use a speech-to-text service and an LLM behind the same interface, with the same evidence and confidence contract.

## Likely integration path

1. **Questions and people:** import their existing shift checklist as the five questions; sync who opens and closes from their scheduling tool so briefs reach the right manager.
2. **Delivery:** post the brief and critical items into the team chat they already use; text critical escalations.
3. **Maintenance:** open a ticket with the evidence trail when an equipment pattern crosses a threshold.
4. **Inventory:** turn order-prep tasks into draft purchase orders in their ordering system.
5. **Data:** move from on-device storage to a hosted Postgres with the same commands as API mutations, audit included.

## Five discovery questions

1. When something breaks or runs out at night, how does the opener find out today, and how often do they find out the hard way?
2. Which problems do you suspect repeat across nights or stores, and how would you prove it right now?
3. What do your closers already fill out or text at the end of a shift, and how long does it take them?
4. Where do your managers live during the day: which chat, scheduling, inventory and maintenance tools would the brief need to reach?
5. Who would own the rules (what counts as critical, who gets woken up), and what would make a store manager trust an automatic summary?

## Smallest credible paid pilot

- **Scope:** 2 to 3 locations, closing-to-opening handoff only, 6 weeks.
- **Setup:** their own five questions, their critical-item rules, brief delivered to opening managers' phones and one team-chat channel.
- **Measures agreed up front:** opener-reported "didn't know about it" incidents per week, time from closeout to claim, number of recurring issues found, closer time per closeout.
- **Check-ins:** week 2 (adoption and trust in extraction), week 6 (measures review and expansion decision).
- **Commercials:** a fixed pilot fee per location that credits toward a per-location subscription if they expand.
- **Exit criteria they can hold us to:** closers finish in under three minutes on most nights, and openers say the brief replaced the group-chat scroll.
