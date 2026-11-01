# Usability tests and the screen check

**Status:** Active · added 26 Oct 2026 (`RULINGS-2026-10-26-workflow.md` L10) · **Owner:** Babin runs the
monthly test; Claude prepares the sheets and turns the results into cards; every agent runs the screen
check on every card that changes a screen.

**Why:** R-39 counts taps. It cannot see a person hesitating, picking the wrong unit, or believing
something was saved when it was not. Watching three real people try real tasks finds those problems
quickly and cheaply.

**Background reading (paraphrased here, not copied):** Steve Krug, *Don't Make Me Think, Revisited*,
3rd ed. (2014) — ch. 6 (navigation and the "trunk test"), ch. 9 (do-it-yourself usability testing),
ch. 10 (mobile), ch. 11 (goodwill), ch. 12 (accessibility). The other books are in §5. The books stay on
Babin's computer; they are not stored in this repository.

---

## 1. The screen check — every card that changes a screen

Before an agent says a card is done, open each changed screen in `npm run dev:mock` at **375, 820 and
1440 px**, as each role the card names. Glance for five seconds without reading closely. Every answer
must be obvious at a glance, not after studying the screen.

1. **Which screen is this?** A page title is visible, and it matches the words on the button or link
   that opened it.
2. **Which booking, client or item?** Its number and name are on screen — not only in the address bar.
3. **Where am I in the app?** The current menu item is clearly marked, with more than one cue (for
   example colour **and** a bar or bold text). Subtle marks get missed.
4. **What do I do next?** One main action, named with a verb ("Start packing", "Receive return"), and
   visibly stronger than the rest.
5. **How do I search, and how do I get out?** Search is where it always is. Back or close never loses
   typed work without asking.
6. **Nothing on screen claims something that did not happen.**
   - "Saved" or a success toast only after the server confirmed the write (Law 16). Custody and money are
     never shown as done before the server says so (R-40).
   - Loading, empty and "could not load" are three different looks. A failed load is never shown as 0
     or as an empty list.
   - Offline says "not saved" — never "will upload later" unless a real on-device queue exists.
   - A blocked button says why, next to it, and what to do about it.
7. **Touch and reading.** Nothing needs hover. Controls are at least 44 px (56 px for floor verbs). Labels
   sit outside the fields — never a placeholder as the only label. No small, low-contrast text.
8. **Forms forgive.** Phone numbers, PAN, serials and amounts accept spaces and dashes; the app cleans
   them instead of rejecting them. Ask only for what the task needs.

Write the result in the card's PROGRESS entry: `Screen check: pass at 375 / 820 / 1440` — or what failed
and what you changed.

---

## 2. The monthly usability test — Babin and staff

**When.** A fixed date, not "when it is ready" — dates that wait for milestones slip.
- Round 1: **device day, Sun 10 Jan 2027 (26 Poush 2083)** (T2-11).
- Round 2: **during the trial, Wed 20 Jan 2027 (6 Magh)** ⭐.
- Then **the first Sunday of each month, 11:00–13:00** ⭐ (a quiet hour between the morning pickups and
  the evening returns): Sun 7 Feb (24 Magh), Sun 7 Mar (23 Falgun), Sun 4 Apr (21 Chaitra), …

**Who.** Three people per round, about 45 minutes each:
- one floor person (Warehouse or Technician),
- one desk person (Coordinator or Accounts),
- one person who rarely uses the app (new staff, a driver, or someone from outside).
Rotate people each round. Across the three, use the phone, the iPad and the counter PC.

**Where.** **Staging only** (T1-02), with the role accounts from T1-05 and test bookings. Never live data.

**Roles.** A *facilitator* (Babin or a calm, patient staff member) sits with the person. One or two
*watchers* (Babin, the manager) watch the screen. With the person's permission, record the screen (phone
screen recording is enough).

**The session (~45 min).**
1. **Welcome (3 min).** "We are testing the app, not you — you cannot do anything wrong. Please think out
   loud. I will not help during the tasks; I'll answer questions at the end."
2. **First look (2 min).** Open Today. "What is this screen for? What would you do first?"
3. **Tasks (30 min).** Six to eight task cards for the person's role (below).
4. **Questions (5 min).** Ask about the moments they hesitated. No leading questions during the tasks.
5. **Thanks (5 min).**

**Facilitator rules.** Do not help, hint or explain. If they go quiet: "What are you thinking?" If they
ask for help: "What would you do if I weren't here?" Stop a task only if they are completely stuck or
upset.

**Task cards** — pick six to eight per person by role; put real staging booking numbers in.

