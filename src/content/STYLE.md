# Writing UniSchool

The authoring reference for everything with words in it: events, bus lines,
student arcs, class memory, board letters. It is DD §13.3 made usable, with
the calibration examples the DD asks to be kept alongside the content.

Read this before writing an event. The engine will tell you when a file is
malformed; only this file will tell you when a line is wrong.

## The voice in one paragraph

Wry, affectionate satire of academia, with sincerity underneath. The
college is a real place that real people are living in. It is frequently
ridiculous. They are not.

## The five house rules

**1. Institutions are absurd; individuals are humane.** A committee can be
a joke. A person cannot. The Committee on Committee Reform recommends a
standing subcommittee to monitor implementation — that is funny because a
committee did it. The same line about a named professor would just be
unkind.

**2. Jokes live in specifics.** Not "the faculty are being difficult" but
"the Faculty Senate has voted 31–2". Not "the building is in poor repair"
but "the engineers' report uses the word 'char' as a verb". The specific
detail is the joke; the general statement is a setup with no punchline.
One concrete, checkable detail beats three adjectives.

**3. Never mock students.** They can be funny — they are young and they do
young things, and a student sleeping through a final they had already
passed is funny. They are never the butt. Nothing that reads as contempt
for the people the college exists for.

**4. Distress is written straight.** Austerity is not funny to the people
in it. At the lower rungs of the ladder the jokes stop: a hiring freeze, a
closed program, a letter from the board. Write those plainly, briefly and
with respect. A wry line about a budget cut is a wry line about somebody's
job.

**5. Choices are labelled with honest verbs.** "Fund a parking study",
"Stabilise and defer", "Thank the committee and dissolve it". Never a gag
in the label — the player is choosing, and a label that is a joke is a
label that lies about what it does. The `note` carries the price, or the
cost of not paying it.

## Calibration

The DD's two examples, which every new event should sit comfortably beside:

> "The Faculty Senate has voted 31–2 to express 'grave concern' about the
> parking situation. It is unclear what they would like you to do, and
> neither of the two dissenters can be located."
> — [Fund a parking study · $250k] [Express reciprocal concern · Free]

> "Hurricane damage to Whitfield Hall is worse than feared. The engineers'
> report uses the word 'char' as a verb."
> — [Full renovation · $12M] [Stabilise and defer · $3M, +Backlog]
> [Demolish · the Class of '41 will write letters]

And one of ours, for the straight register:

> "The hiring freeze has held for three years. The Chemistry position that
> opened when Aldous retired has been advertised, unadvertised, and
> advertised again, and the department has stopped asking about it."
> — [Fill the post · $140k a year] [Leave it frozen · Free, and they notice]

## Shape

**Length.** Two or three sentences. One is usually a setup with no world in
it; four is a paragraph the ticker cannot hold. The seismic letters run
longer — four to six — because they stop the clock and have earned the
room.

**Structure that works.** State the situation flatly, then let one detail
turn. The turn is almost always in the last clause: _and neither of the two
dissenters can be located_; _which the insurers have queried_; _and have
begun, inevitably, to enjoy it_. Put the funny thing last.

**Tense.** Present perfect or simple past, reporting what has happened.
The college is telling the administration something.

**Never address the player as "you"** unless the sentence genuinely needs
it. The register is a memo, not a narrator.

**Choices: two or three.** Two when it is money against consequence. Three
when there is a genuinely different third way — usually the one that costs
nothing but spends goodwill instead. Every choice must do something; a
choice with no effects is a choice the player learns to ignore.

**The default** is the choice a college with nobody minding it would make,
which is usually the cheap one. It is stated in the panel before the timeout
runs, so it must be honest.

## Triggers

An event's `when` is what makes it feel aimed at this college rather than
dealt from a deck. Phase 17 measured the consequence of getting this wrong:
an attentive decade asked one question and a neglected decade asked eight,
because the conditions that ordinary play reaches are the ones that fire.

- **Write conditions play actually reaches.** `backlogOver` fires for
  anyone who underfunds maintenance. `endowmentOver: 500000000` fires for
  almost nobody. Aim at the middle of the distribution, not the tail.
- **Two clauses is the sweet spot.** One clause is weather; three is a
  combination lock. Selection already weights an event up for each clause
  it carries, so two earns its rarity without hiding.
- **A cooldown is a promise about repetition.** Three to five years for
  things that recur (the roof, the heating, the parking). Ten to twenty for
  things that should feel like once in a run.
- **Seismic events name their own scale.** Year gates and a second clause,
  a title, and a cost that a decade of the run can feel.

## Ambitions

An ambition (DD §10.2) is a slow event: same voice, same vocabularies, a
date instead of a choice. Four extra rules.

**The title is the promise.** It is what the player reads on the record and
what they will remember being held to, so it must describe what the `goal`
actually checks. A title that says six faculties over a goal that checks
three is the worst thing in the file, because it is the game lying about
what it will measure.

**The terms must not already be the goal.** An ambition dealt to a college
that has already done it is a report, not a temptation. The loader refuses
the obvious case; the subtler one is a `deal` so close to the `goal` that
the promise is a formality.

**A stretch, not a trap.** The point is to make the player want one more
than they can afford — so the goal should be beyond what the college is
doing now and inside what a determined one reaches. The coverage test walks
scripted colleges and will tell you which it is.

**Both endings are written.** `kept` and `missed` are chronicle lines, in
the college's voice, and the missed one is not a punishment note: it is a
sentence about a date that came and a thing that had not happened. Write it
the way the minutes would.

## Naming and placeholders

`{building}` resolves to the worst-off building the college has, `{faculty}`
to someone on the roster, `{program}` to an open program, `{class}` to an
alumni class, `{school}` to the institution. Use them when the sentence is
better for naming something real, and write the sentence so it still reads
if the fallback is used.

Invented names — committees, donors, reports, societies — should sound like
they were minuted rather than written. "The Committee on Committee Reform",
"the Whitfield Bequest", "a report titled _Towards a Parking Strategy_".

## What not to write

- No topical or real-world references. The run spans fifty years of a
  place that does not exist.
- No puns in labels, no exclamation marks, no winking at the player.
- No event whose only content is a number moving. If the sentence would be
  just as good as a line in the ledger, it belongs in the ledger.
- No cruelty played for laughs — not at students, not at staff, not at the
  people austerity lands on.
