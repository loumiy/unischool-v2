# UniSchool v2: release playtest review

_Written after Phase 34 (the release phase). This covers the build on `main` after PRs #45–#50, played in a real browser and measured headlessly. The same review is published as a page: https://claude.ai/artifact/EQrqeXp7LRrL5Bnhhsma1g (private to its owner until shared)._

## How it was tested

- **A new player's first run.** I started in a clean browser with no save and played from the title screen as a first-timer: named the college (Hartley, Collegiate Gothic), placed Founders Hall, built housing, dining and teaching space, founded a school, opened programmes, and worked through Years 1–3 of calendar beats, notes and questions. I took screenshots at each step and read every on-screen word.
- **The middle and the end.** I used saves from the Phase 31 balance harness: a steward college at Year 25, 40, 48 and 49. I played them in the browser at 8×, answering beats and letters, through the Year-50 Final Report, the Epilogue and the hall of fame. I also opened every screen along the way.
- **Customisation.** I compared the five architectural styles and the palettes, looked at the catalogue across saves, and tried the new settings (text size, colour-blind-safe signal colours).
- **Measurements.** `npm run balance` plays three archetype colleges (steward, growth, frugal) for 50 years on three seeds each. A variety script counts which events each college actually sees. Performance was profiled in the production build.

Some bugs were found and fixed during the playtest, in PR #50 (listed at the end). Everything else below is still open.

---

## The verdict in one paragraph

UniSchool has a strong voice, a clear opening, and a genuinely lovely campus to look at. For the first two or three years it is a good game: every week asks something, and money is tight. Beds, seats, faculty and the board all push back, and the player learns the systems by running into them. That tension falls away in the middle. By about Year 15 a competent college is rich, its students are as happy as the scale allows, its teams win nearly every season, and the questions arrive with price tags it no longer notices. From there to Year 50 the game is mostly beautiful, well-written bookkeeping. **The most important work left is to keep the middle hard.** Several fixes are small, and the first two matter most: prices that scale with the college, and satisfaction and athletics that don't saturate.

---

## 1. Is it intuitive for a new player?

**Mostly yes, and better than most builders at this scale.**

What works:

- **The opening is a straight line.** Title → name, style and colours → place Founders Hall. The first note says exactly what the first class needs: beds, somewhere to eat, and something to study ([03](img/03-first-note.jpg)). The NEXT slot in the ticker always names what the clock is waiting for.
- **"Onboarding by consequence" (Phase 29) teaches well.** Notes arrive when the thing they explain first matters: Admissions Day, Budget & Hiring, faculty with nothing to teach, red ink, the guide. They never arrive as a wall of text up front.
- **Every question has a stated default.** Leaving a question alone is always safe, and the game says so on the panel.
- **Warnings come a year ahead where it counts.** At Budget & Hiring, the "beds a year ahead" line told me next spring's intake would be capped at about 0 unless I broke ground. It was right.

Where a first-timer gets stuck:

1. **Curriculum said "Build an Academic Hall first" while Founders Hall was still a site** ([05](img/05-curriculum-before-fix.jpg)). That contradicts the first note, which says to found a school in Founders Hall. _Fixed:_ it now says Founders Hall opens in N weeks.
2. **There is one hiring window a year, and the big button closes it.** Budget & Hiring is the only time the market is open, and **Approve and adjourn** closes it ([06](img/06-budget-and-hiring.jpg)). I approved without hiring, and my first class of 292 arrived to three programmes with no teachers, with no way to hire until next summer. _Fixed in part:_ the button now warns once, naming the untaught programmes. **Still recommended:** let the player hire adjuncts off-cycle at a premium (short contracts, lower quality). Real colleges do this, and it turns a trap into a costly recovery.
3. **Teaching seats aren't explained.** Founders Hall houses a school but gives no teaching seats. Curriculum shows "Program seats 0 / 360" and nothing says what to build about it. I only worked out that a Lecture Theatre was needed by reading building cards. Suggest a "Where will they be taught?" note to match "Where will they sleep?", and a line under the seat counter naming the buildings that add seats.
4. **The founding gift doesn't cover the founding checklist.** $30M buys Founders Hall ($8M), a residence hall ($8M), a dining hall ($4M), a school ($2M), three programmes ($1.5M) and a lecture theatre ($4.5M). That leaves about $2M and a "Tight" letter from the board in Year 2. Tight is fine, but a newcomer isn't told that borrowing for construction is normal until the Red Ink note. Either say so in the first note, or raise the gift by $5–8M.
5. **The build menu covers the bottom half of the map while you place** ([04](img/04-build-menu.jpg)). The footprint ghost is often under the panel, and Founders Hall is hidden behind it. Collapse the menu to a strip while a building is in hand.
6. **Small wording that confuses:**
   - The Laboratory card's whole description is "its place in the layout".
   - The Board Meeting panel says "No rival yet. Rivals are made by proximity…" every autumn until a rival exists ([08](img/08-empty-board-meeting.jpg)).
   - The board-meeting note said "every spring" for a meeting held in late fall (_fixed_).