| # | Task (read it out exactly) | Watch for |
|---|---|---|
| U1 | "Find the next pickup. Tell me its time and what is left to do." | Wrong row, missed time, unclear status |
| U2 | "Pack booking BK-…: check the items and finish packing, photo included." | Scan or tick, wrong unit, hidden blocker |
| U3 | "The client's driver is here to collect it. Hand it over." | Collector and ID, signature, does Confirm say what is missing |
| U4 | "Only camera A came back; camera B is still out. Record exactly that." | Partial return recorded correctly, B still out |
| U5 | "This lens came back with a scratch. Record it." | Damage photo, no accidental "Ready" |
| U6 | "The client wants one more day. Extend the booking." | Price choice, taps, new return time |
| U7 | "Record Rs … paid by Fonepay for BK-…, then tell me who still owes us money." | Method, amount, the owed list |
| U8 | "Is a [Sony FX6] free next Friday?" | Booked vs free is clear, 06:00 day |
| U9 | "Add this client from a WhatsApp message" (phone number typed with spaces, ID photo). | Spaces accepted, ID step, duplicates |
| U10 | As Warehouse: "Find tomorrow's returns." | No money anywhere on any screen |
| U11 | On the phone: "From this return, open another booking and come back." | Context kept, typed work not lost |
| U12 | "Change where this tripod is kept, reload, and check it stayed." | Saved for real (T2-17) |

**Score sheet (one line per task).** Done alone (yes / with a hint / no) · serious mistake (wrong item,
wrong booking, wrong amount, lost data, money shown to the wrong role) · still saved after reload ·
where they hesitated · minutes.

---

## 3. Deciding what to fix — the same day

1. Straight after the three sessions, everyone who watched names **their three worst problems** — only
   things that actually happened.
2. Write them in one list; tick repeats.
3. Rank the **ten worst**: harm first (wrong item, booking, amount or permission, lost data), then how
   many people hit it, then whether it stopped the task, then whether they recovered alone.
4. Ignore short wrong turns the person noticed and fixed alone, without stress.
5. Fix the top few before the next round. A small change — wording, placement, removing clutter — is
   often enough. Prefer taking something away over adding an explanation. Treat feature wishes from
   participants with care: ask how they would use it.
6. Keep a separate list of tiny fixes (under an hour each) and just do them.
7. Save the result as `docs/verification/USABILITY_<yyyy-mm-dd>.md` (participants as P1 floor, P2 desk,
   P3 new — no names). Claude turns the ranked list into cards at the next check-in; Babin decides.

---

## 4. Rules from the book we adopt for every screen

- Name actions with verbs: "Start packing", "Receive return" — not "Process" or "Submit".
- Cut needless words. A clear control beats a paragraph of instructions.
- A page's name matches what was tapped to open it.
- Make the main jobs obvious: Today shows pickups and returns (already ruled).
- Be candid: when something cannot be done, say why and what to do next. Keep the shop's phone and
  WhatsApp easy to find on the client pages (T7).
- Don't make people format data your way; clean it for them.
- Don't ask for information the task does not need. (The ID card is needed — W50, W51.)

---

## 5. What the other books add — background for agents

These shape how cards are built. They are ideas, not code to copy: the books date from 2012–2019 and the
app is React 18 + TypeScript + Supabase.

| Idea | Where it applies | Book (background) |
|---|---|---|
| A form keeps the draft apart from what is saved, and tracks loading → saving → saved / failed; Save is disabled while saving so it cannot be sent twice | Every form card (T2-12, T2-17, T3-18 …) | *Fullstack React* (2017), "Forms" — the code is pre-hooks |
| Search waits until typing pauses (~250 ms ⭐), cancels the older request and shows only the latest results — never for writes | T3-21 | *RxJS in Action*, ch. 4 (debounce) and ch. 5 (switch) — the app does not use RxJS; use `AbortController` |
| Scans are never debounced (that drops items). The same code twice within ⭐ 1.5 s is ignored; every scan is checked by the server | T2-14, T3-19 | *RxJS in Action*, ch. 4 (throttle vs debounce) |
| An error shown to staff is one plain line — what happened, whether retrying may help, what to do — plus a short reference code that matches the error log; never raw database text | T1-08 and every card | *Concurrency in Go*, ch. 5 "Error propagation" |
| A screen's state is one value with a fixed list of cases (e.g. idle · compressing · uploading · saved · failed · offline), checked with an exhaustive `switch` — never two flags that can contradict | T2-16 and every new screen | *Programming in Scala*, ch. 15 "Sealed classes" — in TypeScript: discriminated unions + a `never` check |
| Imports: read → preview with a result per row → commit once; rejected rows listed; nothing half-saved | T3-12, T9 import | *Concurrency in Go*, ch. 4 (bounded pipelines) |

**Not used:** the Django documentation, *Learning GraphQL*, *Learning React Native* and the Go books —
different technology. The app uses Supabase (no GraphQL), runs in the browser, and has Electron and
Capacitor wrappers rather than React Native.