7. **The title screen draws over the founding form** ([01](img/01-title-over-startup.jpg)). A first-time player sees two stacked cards. Blur or hide the startup card behind the title.

## 2. Is it immersive? Does it simulate a real university?

**The texture is excellent. The economics are not yet honest.**

What feels real:

- **The calendar is the calendar a university lives by:** Convocation, the board's late-fall meeting, Admissions Day in spring, and budget and hiring in the summer. Winter visibly arrives in week 12 ([07](img/07-first-winter.jpg)).
- **The institutional machinery is right.**
  - Assistant, associate and full professors, with tenure cases.
  - A provost and deans who handle the routine.
  - An endowment with a draw rate the board watches.
  - Deferred maintenance that compounds.
  - A rankings guide that changes its methodology "to everyone's outrage".
  - A rival that taunts you in the ticker.
- **The writing carries it.** The storm letter ([13](img/13-storm-letter.jpg)), the porters' lodge cat, and the car park with 340 permits for 212 spaces are all funny, specific, and true to how universities talk about themselves. The chronicle's era names ("After the Harrowgate Pledge", "The Golden Age") read like a real institutional history ([12](img/12-chronicle.jpg)).

What breaks the illusion:

1. **Colleges get rich and stay rich.** Phase 31 added the cost of student life and an administration that grows with enrollment. Even so, the steward college in the harness has **$104M in the bank at Year 26 and $307M at Year 49**, earning $340–430k a week. Real colleges run on margins of a few percent, and their cash sits in the endowment, not the current account. There is no way to move surplus cash into the endowment, so it just piles up.
2. **Event prices don't scale.** The storm letter offers "Rebuild properly: $3.5M" to a college with $116M in cash, and the choice is no choice. A $200k department rescue in Year 1 is a real dilemma; in Year 30 it is a rounding error. Price choices as a share of the operating budget or of the estate's value (e.g. "a tenth of a year's maintenance") rather than in fixed dollars.
3. **Satisfaction saturates.** Every class at the steward college reads 98 satisfaction by Year 26 ([10](img/10-students-saturated.jpg)). Once it is at the top, the students stop being a system the player manages.
4. **Athletics is too easy.** Over 50 years the steward college's three varsity teams won **77 titles** in the harness, which means almost every season. A title should be an event.
5. **Demand barely responds to quality.** The frugal college (24 faculty for 900 students) keeps every bed full for 50 years and banks over $700M, while ranking last. The three Phase 21 audit findings that remain open as `it.fails` (closing every classroom costs little, a ruined campus still scores above 50 on beauty, neglect doesn't cost students) all come from this. Admissions fill on price and prestige. Teaching quality, satisfaction and the state of the campus should move the applicant pool and yield directly.

## 3. Is it easy to make meaningful progress?

**Early progress is vivid. Late progress is mostly numbers.**

- **Early, every action shows on the map:** cranes, a building rising, the first class on the lawn, Founders Hall's clock tower. The first five years are full of firsts.
- **The league gives a long ladder.** The steward goes from 25th to 3rd by Year 26 and 1st by Year 49 ([11](img/11-league.jpg)). Tags ("Artsy", "Jock School", "Research Powerhouse") put a name to what you've become.
- **The middle plateaus.** Once the catalogue is built out (around Year 15–20), there is little left to aim for:
  - Late-game projects exist (added storeys, landmarks, historic status) but nothing asks for them.
  - The 24 ambitions help, but they arrive as offers, not as goals the player chooses.
  - Money piles up with nothing big enough to spend it on.

  Suggestions:
  - A few expensive, prestige-defining **capital projects** (a research campus, a medical school, a second quad) that need years of saving.
  - **Endowment-building** as a deliberate goal: move cash in, and name chairs and buildings after donors.
  - Let the player **pick one or two public ambitions** at the start of each decade.

- **The ending pays off.** The Final Report grades the arc rather than the last snapshot, names the eras, and hangs the campus in the hall of fame, with the portrait on the title screen ([14](img/14-final-report-before-fix.jpg), [15](img/15-hall-on-title.jpg)). That is a proper reward. _Fixed:_ the title grammar ("an artists' college that and was very good at it").

## 4. Does customisation make each build feel like the builder's?

**Visually yes. Mechanically, less than it should.**

- **The five styles are really different** (compare Mission [16](img/16-mission-motif.jpg) and Modern [17](img/17-modern-motif.jpg)). Twelve colour pairs (four unlocked by finishing runs), a name that goes on the entrance sign and the facade, free placement on a fixed parcel, named quads, and 44 building types make every campus look like its builder's.
- **Identity tags do show how the college was run**, and the final title is built from them.
- **But strategies converge.** In the harness, all three archetypes earn **"Artsy"**, because Arts & Letters is the first school most players open and the tag reads its share of a small catalogue. A steward and a growth college end with the same catalogue of buildings. Nothing is exclusive: you can have every school, every building and every team. Suggestions:
  - **Trade-offs that lock.** For example, a "teaching college" charter versus a "research university" charter, or a land-grant versus a liberal-arts founding choice, each changing costs and demand.
  - **Mutually exclusive landmarks.**
  - **Tags with real mechanical teeth** (the tag already moves the pool by a few percent; make it matter).
- **Building variety within a style is thin.** Most non-landmark buildings are a box with a roof in the style's material ([09](img/09-year-26-campus.jpg)). A few alternative massings per type (L-shape, courtyard, towered) would make the late campus read as grown rather than stamped.

## 5. Is the pacing balanced?

**Measured, it is inside the design budget. Felt, the middle drags.**

Phase 31's harness puts the steward's evening at about 80 / 75 / 60 / 33 minutes for Years 1–10 / 11–25 / 26–40 / 41–50, inside DD §2.2's spans:

- A week is 5 s at 1×, so a year at 8× is about 23 s plus holds.
- Events arrive every 3–4 weeks in total. With a full set of seats, the President answers about one in fifteen weeks, and the seats handle the rest.
- A seismic letter stops the clock about every 1.3 years.

What that feels like:

- **Years 1–3 are the best-paced stretch.** There is a decision nearly every week, and each one matters.
- **The four calendar beats become chores by mid-game.** When the board is content and nothing new is on the table, Board Meeting and Convocation are a screen with one button ([08](img/08-empty-board-meeting.jpg)). That is 200 of them over a run. Auto-resolve a beat with no decision when the college is sound (show it in the ticker, don't stop the clock), or fold Convocation into Admissions.
- **The frugal player runs long (about 6 hours)** because fast speeds are bought with seats. That is the design's bargain, but a player who doesn't know it will think the game is slow. The locked-speed tooltip explains it; the first "Time, and who buys it" note should arrive earlier (it arrived in Year 3).
- **Late game at 8×** is mostly watching a finished campus while letters arrive. Harder late-game pressure (section 3) would fix this more than any speed change.

## 6. Is it fun?

**Yes, in the opening and at the ending; not enough in the long middle.**

The fun moments:

- Naming the college and watching the facade preview wear the name.
- The first building rising.
- The first class on the lawn.
- The first "Tight" letter from the board, and climbing out of it.
- Beating the rival.
- The first time the guide puts you in the top ten.
- Nearly every letter.
- The Final Report and the chronicle's eras.
- Seeing your campus hang on the title screen.

The fun killers, in order of cost:

1. **Nothing costs anything after Year 15** (abundant cash, fixed event prices).
2. **Saturation**: satisfaction at 98, a title every season.
3. **Beats with no decision** that still stop the clock.
4. **The one-window hiring trap** (now warned about, still unforgiving).
5. **Convergent strategies**: no choice closes a door.

## Recommendations, in priority order

1. **Scale event prices** to the college's budget or estate. Let surplus cash move into the endowment, and make that a visible, satisfying action.
2. **Stop satisfaction and athletics saturating.** Add diminishing returns, rising expectations (students expect more of a top-ten college), and stronger opponents as the college rises.
3. **Make demand respond to teaching, satisfaction and campus condition**, so the frugal and neglectful strategies pay in students, not only in grades. This closes the three open audit findings.
4. **Allow off-cycle adjunct hiring** at a premium.
5. **Auto-resolve decision-free beats** when the college is sound.
6. **Add big late-game projects**, and let the player choose public ambitions for each decade.
7. **Add exclusive founding or charter choices**, and give tags real mechanical effects.
8. **Onboarding gaps:** the teaching-seats note; a founding gift that covers the checklist, or an early note that borrowing is normal; a build menu that collapses while you place.
9. **Building massing variants** within each style.

## Fixed during this playtest (PR #50)

- Budget & Hiring warns, naming the untaught programmes, before closing the market.
- Curriculum says Founders Hall is going up, instead of telling the player to build an Academic Hall.
- `program-thin` ("enrolment down for the fourth year") could fire in Year 1 and close a programme by default. It now needs Year 6 and 200 students. Two other events now wait until there are students.
- The Final Report title grammar ("…that and was very good at it" → "…, and a very good one").
- Chronicle plurals ("1 titles", "1 classes").
- The board-meeting note's timing.

## Numbers behind this review

| Archetype (seed 4) | Mark · rank at Y50 | Students · faculty | Admin share | Events the President answered | Unique events of 144 | Titles |
| ------------------ | ------------------ | ------------------ | ----------- | ----------------------------- | -------------------- | ------ |
| Steward            | B · 1st            | 1,717 · 168        | 28%         | 161 (39 seismic)              | 80                   | 77     |
| Growth             | B · 8th            | 1,555 · 197        | 21%         | 130 (38 seismic)              | 52                   | 0      |
| Frugal             | D · 25th           | 926 · 24           | 49%         | 370 (30 seismic)              | 99                   | 0      |

Performance (production build, headless Chromium, software rendering): a Year-40 campus at 8× runs at 56–59 fps, with the 95th-percentile frame at 16.8 ms. A 50-year headless run takes about 1 s.
