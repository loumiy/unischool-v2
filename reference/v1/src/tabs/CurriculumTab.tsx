// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ../data/courseQuality, ../data/facultyData, ../data/techData, ../state/actions, ../systems/faculty/facultyAssignment, ../systems/faculty/facultySearch, ../systems/techtree/instructionCapacity, ../systems/techtree/programOffers, ../systems/techtree/programProgress, ../systems/techtree/schools, ../systems/techtree/techSystem.
import { useCallback, useEffect, useState } from 'react';
import type { Action } from '../state/actions';
import type { Buildable, GameState } from '../state/types';
import { discoverySchools, graduatePrograms, programById, type ProgramInfo } from '../data/techData';
import { hallOf, isHoused, isInTransit } from '../systems/techtree/programOffers';
import { programOfCourse } from '../data/techData';
import { isSchoolFounded } from '../systems/techtree/schools';
import { schoolMark } from '../data/schoolPalette';
import { canPostSearch, searchCost, searchWeeksLeft } from '../systems/faculty/facultySearch';
import {
  canStartDevelopment, facultyGate, eligibleInstructors, assignedInstructor,
  isUnstaffed, facultyLoad, hallOfCourse, canSwapInstructors, effectiveCourseSlots, neededFacultyFields,
} from '../systems/techtree/techSystem';
import { hallDisplayName } from '../systems/techtree/schools';
import { milestoneLine, programProgress, tierBands, unmetPrereqNames, type ProgramProgress } from '../systems/techtree/programProgress';
import { SEATS_PER_COURSE } from '../systems/techtree/instructionCapacity';
import { facultyQualityTier } from '../data/facultyData';
import { gradeFor, qualityOf, tierOf, type Grade } from '../data/courseQuality';
import {
  averageCourseQuality, courseQuality, facultyLoads, projectedQuality, type FacultyLoads,
} from '../systems/faculty/facultyAssignment';
import HelpHint from '../components/HelpHint';
import FacultyPortrait, { portraitOf } from '../components/FacultyPortrait';
import { ProgressRing } from '../components/Progress';
import type { Faculty } from '../state/types';

// ---------------------------------------------------------------------
// Progressive discovery: the curriculum is not laid out whole. What's
// visible is derived purely from existing unlock/milestone state — no new
// gating, just a different read of it:
//   - Programs are FOUNDED from an academic hall on the campus map, three
//     on offer at a time (Plan 14 — see systems/techtree/programOffers.ts
//     and BuildingInfoPanel.tsx). Nothing about that happens here: the tab
//     shows what has a home. At founding that is the three programs of
//     the founding college (Plan 19 — actions.ts's FOUNDING_PROGRAMS), so
//     the tab opens on one school section with three rows already filled
//     in, which is the first screen that says what kind of college this is.
//   - Once one of a school's programs is housed, the school forms a
//     section: its housed majors' tier-1s + tier-2s, shared across majors
//     that haven't completed their tier-2 quartet yet. The section is
//     drawn as ONE ROW PER PROGRAM (PR G): nine cells in tier order, the
//     unrevealed ones drawn empty so every row is the same width and
//     position carries tier, grouped under the school's colour and mark
//     — and its name only once the school is founded.
//   - Once a major's tier-2 quartet is complete (the existing
//     `program-established:<prefix>` milestone), that major splits into its
//     own labeled sub-group within the section, and its tier-3s appear
//     there — the same event, per the task.
//   - Once a GRADUATE PROGRAM's parent-school gate opens (see
//     techData.ts's graduateGateMet — five of six majors complete for a
//     professional school, a finished lab for a doctorate), the MBA and
//     each PhD doctorate appear as one more labeled sub-group inside their
//     home school's section, marked as the higher tier they are and
//     captioned with the gate they just cleared — unchanged from before.
//   - Medicine and Law are different: they award an external professional
//     degree rather than building on their parent school's own subject
//     matter, so each stands as its OWN top-level section (own heading, own
//     completion ring, own building), structurally parallel to an
//     undergraduate school rather than a sub-group inside one. Their
//     section reveals once their OWN building is done — the same boolean
//     an undergraduate school section reveals on — not merely once the
//     academic gate that makes the building buildable is met. Reveal, not
//     scarcity: before the building is done there is no Med/Law section on
//     screen at all, in the same way there is no wall of tier-3 courses
//     before a major completes.
// A course, once revealed, is never hidden again — only its cell state
// (locked/available/developing/done) changes as the underlying Buildable
// status does. "Locked" here means revealed-but-blocked (a faculty gate or
// a cross-major prereq bridge still unmet), never "not yet discovered".
// ---------------------------------------------------------------------

// The catalogue's own completion is the panel's headline figure.
const CATALOG_RING_SIZE = 46;

// A sub-group inside a school section: a completed major (its own tier-3
// catalogue now visible) or a revealed graduate program. `graduate` is set
// only for the latter, and carries the two things a graduate group has to
// say that a major does not — which credential it awards, and which gate
// it cleared to appear at all.
export interface DiscoverySubgroup {
  key: string;
  label: string;
  courseIds: string[];
  graduate?: { degree: string; gate: string };
}

export interface DiscoverySection {
  key: string;
  label: string;
  // The section head's full title. "School of {label}" for every school
  // that hasn't sold its naming rights; the donor's full display text
  // verbatim once it has (see buildSections below and eventData.ts's
  // 'naming-rights' event).
  heading: string;
  courseIds: string[];
  subgroups: DiscoverySubgroup[];
  // Every course id this school will ever own (all tiers of all its
  // majors), whether revealed yet or not — the denominator of the
  // section head's completion ring.
  schoolCourseIds: string[];
}

// Which graduate programs are currently revealed — the one reading the
// whole graduate half of this view runs on. A program is revealed once it
// is HOUSED (Plan 14): its gate (techData.ts's graduateGateMet) is what
// puts it on offer, and taking a hall slot is what puts it in the
// curriculum — the same rule an undergraduate major follows, so the tab
// can never show a program the engine has not opened, or hide one it has.
function revealedGraduatePrograms(s: GameState): Set<string> {
  const revealed = new Set<string>();
  for (const program of graduatePrograms()) {
    if (isHoused(s, program.id)) revealed.add(program.id);
  }
  return revealed;
}

function buildSections(s: GameState, revealedGrad: Set<string>): DiscoverySection[] {
  const sections: DiscoverySection[] = [];

  for (const school of discoverySchools()) {
    // A SCHOOL APPEARS ONCE ONE OF ITS PROGRAMS IS HOUSED (Plan 14). There
    // is no school building any more: a program is founded by taking a
    // slot in an academic hall on the map, and a school is what the player
    // makes by housing six of its programs together. A major that has not
    // been founded is simply not here yet — its entry course is 'locked'
    // behind the housed gate (techSystem.ts's meetsUnlockGates) and the
    // hall panel is where it is founded from, not this tab.
    const housedMajors = school.majors.filter((major) => isHoused(s, major.prefix));
    if (housedMajors.length === 0) continue;

    const sharedIds: string[] = [];
    const subgroups: DiscoverySubgroup[] = [];
    for (const major of housedMajors) {
      const programEstablished = !!s.milestones[`program-established:${major.prefix}`];
      if (programEstablished) {
        subgroups.push({
          key: major.prefix,
          label: major.name,
          courseIds: [major.tier1Id, ...major.tier2Ids, ...major.tier3Ids],
        });
      } else {
        sharedIds.push(major.tier1Id, ...major.tier2Ids);
      }
    }
    // Graduate programs come last inside the section, after every major,
    // because that is where they sit in the climb.
    const gradIds: string[] = [];
    for (const program of school.graduate) {
      if (!revealedGrad.has(program.id)) continue;
      gradIds.push(...program.courseIds);
      subgroups.push({
        key: program.id,
        label: program.name,
        courseIds: program.courseIds,
        graduate: { degree: program.degree, gate: program.gate },
      });
    }

    // COLOUR, NOT LABEL (Plan 14's PR E). A school's NAME is revealed on
    // founding — six of its programs housed in one hall — and until then
    // its programs sit under its colour and mark with no name, so "three
    // of this colour already, and a hall with three slots free" is a
    // conclusion the player reaches by looking. Once founded, the heading
    // is the school's name, or the donor's full display text verbatim if
    // its dedicated hall's naming rights were sold (see eventData.ts's
    // 'naming-rights' — a `donorSurname` on the hall is what marks its
    // `name` as donor text rather than the seeded catalogue name).
    const founded = isSchoolFounded(s, school.name);
    const mark = schoolMark(school.name);
    const namedHall = founded
      ? housedMajors
        .map((major) => hallOf(s, major.prefix))
        .map((hallId) => (hallId ? s.tech.find((t) => t.id === hallId) : undefined))
        .find((hall) => hall?.donorSurname)
      : undefined;
    sections.push({
      key: school.name,
      label: founded ? school.name : `${mark.motif} unfounded school`,
      heading: namedHall ? namedHall.name : founded ? `School of ${school.name}` : `${mark.motif} An unfounded school`,
      courseIds: sharedIds,
      subgroups,
      // A school's completion ring counts its graduate programs only once
      // they are revealed. Counting them earlier would put a medical
      // school in the denominator of a Health Science ring years before
      // the player has any way of knowing one exists.
      schoolCourseIds: [...school.majors.flatMap((m) => [m.tier1Id, ...m.tier2Ids, ...m.tier3Ids]), ...gradIds],
    });
  }

  // There is no ungrouped pool. It used to hold the gen-ed core (retired
  // by Plan 19), and before that every major's tier-1 course once the
  // core was done — forty-two alphabetical cards, "not yet organised by
  // school", which is the wall Plan 14 exists to take down. A course is
  // founded from a hall slot on the map (three programs on offer at a
  // time), and appears here only once it has a home.
  return sections;
}

// The same section list buildSections computes for this tab's own render,
// exposed for anything else that needs a school/professional-school's
// completion without re-deriving revealedGrad itself — the campus map's
// building info popover, in particular (see CampusMap.tsx). Each section's
// `key` is the school's name, so a caller holding a program's school can
// find its section with a plain lookup.
export function discoverySections(s: GameState): DiscoverySection[] {
  const revealedGrad = revealedGraduatePrograms(s);
  return buildSections(s, revealedGrad);
}

// Every course id currently rendered somewhere on this tab — every school
// section, and every subgroup inside one — regardless of that course's
// own status. This is the curriculum alert badge's definition of
// "visible" (see types.ts's SeenState): a course counts as new the instant
// it's REVEALED, whether it arrives already 'available' (a freshly-founded
// program's entry course) or still 'locked' pending its own prereqs (a
// tier-2 sharing a brand-new school section with a tier-1 that isn't done
// yet) — both are a cell appearing on screen where there was none before,
// which is the moment there's something new to notice.
export function visibleCourseIds(s: GameState): string[] {
  const ids: string[] = [];
  for (const section of discoverySections(s)) {
    ids.push(...section.courseIds);
    for (const sub of section.subgroups) ids.push(...sub.courseIds);
  }
  return ids;
}

// =====================================================================
// THE MAP'S OWN SHAPE: schools, and the lanes inside them.
//
// A second reading of the SAME revealed set the sections above compute —
// never a second set of reveal rules. `visibleCourseIds` stays the one
// answer to "has the player met this course yet"; all this does is regroup
// what it returns from flat pools into the structure the catalogue
// actually has: school -> major -> tier.
//
// WHY LANES RATHER THAN A GRAPH. The curriculum is a total hierarchy with
// a sparse graph laid over it. 42 majors of exactly nine courses in a
// fixed 1/4/4 shape means the tier chain is ~336 edges every one of which
// says the same thing, while the ~50 authored CROSS_MAJOR_BRIDGES are the
// only interesting ones. Drawing them all spends the whole visual budget
// on the boring 336 and buries the 50 — and shrinks the node to a dot,
// which is what undid full course names last time. So the regular
// structure is carried by POSITION (three bands, left to right, with a
// chevron between) and drawn with zero lines, and an edge is only ever
// drawn for a bridge, on demand.
// =====================================================================

// ONE ROW PER PROGRAM (Plan 14's PR G). The view the progression actually
// has: a housed program is a row of its courses in tier order — one entry
// course, four tier-2, four tier-3 — with unrevealed courses drawn as
// empty cells so every row is the same width and position carries tier.
// Rows group under their school, so clusters form on their own; a school
// is labelled by colour and mark until it is founded, and by name after.
interface ProgramRow {
  program: ProgramInfo;
  revealed: Set<string>; // which of its courses this tab shows as cells (the rest are placeholders)
}

interface SchoolGroup {
  key: string;      // the school's name
  heading: string;  // the section heading: the name once founded, the mark alone before
  founded: boolean;
  mark: { hue: string; motif: string };
  rows: ProgramRow[];
}

function schoolGroups(s: GameState, sections: DiscoverySection[]): SchoolGroup[] {
  const schools = new Map(discoverySchools().map((school) => [school.name, school]));
  const groups: SchoolGroup[] = [];
  for (const section of sections) {
    const school = schools.get(section.key);
    if (!school) continue;
    const revealed = new Set<string>([...section.courseIds, ...section.subgroups.flatMap((g) => g.courseIds)]);
    const rows: ProgramRow[] = [];
    for (const major of school.majors) {
      if (!isHoused(s, major.prefix)) continue;
      const program = programById(major.prefix);
      if (program) rows.push({ program, revealed });
    }
    // Graduate programs come last inside a school, where they sit in the
    // climb.
    for (const grad of school.graduate) {
      const program = programById(grad.id);
      if (program && isHoused(s, grad.id)) rows.push({ program, revealed });
    }
    if (rows.length === 0) continue;
    groups.push({
      key: section.key,
      heading: section.heading,
      founded: isSchoolFounded(s, section.key),
      mark: schoolMark(section.key),
      rows,
    });
  }
  return groups;
}

// Which school a course belongs to, so search results and a bridge badge
// can say where a course lives and navigate straight to it. Derived from
// the seed, memoized — the catalogue is static.
let courseSchoolMap: Map<string, { key: string; school: string }> | null = null;
function courseSchools(): Map<string, { key: string; school: string }> {
  if (courseSchoolMap) return courseSchoolMap;
  const map = new Map<string, { key: string; school: string }>();
  for (const school of discoverySchools()) {
    const entry = { key: school.name, school: school.name };
    for (const major of school.majors) {
      for (const id of [major.tier1Id, ...major.tier2Ids, ...major.tier3Ids]) map.set(id, entry);
    }
    for (const program of school.graduate) {
      for (const id of program.courseIds) map.set(id, entry);
    }
  }
  courseSchoolMap = map;
  return map;
}

// The cross-major prereqs of a course: prereqs that are THEMSELVES COURSES
// and come from a different major. Read off the course's own prereqs rather
// than CROSS_MAJOR_BRIDGES directly, so a bridge authored anywhere still
// shows up.
//
// The course check is not defensive tidying — prereqs cross KINDS as well
// as majors (docs/architecture/buildables.md), so a tier-3 course
// routinely requires its major's LAB. `LAB-CHEM` trivially has a different
// id prefix from `CHEM230`, so a prefix test alone calls a building a
// cross-listed course and offers to navigate to it, which the map cannot
// do and the player would not want: the lab is something you BUILD, not
// somewhere you go in the catalogue.
function crossMajorPrereqs(t: Buildable, lookup: Map<string, Buildable>): string[] {
  const prefix = t.id.replace(/[0-9]+$/, '');
  return t.prereqs.filter((id) => {
    if (lookup.get(id)?.kind !== 'course') return false;
    return id.replace(/[0-9]+$/, '') !== prefix;
  });
}

type CellState = 'locked' | 'blocked' | 'available' | 'developing' | 'done';

function cellState(s: GameState, t: Buildable): CellState {
  if (t.status === 'done') return 'done';
  if (t.status === 'developing') return 'developing';
  if (t.status === 'locked') return 'locked';
  return canStartDevelopment(s, t) ? 'available' : 'blocked';
}

// The grade chip. One component for a course's own grade and for an
// aggregate (a major's, a school's), because they are the same claim at
// different scales and must read identically — a school showing "B" means
// its courses average a B, not something else that happens to look alike.
//
// The letter carries the meaning and the tint is only a cue: colour alone
// would be unreadable to a colour-blind player, and unreadable at the
// zoomed-out sizes the curriculum map will want, so the letter never drops.
export function GradeChip({ grade, title, size = 'sm' }: { grade: Grade; title?: string; size?: 'sm' | 'lg' }) {
  return (
    <span className={`grade-chip grade-${grade.toLowerCase()} ${size}`} title={title}>
      {grade}
    </span>
  );
}

// An aggregate grade across a set of courses, or nothing when none of them
// are graded yet. What a school section head and a major subgroup show —
// and, once the curriculum map lands, what its university-level view is
// built from.
function AggregateGrade({ s, ids, label, loads }: { s: GameState; ids: string[]; label: string; loads: FacultyLoads }) {
  const avg = averageCourseQuality(s, ids, loads);
  if (avg === null) return null;
  return <GradeChip grade={gradeFor(avg)} title={`${label} averages ${Math.round(avg)} / 100 across its developed courses`} />;
}

// One course cell: its code (e.g. "FINA 101") over its title, filling
// brass when done and pulsing while developing. Clicking it opens the
// course drawer (see CourseDrawer below). The code is split into
// department and number so a wall of forty-odd codes reads as a column of
// departments with a number attached, rather than eight undifferentiated
// characters.
//
// THERE IS NO HOVER CARD. There used to be, and it carried everything a
// course had to say — description, prereqs, the faculty gate, cost,
// instructor — because hovering was the only way to learn any of it. The
// drawer is that now, and better: it holds the same facts plus the
// decision they are there to inform, it stays put while you read it, and
// it does not cover the neighbouring cells you are scanning. A hover card
// repeating a strict subset of an open panel is not a shortcut, it is a
// second answer to the same question.
//
// So the cell carries only what has to be legible WITHOUT clicking, at a
// glance, across a whole screen of cells: state (by fill), progress (the
// bar on a developing course), an unstaffed marker, and a dot for a
// course whose field has no free slot (see the legend under the panel
// head). Everything else is one click away.
//
// The dot is a neutral marker, NOT the field's initial: same-field cells
// lighting up together with a letter on them would draw the eye to
// clusters that correlate with school membership the pool is not meant to
// reveal yet.
// THE FACULTY CHIP (PR G). A compact instructor sits with each developed
// course — portrait, surname, grade — and chips DRAG between courses to
// swap instructors, with a live grade delta on both courses while
// dragging, which is the entire reason the mechanic is worth building. A
// drop that is not a legal swap (see techSystem.ts's canSwapInstructors:
// wrong department, someone full, a program in transit) is a no-op and
// both professors stay where they were.
export interface DragState {
  courseId: string;   // the course whose chip is being dragged
  facultyId: string;  // who is on it
}
export interface DragHandlers {
  drag: DragState | null;
  over: string | null; // the course the chip is currently held over
  onDragStart: (courseId: string, facultyId: string) => void;
  onDragOver: (courseId: string) => void;
  onDragEnd: () => void;
  onDrop: (courseId: string) => void;
}

// Money at the grain a scan needs: "$180k", "$4.0M". The drawer keeps the
// full figure; a cell and a row button have room for four characters.
export function moneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  return `$${Math.round(n / 1000)}k`;
}

function surnameOf(name: string): string {
  const parts = name.replace(/^(Dr|Prof|Professor)\.?\s+/, '').split(' ');
  return parts[parts.length - 1];
}

function InstructorChip({ f, grade, draggable, onDragStart, onDragEnd }: {
  f: Faculty; grade: Grade | null; draggable: boolean;
  onDragStart?: (e: React.DragEvent) => void; onDragEnd?: () => void;
}) {
  return (
    <span
      className={`instructor-chip${draggable ? ' draggable' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={`${f.name}${draggable ? ' — drag onto another course in this department to swap' : ''}`}
    >
      <FacultyPortrait f={portraitOf(f)} size={18} />
      <span className="instructor-chip-name">{surnameOf(f.name)}</span>
      {grade && <span className={`instructor-chip-grade grade-${grade.toLowerCase()}`}>{grade}</span>}
    </span>
  );
}

export function CourseCell({ s, t, selected, onSelect, loads, dnd }: {
  s: GameState; t: Buildable; selected: boolean; onSelect: (id: string) => void; loads: FacultyLoads;
  // Present only inside the rows, where a chip can be dragged and a cell
  // can be dropped on; the worklist's cells carry none.
  dnd?: DragHandlers;
}) {
  const state = cellState(s, t);
  // Cost and duration are the drawer's business; the cell carries what a
  // scan across a row needs — the code, the title, and what the school can
  // offer at a glance.
  const [code, titleFromName] = t.name.split(' · ');
  const title = titleFromName ?? code;
  // Not just "is the field full" but "would waiting help" — see
  // techSystem.ts's facultyGate.
  const gate = t.requiresFaculty ? facultyGate(s, t.requiresFaculty) : 'open';
  // An offered course whose instructor has left (see types.ts's
  // CourseFaculty) — marked on the cell because it is a thing the player
  // must fix, and they should not have to open a course to discover it.
  const unstaffed = isUnstaffed(s, t);
  // Only an offered, staffed course carries a grade: an undeveloped one is
  // an empty slot in the catalogue rather than a failing course, and an
  // unstaffed one is not being taught at all (see courseQuality).
  const quality = courseQuality(s, t, loads);
  const instructor = assignedInstructor(s, t);
  // The gate is only news while the course is still ahead of the player:
  // a developing or finished course already holds its slot.
  const showGateDot = gate !== 'open' && state !== 'developing' && state !== 'done';

  const weeksLeft = s.developing[t.id] ?? 0;
  const elapsed = t.duration > 0 ? (t.duration - weeksLeft) / t.duration : 1;
  // WHAT STARTING IT WOULD MEAN, on the cell itself: its cost and the
  // strongest teacher free to take it with the grade they would earn — or
  // why nobody can. The two facts a scan across a row needs before
  // choosing which course to open, and the two the drawer used to be the
  // only way to learn. Only on a course still ahead of the player.
  const ahead = state === 'available' || state === 'blocked';
  const best = ahead && t.requiresFaculty ? eligibleInstructors(s, t)[0] : undefined;
  const bestGrade = best ? projectedQuality(s, t, best, loads).grade : null;
  // Its program is between halls (Plan 14's PR F): not taught, not
  // advancing, and marked so the player does not have to open the course
  // to learn why its grade is gone.
  const programId = programOfCourse(t.id);
  const transit = programId !== undefined && isInTransit(s, programId);

  // THE SWAP PREVIEW. While a chip is held over a cell it can legally be
  // dropped on, both cells show what their grade would become: the target
  // with the dragged professor, the source with the target's. Computed
  // here per cell from the drag state rather than stored anywhere.
  const dragging = dnd?.drag ?? null;
  const isSource = dragging?.courseId === t.id;
  const isTarget = !!dragging && dnd?.over === t.id && !isSource;
  const legalTarget = !!dragging && !isSource && canSwapInstructors(s, dragging.courseId, t.id);
  let preview: { grade: Grade; delta: number } | null = null;
  if (dragging && instructor && (isTarget || (isSource && dnd?.over))) {
    const otherId = isSource ? dnd!.over! : dragging.courseId;
    const other = s.tech.find((x) => x.id === otherId);
    const incoming = other ? assignedInstructor(s, other) : undefined;
    if (other && incoming && canSwapInstructors(s, dragging.courseId, isSource ? otherId : t.id)) {
      const projected = projectedQuality(s, t, incoming, loads);
      preview = { grade: projected.grade, delta: projected.score - (quality?.score ?? 0) };
    }
  }

  return (
    <button
      type="button"
      id={`course-${t.id}`}
      className={`course-cell ${state}${t.graduateProgram ? ' graduate' : ''}${unstaffed ? ' unstaffed' : ''}${transit ? ' transit' : ''}${selected ? ' selected' : ''}${isSource ? ' drag-source' : ''}${legalTarget ? ' drop-target' : ''}${isTarget && legalTarget ? ' drop-over' : ''}`}
      aria-pressed={selected}
      onClick={() => onSelect(t.id)}
      onDragOver={dnd && legalTarget ? (e) => { e.preventDefault(); if (dnd.over !== t.id) dnd.onDragOver(t.id); } : undefined}
      onDrop={dnd && legalTarget ? (e) => { e.preventDefault(); dnd.onDrop(t.id); } : undefined}
    >
      <span className="cell-code">{code}</span>
      <span className="cell-title">{title}</span>
      {ahead && (
        <span className="cell-next">
          {moneyShort(t.cost)}
          {best
            ? <> · {surnameOf(best.name)} <span className={`instructor-chip-grade grade-${bestGrade!.toLowerCase()}`}>{bestGrade}</span></>
            : t.requiresFaculty ? ' · no free slot' : ''}
        </span>
      )}
      {/* The chip replaces the done-tick: a staffed course is self-evidently
          developed, and two marks in one corner competing for the same
          glance is one mark too many. */}
      {instructor && (state === 'developing' || state === 'done') && (
        <InstructorChip
          f={instructor}
          grade={quality?.grade ?? null}
          draggable={!!dnd && !transit}
          onDragStart={dnd ? (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; dnd.onDragStart(t.id, instructor.id); } : undefined}
          onDragEnd={dnd ? dnd.onDragEnd : undefined}
        />
      )}
      {preview && (
        <span className={`swap-preview${preview.delta > 0 ? ' up' : preview.delta < 0 ? ' down' : ''}`} aria-live="polite">
          → {preview.grade} ({preview.delta > 0 ? '+' : ''}{Math.round(preview.delta)})
        </span>
      )}
      {state === 'done' && !instructor && !unstaffed && <span className="cell-stamp" aria-hidden="true">✓</span>}
      {unstaffed && <span className="cell-stamp unstaffed" title="No instructor">!</span>}
      {transit && !unstaffed && <span className="cell-stamp transit" title="Its program is moving halls — dark until it settles">⇄</span>}
      {/* Two colours, two actions. Yellow: the department is full but
          somebody is listed, so this is one appointment away. Red: full and
          nobody to appoint, so only time fixes it. */}
      {showGateDot && (
        <span
          className={`cell-gate-dot ${gate}`}
          aria-hidden="true"
          title={gate === 'hireable'
            ? `No free ${t.requiresFaculty} slot — a candidate is on the market`
            : `No free ${t.requiresFaculty} slot, and nobody on the market`}
        />
      )}
      {state === 'developing' && (
        <span className="cell-progress" aria-hidden="true">
          <span className="cell-progress-fill" style={{ width: `${Math.round(elapsed * 100)}%` }} />
        </span>
      )}
    </button>
  );
}


// ---------------------------------------------------------------------
// THE COURSE DRAWER, and the decision it exists for.
//
// Clicking a course no longer starts it. It opens this, and the drawer
// leads with the question the old build never asked: WHO TEACHES IT.
// Before, development auto-assigned nobody in particular — the engine
// tracked only per-field slot capacity, and the name under a cell was a
// round-robin computed on read. Now the player picks, the pick is stored
// (see types.ts's CourseFaculty), and it is editable for the life of the
// course.
//
// Four cases, and the last two are the reason this is a panel rather than
// a confirm dialog:
//
//   1. SEVERAL eligible. A list, strongest teacher first, each a real
//      person — portrait, rank, teaching, current load. The player chooses.
//   2. EXACTLY ONE eligible. Pre-selected, one button. Frictionless, as it
//      should be — but never silent: the player still learns who it is,
//      because they will want to know in five years when the grade is bad.
//   3. NOBODY free, but the department EXISTS. The old build showed a dot
//      on a cell and left the player to work out what to do. Here the
//      people who are full are listed by name with their loads, because
//      "Dr. Iyer is teaching 2 of 2" is the actual information — it says
//      reassign, or hire, rather than just "no".
//   4. NOBODY at all. The hire happens HERE, from the standing market, in
//      the course's own field. And when the market is empty in that field
//      this says so plainly, because that is real information too (a
//      thin-market specialist turns up only every few months — see
//      facultyData.ts's churn block), and it tells the player to wait and
//      watch rather than hunt for a button that does not exist.
// ---------------------------------------------------------------------

// One selectable person. Deliberately the same furniture the Faculty tab
// uses for a roster card — portrait, name, rank badge — so a professor
// reads as the same professor in both places, plus the two things that
// matter HERE and nowhere else: how good a teacher they are, and how
// loaded they already are.
export function InstructorOption(
  { s, f, selected, disabled = false, projectedFor, onPick }:
  { s: GameState; f: Faculty; selected: boolean; disabled?: boolean; projectedFor?: Buildable; onPick?: () => void },
) {
  const load = facultyLoad(s, f.id);
  // WHAT THIS COURSE WOULD BE GRADED if they took it — the single most
  // useful thing on the card, and the reason the picker is a list of
  // people rather than a dropdown of names. Comparing "teaching 71" with
  // "teaching 64" is abstract; comparing a B with a C is the actual
  // consequence, and it already folds in what their existing load and this
  // course's tier will do to it.
  //
  // Costs nothing to compute speculatively: qualityOf is pure arithmetic
  // on four numbers (see data/courseQuality.ts). The load passed is what
  // theirs WOULD become — their current count plus this course, unless
  // they already teach it.
  const projected = projectedFor
    ? qualityOf({
      teaching: f.teaching,
      acclaim: f.acclaim,
      load: s.courseFaculty[projectedFor.id] === f.id ? load : load + 1,
      slots: f.courseSlots,
      tier: tierOf(projectedFor.id),
    })
    : null;
  return (
    <button
      type="button"
      className={`instructor-option${selected ? ' selected' : ''}${disabled ? ' full' : ''}`}
      disabled={disabled}
      aria-pressed={selected}
      onClick={onPick}
    >
      <FacultyPortrait f={portraitOf(f)} size={34} />
      <span className="instructor-option-body">
        <span className="instructor-option-name">{f.name}</span>
        <span className="instructor-option-meta">
          {facultyQualityTier(f)} · {f.field}
        </span>
        <span className="instructor-option-bars">
          <span className="instructor-stat" title={`Teaching ${f.teaching} of a possible ${f.teachingPotential}`}>
            <span className="instructor-stat-label">Teaching</span>
            <span className="instructor-bar-track">
              <span className="instructor-bar-headroom" style={{ width: `${f.teachingPotential}%` }} />
              <span className="instructor-bar-fill" style={{ width: `${f.teaching}%` }} />
            </span>
            <span className="instructor-stat-value">{f.teaching}</span>
          </span>
        </span>
      </span>
      <span className="instructor-option-right">
        {projected && (
          <GradeChip
            grade={projected.grade}
            title={`This course would be graded ${projected.grade} (${Math.round(projected.score)} / 100) with them`}
          />
        )}
        <span className={`instructor-option-load${load >= f.courseSlots ? ' full' : ''}`}>
          {load} / {f.courseSlots}
          <span className="instructor-load-label">courses</span>
        </span>
      </span>
    </button>
  );
}

// THE SEARCH, offered where the shortage is felt (Plan 14's PR H): when
// nobody in a department can take a course, the picker offers to pay for
// a search rather than a dead end — see systems/faculty/facultySearch.ts.
// Exported for the hall panel's course strip and the Faculty board, which
// offer the same thing in the same words.
export function SearchOffer({ s, act, field }: { s: GameState; act: (a: Action) => void; field: string }) {
  const left = searchWeeksLeft(s, field);
  if (left > 0) {
    return (
      <p className="course-drawer-note search-running">
        A {field} search is running — {left} week{left === 1 ? '' : 's'} left. Every week it may turn somebody up.
      </p>
    );
  }
  const cost = searchCost(s);
  return (
    <button
      type="button"
      className="course-drawer-action search-post"
      disabled={!canPostSearch(s, field)}
      onClick={() => act({ type: 'POST_SEARCH', field })}
      title={`Advertise, headhunt and visit conferences for ${SEARCH_WEEKS_LABEL}: a much better chance every week that a ${field} candidate is listed.`}
    >
      Post a search in {field} · ${cost.toLocaleString()}
    </button>
  );
}
const SEARCH_WEEKS_LABEL = 'half a year';

// THE MARKET, WHERE THE COURSE IS. Every candidate listed in a field, each
// with an Appoint button, and the search offered beside them — so a player
// who needs more faculty for THIS course hires from this course, and sees
// what a posted search has turned up without going to the Faculty board.
// Shared by the drawer and the hall panel's course strip and founding
// picker, so all three say the same thing.
export function MarketInField({ s, act, field, projectedFor }: {
  s: GameState; act: (a: Action) => void; field: string; projectedFor?: Buildable;
}) {
  const listed = s.candidates.filter((c) => c.field === field).sort((a, b) => b.teaching - a.teaching);
  return (
    <div className="course-drawer-hire">
      <h5>On the market in {field}</h5>
      {listed.length === 0 ? (
        <p className="course-drawer-note quiet">
          No {field} candidates are listed this week. The market turns over constantly — or pay for a search.
        </p>
      ) : (
        listed.map((c) => (
          <div key={c.id} className="course-drawer-candidate">
            <InstructorOption s={s} f={c} selected={false} projectedFor={projectedFor} />
            <button
              type="button"
              className="course-drawer-appoint"
              disabled={s.finance.cash < 0}
              onClick={() => act({ type: 'HIRE_FACULTY', facultyId: c.id })}
              title={`Appoint ${c.name} to the ${field} department`}
            >
              Appoint · ${Math.round(c.salary).toLocaleString()}/yr
            </button>
          </div>
        ))
      )}
      <SearchOffer s={s} act={act} field={field} />
    </div>
  );
}

function CourseDrawer(
  { s, act, t, lookup, onClose, loads, onGoToCourse, onOpenFaculty }:
  {
    s: GameState; act: (a: Action) => void; t: Buildable; lookup: Map<string, Buildable>;
    onClose: () => void; loads: FacultyLoads; onGoToCourse: (id: string) => void;
    onOpenFaculty?: (field: string) => void;
  },
) {
  const state = cellState(s, t);
  const offered = t.status === 'developing' || t.status === 'done';
  const instructor = assignedInstructor(s, t);
  const unstaffed = isUnstaffed(s, t);
  const quality = courseQuality(s, t, loads);
  const bridges = crossMajorPrereqs(t, lookup);

  // For an offered course the current instructor must stay eligible for
  // their own course (see techSystem.ts's eligibleInstructors `except`),
  // or a full professor would read as unable to go on teaching what they
  // already teach.
  const eligible = eligibleInstructors(s, t, offered ? t.id : undefined);
  const inField = t.requiresFaculty ? s.faculty.filter((f) => f.field === t.requiresFaculty) : [];

  // The pick resets whenever the course changes, and defaults to the
  // current instructor for an offered course or the strongest eligible
  // teacher for a new one — which is what makes the one-candidate case a
  // single click rather than a click to choose and a click to confirm.
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { setPicked(null); }, [t.id]);
  const chosen = picked ?? instructor?.id ?? eligible[0]?.id ?? null;

  const [code, titleFromName] = t.name.split(' · ');
  const title = titleFromName ?? code;
  const weeksLeft = s.developing[t.id] ?? 0;
  const shortfall = t.cost - s.finance.cash;

  function develop() {
    if (chosen) act({ type: 'START_DEVELOPMENT', nodeId: t.id, facultyId: chosen });
  }
  function reassign() {
    if (chosen && chosen !== instructor?.id) act({ type: 'REASSIGN_COURSE_FACULTY', courseId: t.id, facultyId: chosen });
  }

  return (
    <aside className="course-drawer" aria-label={`${title} detail`}>
      <div className="course-drawer-head">
        <div>
          <span className="course-drawer-code">{code}</span>
          <h3>{title}</h3>
        </div>
        <button type="button" className="course-drawer-close" onClick={onClose} aria-label="Close course detail">✕</button>
      </div>

      <div className="course-drawer-body">
        <p className="course-drawer-desc">{t.description}</p>

        <dl className="course-drawer-facts">
          <div><dt>Cost</dt><dd>${t.cost.toLocaleString()}</dd></div>
          <div><dt>Duration</dt><dd>{t.duration} weeks</dd></div>
          <div><dt>Department</dt><dd>{t.requiresFaculty ?? '—'}</dd></div>
          {(() => {
            const hallId = hallOfCourse(s, t.id);
            const hall = hallId ? lookup.get(hallId) : undefined;
            return hall ? <div><dt>Housed in</dt><dd>{hall.name}</dd></div> : null;
          })()}
          {state === 'developing' && <div><dt>Remaining</dt><dd>{weeksLeft} weeks</dd></div>}
        </dl>

        {/* THE GRADE, ITEMIZED. A letter on its own tells the player
            nothing they can act on; the factors tell them exactly what to
            do — move a course off this professor, or put a stronger one on
            the capstone. Every line names something they decided. */}
        {quality && (
          <section className="course-drawer-section">
            <h4>Quality</h4>
            <div className="course-drawer-grade">
              <GradeChip grade={quality.grade} size="lg" />
              <div className="course-drawer-grade-body">
                <span className="course-drawer-grade-score">{Math.round(quality.score)} / 100</span>
                <ul className="course-drawer-factors">
                  {quality.factors.map((factor) => (
                    <li key={factor.label} className={factor.value < 0 ? 'down' : 'up'}>
                      <span>{factor.label}</span>
                      <span className="num">{factor.value > 0 ? '+' : '−'}{Math.abs(Math.round(factor.value))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {t.prereqs.length > 0 && (
          <section className="course-drawer-section">
            <h4>Prerequisites</h4>
            {/* EVERY PREREQUISITE IS A DOOR. Clicking one goes there —
                opens its school, selects it, and clears any filter in the
                way. This is the map's most useful move and the reason
                cross-major bridges are not drawn as lines: the prerequisite
                that matters is almost always one the player cannot
                currently see, and a line to an offscreen node is worth
                nothing next to arriving at it.

                A bridge (a prereq from another major — see
                crossMajorPrereqs) is marked, because "this course needs
                something from another school" is the genuinely surprising
                fact in a catalogue whose other 336 prereq edges all say
                the same thing. */}
            <ul className="course-drawer-prereqs">
              {t.prereqs.map((id) => {
                const p = lookup.get(id);
                const met = p?.status === 'done';
                const bridge = bridges.includes(id);
                // Only a course is somewhere to go. A prereq of another
                // kind — a school building, a lab — is something to build,
                // so it is stated rather than offered as a door that leads
                // nowhere this view can show.
                if (p?.kind !== 'course') {
                  return (
                    <li key={id} className={met ? 'met' : 'unmet'}>
                      <span className="prereq-static">
                        {met ? '✓' : '✗'} {p?.name ?? id}
                        <span className="prereq-bridge" title="Built on the campus map, not developed here">build</span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={id} className={met ? 'met' : 'unmet'}>
                    <button type="button" className="prereq-link" onClick={() => onGoToCourse(id)}>
                      {met ? '✓' : '✗'} {p.name}
                      {bridge && <span className="prereq-bridge" title="A prerequisite from another program">cross-listed</span>}
                      <span className="prereq-go" aria-hidden="true">→</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {t.requiresFaculty && (
          <section className="course-drawer-section">
            <h4>{offered ? 'Instructor' : 'Choose an instructor'}</h4>

            {unstaffed && (
              <p className="course-drawer-warning">
                This course has no instructor and is not being taught. Assign someone to restore it.
              </p>
            )}

            {/* CASE 1 & 2: somebody can take it. */}
            {eligible.length > 0 && (
              <>
                <div className="instructor-options">
                  {eligible.map((f) => (
                    <InstructorOption
                      key={f.id}
                      s={s}
                      f={f}
                      selected={chosen === f.id}
                      projectedFor={t}
                      onPick={() => setPicked(f.id)}
                    />
                  ))}
                </div>

                {state === 'available' && (
                  <button type="button" className="course-drawer-action" disabled={!chosen || !canStartDevelopment(s, t, chosen)} onClick={develop}>
                    {chosen
                      ? `Develop with ${eligible.find((f) => f.id === chosen)?.name ?? 'selected faculty'}`
                      : 'Develop'}
                  </button>
                )}
                {offered && (
                  <button type="button" className="course-drawer-action" disabled={!chosen || chosen === instructor?.id} onClick={reassign}>
                    {chosen && chosen !== instructor?.id ? 'Move this course to them' : 'Currently assigned'}
                  </button>
                )}
              </>
            )}

            {/* CASE 3: the department exists but everyone is full. Naming
                who, and how loaded, is what turns a refusal into a choice
                between reassigning and hiring. */}
            {eligible.length === 0 && inField.length > 0 && (
              <>
                <p className="course-drawer-note">
                  Every {t.requiresFaculty} professor is at capacity. Free a slot by moving one of their
                  courses, or appoint someone new.
                </p>
                <div className="instructor-options">
                  {inField.map((f) => <InstructorOption key={f.id} s={s} f={f} selected={false} disabled />)}
                </div>
              </>
            )}

            {/* CASE 4: nobody in the department at all. The hire happens
                here rather than in a separate explanation of the problem. */}
            {eligible.length === 0 && inField.length === 0 && (
              <p className="course-drawer-note">
                The university has no {t.requiresFaculty} faculty. Appoint someone to open this course.
              </p>
            )}

            {/* HIRING FROM THE COURSE. When nobody can take it the market is
                the whole answer; when somebody can, it is one click away
                behind "appoint someone new" — the player who needs more
                faculty for this course hires from this course. */}
            {eligible.length === 0
              ? (
                <>
                  <MarketInField s={s} act={act} field={t.requiresFaculty} projectedFor={t} />
                  {onOpenFaculty && (
                    <button type="button" className="course-drawer-door" onClick={() => onOpenFaculty(t.requiresFaculty!)}>
                      Open the {t.requiresFaculty} department →
                    </button>
                  )}
                </>
              )
              : (
                <details className="course-drawer-more">
                  <summary>Appoint someone new in {t.requiresFaculty}</summary>
                  <MarketInField s={s} act={act} field={t.requiresFaculty} projectedFor={t} />
                </details>
              )}
          </section>
        )}

        {state === 'blocked' && shortfall > 0 && (
          <p className="course-drawer-warning">${Math.ceil(shortfall).toLocaleString()} short of the development cost.</p>
        )}
        {state === 'locked' && (
          <p className="course-drawer-note quiet">Locked until its prerequisites are complete.</p>
        )}
        {(() => {
          const programId = programOfCourse(t.id);
          return programId !== undefined && isInTransit(s, programId)
            ? <p className="course-drawer-warning">Its program is moving halls: not taught, not advancing, and counting toward nothing until it settles.</p>
            : null;
        })()}
      </div>
    </aside>
  );
}

// =====================================================================
// THE ROWS. One per program, grouped under its school.
//
// A row is nine cells in tier order — the entry course, the tier-2
// quartet, the tier-3 quartet — with a rule between the bands standing in
// for the sixteen prereq lines a major would otherwise need. A course
// this tab has not revealed (a capstone before the program is
// established) is drawn as an EMPTY cell rather than omitted, so every
// row is the same width, position carries tier, and the eye can compare
// programs down the column. Rows compress to fit; the container scrolls
// sideways only as a narrow-viewport fallback.
// =====================================================================
// =====================================================================
// THE ROW'S OWN ACTION. Every course used to cost the same three clicks
// through the same form whether or not there was anything to decide, and
// in play the strongest free teacher took the whole quartet four times
// over. So the row leads with what its next start would be — the course,
// the strongest eligible teacher, the grade they would earn, the cost and
// the weeks — and a Develop button that does exactly that. "choose…" opens
// the drawer for the case where the default is wrong. Beside it, what the
// start is worth: how many courses to the next milestone, and the seats
// it adds. Meaning comes from visible consequence, not from the form.
//
// AND THE QUARTET. When the next course's tier band has several courses
// ready and the same teacher has the slots for them, one more button
// starts the lot with them — with the grades previewed as their load
// climbs, which is where "one person on all four" stops being obviously
// right and the interesting choice surfaces on its own. Each start is its
// own START_DEVELOPMENT through the reducer's own gate, applied in
// sequence, so a start that stops being legal part way is refused rather
// than forced.
// =====================================================================
function RowAction({ s, act, program, progress, lookup, loads, onSelect }: {
  s: GameState; act: (a: Action) => void; program: ProgramInfo; progress: ProgramProgress;
  lookup: Map<string, Buildable>; loads: FacultyLoads; onSelect: (id: string) => void;
}) {
  const next = progress.next;
  const worth = (
    <span className="row-action-worth">
      {milestoneLine(progress)}
      {progress.toMilestone > 0 && <> · +{SEATS_PER_COURSE} seats</>}
    </span>
  );

  if (progress.inTransit) {
    return <p className="row-action"><span className="row-action-note">Moving halls — nothing can start until it settles.</span></p>;
  }
  if (!next) {
    const developing = program.courseIds.map((id) => lookup.get(id)).filter((t) => t?.status === 'developing') as Buildable[];
    const soonest = developing.length > 0 ? Math.min(...developing.map((t) => s.developing[t.id] ?? 0)) : null;
    const needs = progress.waiting ? unmetPrereqNames(s, progress.waiting, lookup) : [];
    return (
      <p className="row-action">
        <span className="row-action-note">
          {soonest !== null && `${developing.length} in development · next finishes in ${soonest} wk. `}
          {progress.waiting
            ? <><span className="cell-code">{progress.waiting.name.split(' · ')[0]}</span> needs {needs.length > 0 ? needs.join(', ') : 'its prerequisites'}.</>
            : soonest === null ? 'Every course is developed.' : null}
        </span>
        {worth}
      </p>
    );
  }

  const [code, titleFromName] = next.name.split(' · ');
  const eligible = eligibleInstructors(s, next);
  const best = eligible[0];
  const shortfall = next.cost - s.finance.cash;

  if (!best) {
    const gate = next.requiresFaculty ? facultyGate(s, next.requiresFaculty) : 'open';
    return (
      <p className="row-action">
        <span className="row-action-note">
          Next <span className="cell-code">{code}</span> {titleFromName ?? code} — no free {next.requiresFaculty} slot
          {gate === 'hireable' ? ', and a candidate is listed.' : ', and nobody is on the market.'}
        </span>
        <button type="button" className="row-action-secondary" onClick={() => onSelect(next.id)}>
          {gate === 'hireable' ? 'Appoint…' : 'Open…'}
        </button>
        {worth}
      </p>
    );
  }

  const projected = projectedQuality(s, next, best, loads);
  const canStart = canStartDevelopment(s, next, best.id);

  // The quartet: the other ready courses in the same tier band, in order,
  // as many as this teacher has slots for and the school has cash for.
  const bands = tierBands(program);
  const band = bands ? [bands.tier2, bands.tier3].find((ids) => ids.includes(next.id)) : undefined;
  const ready = (band ?? []).map((id) => lookup.get(id)).filter((t): t is Buildable => !!t && t.status === 'available');
  const free = Math.max(0, effectiveCourseSlots(s, best) - (loads.get(best.id) ?? 0));
  const batch = ready.slice(0, free);
  const batchCost = batch.reduce((sum, t) => sum + t.cost, 0);
  const batchOk = batch.length >= 2 && batchCost <= s.finance.cash;
  const batchGrades = batch.map((t, i) => qualityOf({
    teaching: best.teaching, acclaim: best.acclaim,
    load: (loads.get(best.id) ?? 0) + i + 1, slots: best.courseSlots, tier: tierOf(t.id),
  }).grade);

  return (
    <p className="row-action">
      <button
        type="button"
        className="row-action-develop"
        disabled={!canStart}
        title={canStart
          ? `Start ${next.name} with ${best.name}: ${next.duration} weeks, $${next.cost.toLocaleString()}`
          : shortfall > 0 ? `$${Math.ceil(shortfall).toLocaleString()} short of the development cost` : 'Cannot start this course right now'}
        onClick={() => act({ type: 'START_DEVELOPMENT', nodeId: next.id, facultyId: best.id })}
      >
        Develop <span className="cell-code">{code}</span> with {surnameOf(best.name)}
        <GradeChip grade={projected.grade} title={`${next.name} would be graded ${projected.grade} with ${best.name}`} />
      </button>
      <span className="row-action-cost">{moneyShort(next.cost)} · {next.duration} wk{shortfall > 0 ? ` · ${moneyShort(shortfall)} short` : ''}</span>
      <button type="button" className="row-action-secondary" onClick={() => onSelect(next.id)} title="Choose a different instructor, or read the course">choose…</button>
      {batchOk && (
        <button
          type="button"
          className="row-action-secondary batch"
          title={`Start all ${batch.length} with ${best.name}: $${batchCost.toLocaleString()} — grades ${batchGrades.join(' ')} as their load climbs`}
          onClick={() => { for (const t of batch) act({ type: 'START_DEVELOPMENT', nodeId: t.id, facultyId: best.id }); }}
        >
          all {batch.length} with {surnameOf(best.name)} → {batchGrades.join(' ')}
        </button>
      )}
      {worth}
    </p>
  );
}

function ProgramRowView(
  { s, act, row, lookup, selectedId, onSelect, loads, dnd }:
  {
    s: GameState; act: (a: Action) => void; row: ProgramRow; lookup: Map<string, Buildable>;
    selectedId: string | null; onSelect: (id: string) => void; loads: FacultyLoads; dnd: DragHandlers;
  },
) {
  const { program } = row;
  const avg = averageCourseQuality(s, program.courseIds, loads);
  const progress = programProgress(s, program, lookup);
  const graduate = program.kind === 'graduate';
  const grad = graduate ? graduatePrograms().find((g) => g.id === program.id) : undefined;
  const hallId = hallOfCourse(s, program.entryCourseId);
  const hall = hallId ? lookup.get(hallId) : undefined;

  return (
    <section className={`program-row${graduate ? ' graduate' : ''}`} data-program={program.id}>
      <header className="program-row-head">
        <h4>{program.name}</h4>
        {grad && <span className="subgroup-degree">{grad.degree}</span>}
        {avg !== null && <GradeChip grade={gradeFor(avg)} title={`${program.name} averages ${Math.round(avg)} / 100`} />}
        {hall && <span className="program-row-hall" title="Where it is housed">{hallDisplayName(s, hall)}</span>}
        <span className="lane-count">{progress.done} / {progress.total}</span>
      </header>
      <RowAction s={s} act={act} program={program} progress={progress} lookup={lookup} loads={loads} onSelect={onSelect} />
      <div className={`program-row-cells${graduate ? ' graduate' : ''}`} style={graduate ? { gridTemplateColumns: `repeat(${program.courseIds.length}, minmax(0, 1fr))` } : undefined}>
        {program.courseIds.map((id, i) => {
          const t = lookup.get(id);
          // The rules between the tier bands are their own grid tracks (see
          // .program-row-cells), so every one of the nine cells is exactly
          // the same width — a margin inside a cell would have narrowed it.
          const rule = !graduate && (i === 1 || i === 5) ? <span key={`rule-${i}`} className="tier-rule" aria-hidden="true" /> : null;
          const cell = !t || !row.revealed.has(id)
            ? <span key={id} className="course-cell placeholder" aria-hidden="true" />
            : <CourseCell key={id} s={s} t={t} selected={selectedId === id} onSelect={onSelect} loads={loads} dnd={dnd} />;
          return rule ? [rule, cell] : cell;
        })}
      </div>
    </section>
  );
}

// A school's group: its heading — the name once founded, the colour and
// mark alone before, which is the one place the game deliberately breaks
// the parchment/navy/brass register (see data/schoolPalette.ts) — its
// grade, and its rows.
function SchoolGroupView(
  { s, act, group, lookup, selectedId, onSelect, loads, dnd }:
  {
    s: GameState; act: (a: Action) => void; group: SchoolGroup; lookup: Map<string, Buildable>;
    selectedId: string | null; onSelect: (id: string) => void; loads: FacultyLoads; dnd: DragHandlers;
  },
) {
  const ids = group.rows.flatMap((row) => row.program.courseIds);
  const avg = averageCourseQuality(s, ids, loads);
  const done = completion(s, ids);
  return (
    <section
      className={`school-group${group.founded ? ' founded' : ' unfounded'}`}
      data-school={group.key}
      style={{ ['--school-hue' as string]: group.mark.hue }}
    >
      <header className="school-group-head">
        <span className="school-group-mark" aria-hidden="true">{group.mark.motif}</span>
        <h3>{group.founded ? group.heading : <span className="school-group-unnamed">{group.rows.length} {group.rows.length === 1 ? 'program' : 'programs'} of a school not yet founded</span>}</h3>
        {avg !== null && <GradeChip grade={gradeFor(avg)} title={`Averages ${Math.round(avg)} / 100 across its developed courses`} />}
        <span className="lane-count">{done.done} / {done.total}</span>
      </header>
      <div className="program-rows">
        {group.rows.map((row) => (
          <ProgramRowView key={row.program.id} s={s} act={act} row={row} lookup={lookup} selectedId={selectedId} onSelect={onSelect} loads={loads} dnd={dnd} />
        ))}
      </div>
    </section>
  );
}

// =====================================================================
// FINDING THINGS IN 421 COURSES.
//
// Progressive discovery already does the heavy lifting — a player only
// ever sees what they have unlocked — but a mature catalogue is still
// hundreds of cards across eight schools, and the two questions that get
// hard are "where is X" and "what needs my attention".
//
// Both are answered by the same mechanism: a filter turns the map into a
// WORKLIST — one flat, cross-school list of exactly what matched. That is
// deliberately not a dimming pass over the lanes. "Show me everything at D
// or below" is a to-do list, and a to-do list spread across eight screens
// with the irrelevant items greyed out is not one. When nothing is
// filtered, the map is the map.
// =====================================================================

type StatusFilter = 'all' | 'available' | 'developing' | 'done' | 'unstaffed';
type GradeFilter = 'all' | 'weak';

const WEAK_GRADES = new Set<Grade>(['D', 'F']);

interface Filters {
  query: string;
  status: StatusFilter;
  grade: GradeFilter;
  // A department, set from the strip's "wall" item: every revealed course
  // still ahead of the player that asks for this field — the courses a
  // short department is holding up.
  field: string | null;
}

const NO_FILTERS: Filters = { query: '', status: 'all', grade: 'all', field: null };

function filtersActive(f: Filters): boolean {
  return f.query.trim() !== '' || f.status !== 'all' || f.grade !== 'all' || f.field !== null;
}

function matchesFilters(s: GameState, t: Buildable, f: Filters, loads: FacultyLoads): boolean {
  const query = f.query.trim().toLowerCase();
  if (query !== '' && !t.name.toLowerCase().includes(query)) return false;

  if (f.field !== null && (t.requiresFaculty !== f.field || t.status !== 'available')) return false;

  if (f.status !== 'all') {
    if (f.status === 'unstaffed') {
      if (!isUnstaffed(s, t)) return false;
    } else if (cellState(s, t) !== f.status) return false;
  }

  if (f.grade === 'weak') {
    const q = courseQuality(s, t, loads);
    // An unstaffed course belongs in the improvement worklist too: it is
    // the most broken thing a course can be, and it has no grade to match
    // on, so it is admitted explicitly rather than filtered out for
    // lacking the very letter that would qualify it.
    if (!q) return isUnstaffed(s, t);
    if (!WEAK_GRADES.has(q.grade)) return false;
  }
  return true;
}

function FilterBar(
  { filters, onChange, resultCount }:
  { filters: Filters; onChange: (f: Filters) => void; resultCount: number | null },
) {
  return (
    <div className="curriculum-filters">
      <input
        id="curriculum-search"
        type="search"
        className="curriculum-search"
        placeholder="Search courses…"
        value={filters.query}
        onChange={(e) => onChange({ ...filters, query: e.target.value })}
      />
      <select
        id="curriculum-status"
        className="curriculum-select"
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value as StatusFilter })}
      >
        <option value="all">Any status</option>
        <option value="available">Ready to start</option>
        <option value="developing">In development</option>
        <option value="done">Developed</option>
        <option value="unstaffed">Unstaffed</option>
      </select>
      <button
        type="button"
        className={`curriculum-chip${filters.grade === 'weak' ? ' on' : ''}`}
        aria-pressed={filters.grade === 'weak'}
        onClick={() => onChange({ ...filters, grade: filters.grade === 'weak' ? 'all' : 'weak' })}
        title="Every developed course graded D or F, plus any left unstaffed"
      >
        Needs attention
      </button>
      {filters.field !== null && (
        <button
          type="button"
          className="curriculum-chip on"
          onClick={() => onChange({ ...filters, field: null })}
          title="Courses waiting on this department — click to clear"
        >
          waiting on {filters.field} ×
        </button>
      )}
      {resultCount !== null && (
        <span className="curriculum-result-count">
          {resultCount} {resultCount === 1 ? 'course' : 'courses'}
        </span>
      )}
      {filtersActive(filters) && (
        <button type="button" className="curriculum-chip clear" onClick={() => onChange(NO_FILTERS)}>
          Clear
        </button>
      )}
    </div>
  );
}

// =====================================================================
// NEXT UP. The strip at the head of the tab that answers "what should I
// do now, and why" — the one question forty-two rows of state cannot.
// Four readings, each a door: the programs on offer and where a slot is
// free for them; the programs one or two courses from a milestone; how
// many courses are ready and affordable this week; and the department
// that is the wall. Nothing here is new state — every item is read off
// the same functions the rows and the hall panel use — and an empty
// reading is left out rather than shown empty, so in year one the strip
// says nothing at all.
// =====================================================================
const NEAR_MILESTONE = 2;

function NextUp({ s, groups, lookup, onGoToProgram, onFilter, onInspectHall, onOpenFaculty }: {
  s: GameState; groups: SchoolGroup[]; lookup: Map<string, Buildable>;
  onGoToProgram: (id: string) => void;
  onFilter: (f: Partial<Filters>) => void;
  onInspectHall?: (hallId: string) => void;
  onOpenFaculty?: (field: string) => void;
}) {
  // THE OFFER. Global — the same three at any free slot — so it is stated
  // once, with every hall that has room. "Found in…" hands the hall to the
  // map, whose panel is where the founding happens (the decision is what
  // goes in that building, and it needs the building on screen).
  const offers = s.programOffers.map((id) => programById(id)).filter((p): p is ProgramInfo => p !== undefined);
  const hallsWithRoom = Object.entries(s.halls)
    .map(([hallId, slots]) => ({ hall: lookup.get(hallId), free: slots.filter((slot) => slot.programId === null).length }))
    .filter((h): h is { hall: Buildable; free: number } => !!h.hall && h.free > 0);

  // NEAR A MILESTONE. Programs a course or two from Established or
  // Distinguished, nearest first — the starts worth making before any other.
  const near = groups
    .flatMap((g) => g.rows.map((row) => ({ row, progress: programProgress(s, row.program, lookup) })))
    .filter(({ progress }) => progress.toMilestone > 0 && progress.toMilestone <= NEAR_MILESTONE && !progress.inTransit && (progress.next || progress.developing > 0))
    .sort((a, b) => a.progress.toMilestone - b.progress.toMilestone);

  // READY NOW. Every revealed course that could start this week — cash and
  // a free slot both in hand — and what it would cost to start them all.
  const revealed = visibleCourseIds(s).map((id) => lookup.get(id)).filter((t): t is Buildable => !!t && t.status === 'available');
  const ready = revealed.filter((t) => canStartDevelopment(s, t));
  const readyCost = ready.reduce((sum, t) => sum + t.cost, 0);

  // THE WALL. Departments with a course revealed and no slot to start it
  // in, by how many courses each one is holding up.
  const wallCounts = new Map<string, number>();
  for (const field of neededFacultyFields(s)) {
    wallCounts.set(field, revealed.filter((t) => t.requiresFaculty === field).length);
  }
  const wall = [...wallCounts.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

  if (offers.length === 0 && near.length === 0 && ready.length === 0 && wall.length === 0) return null;

  return (
    <div className="next-up" aria-label="What next">
      {offers.length > 0 && (
        <div className="next-up-item offers">
          <span className="next-up-label">On offer</span>
          <span className="next-up-body">
            {offers.map((p, i) => {
              const mark = schoolMark(p.school);
              const entry = lookup.get(p.entryCourseId);
              return (
                <span key={p.id} className="next-up-offer" style={{ ['--school-hue' as string]: mark.hue }} title={`${p.name} — ${entry ? `$${entry.cost.toLocaleString()} · ${entry.requiresFaculty ?? ''}` : ''}`}>
                  {i > 0 && <span className="next-up-sep"> · </span>}
                  <span className="next-up-mark" aria-hidden="true">{mark.motif}</span> {p.name}
                </span>
              );
            })}
          </span>
          <span className="next-up-doors">
            {hallsWithRoom.length === 0
              ? <span className="next-up-note">no free slot — site an academic hall</span>
              : hallsWithRoom.map(({ hall, free }) => (
                <button
                  key={hall.id}
                  type="button"
                  className="next-up-door"
                  disabled={!onInspectHall}
                  onClick={() => onInspectHall?.(hall.id)}
                  title={`Open ${hallDisplayName(s, hall)} on the map and found a program in one of its ${free} free slot${free === 1 ? '' : 's'}`}
                >
                  Found in {hallDisplayName(s, hall)} · {free} free
                </button>
              ))}
          </span>
        </div>
      )}
      {near.length > 0 && (
        <div className="next-up-item">
          <span className="next-up-label">Near a milestone</span>
          <span className="next-up-doors">
            {near.slice(0, 5).map(({ row, progress }) => (
              <button key={row.program.id} type="button" className="next-up-door" onClick={() => onGoToProgram(row.program.id)} style={{ ['--school-hue' as string]: schoolMark(row.program.school).hue }}>
                <span className="next-up-mark" aria-hidden="true">{schoolMark(row.program.school).motif}</span> {row.program.name} · {milestoneLine(progress)}
              </button>
            ))}
            {near.length > 5 && <span className="next-up-note">+{near.length - 5} more</span>}
          </span>
        </div>
      )}
      {ready.length > 0 && (
        <div className="next-up-item">
          <span className="next-up-label">Ready now</span>
          <span className="next-up-doors">
            <button type="button" className="next-up-door" onClick={() => onFilter({ status: 'available', field: null })} title="Every course that could start this week: a free slot and the cash for it">
              {ready.length} {ready.length === 1 ? 'course' : 'courses'} · {moneyShort(readyCost)} to start them all
            </button>
            {revealed.length > ready.length && (
              <span className="next-up-note">{revealed.length - ready.length} more revealed, short of cash or a slot</span>
            )}
          </span>
        </div>
      )}
      {wall.length > 0 && (
        <div className="next-up-item wall">
          <span className="next-up-label">The wall</span>
          <span className="next-up-doors">
            {wall.slice(0, 3).map(([field, n]) => {
              const gate = facultyGate(s, field);
              return (
                <span key={field} className="next-up-pair">
                  <button type="button" className="next-up-door" onClick={() => onFilter({ field, status: 'all' })} title={`${n} revealed ${n === 1 ? 'course is' : 'courses are'} waiting on a free ${field} slot${gate === 'hireable' ? ' — a candidate is listed' : ' — nobody on the market'}`}>
                    {field} short · {n} waiting{gate === 'hireable' ? ' · candidate listed' : ''}
                  </button>
                  {onOpenFaculty && (
                    <button type="button" className="next-up-door quiet" onClick={() => onOpenFaculty(field)} title={`Open the Faculty board on ${field}: its people, the market, a search`}>
                      {gate === 'hireable' ? 'Appoint →' : 'Department →'}
                    </button>
                  )}
                </span>
              );
            })}
          </span>
        </div>
      )}
    </div>
  );
}

// Completion of an arbitrary set of course ids. Used for the catalogue as
// a whole and for one school's own curriculum. Exported so anything else
// showing a school's completion (the campus map's building info popover)
// computes it the exact same way this tab's own rings do, rather than
// re-deriving the done/total logic a second time.
export function completion(s: GameState, ids: string[]): { done: number; total: number; fraction: number } {
  const done = ids.filter((id) => s.tech.find((t) => t.id === id)?.status === 'done').length;
  return { done, total: ids.length, fraction: ids.length > 0 ? done / ids.length : 0 };
}

export default function CurriculumTab(
  { s, act, target, onTargetConsumed, onInspectHall, onOpenFaculty }:
  {
    s: GameState; act: (a: Action) => void;
    // Somewhere to be on arrival, when the tab was opened FROM something:
    // a school's name (Founders Hall's panel on the map), or "program:<id>"
    // for one program's row (a hall panel's program tile — see
    // BuildingInfoPanel.tsx). Consumed on arrival and cleared by the
    // caller, so clicking the same hall twice arrives twice.
    target?: string;
    onTargetConsumed?: () => void;
    // The way back to the map: closes this tab and opens a hall's panel,
    // which is where a program on offer is founded (see NextUp).
    onInspectHall?: (hallId: string) => void;
    // The way to a department: the Faculty board opened on it, for the
    // wall's items and a drawer's dead end.
    onOpenFaculty?: (field: string) => void;
  },
) {
  const revealedGrad = revealedGraduatePrograms(s);
  // The headline ring counts the undergraduate catalogue plus whatever
  // graduate work has been revealed — never the whole seed. A "0 / 421"
  // in year one would announce that thirty-seven courses exist somewhere
  // the player has no way to see, which is precisely what progressive
  // discovery is for.
  const courses = s.tech.filter(
    (t) => t.kind === 'course' && (!t.graduateProgram || revealedGrad.has(t.graduateProgram)),
  );
  const doneCourses = courses.filter((t) => t.status === 'done').length;
  const catalogFraction = courses.length > 0 ? doneCourses / courses.length : 0;
  const catalogPct = Math.round(catalogFraction * 100);

  const lookup = new Map(s.tech.map((t) => [t.id, t]));
  // Built ONCE per render and threaded to every cell, every heading and
  // the drawer. Grading is cheap; counting a professor's load is not (see
  // facultyLoads), and a screen of four hundred cells each counting it for
  // itself is the same quadratic that would stall the weekly tick.
  const loads = facultyLoads(s);
  const sections = buildSections(s, revealedGrad);
  const groups = schoolGroups(s, sections);

  // The course drawer rides on top of the rows, so selecting a course
  // never costs the player their place.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  // THE DRAG. Which chip is in the air and which cell it is over — the
  // whole of the drag-and-drop's state, held here so both the source and
  // the target cell can draw the same preview from it. A drop dispatches
  // SWAP_COURSE_FACULTY, whose own gate decides; an illegal drop never
  // reaches it because the cell refuses the drop event.
  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dnd: DragHandlers = {
    drag,
    over,
    onDragStart: (courseId, facultyId) => { setDrag({ courseId, facultyId }); setOver(null); },
    onDragOver: (courseId) => setOver(courseId),
    onDragEnd: () => { setDrag(null); setOver(null); },
    onDrop: (courseId) => {
      if (drag && canSwapInstructors(s, drag.courseId, courseId)) act({ type: 'SWAP_COURSE_FACULTY', courseA: drag.courseId, courseB: courseId });
      setDrag(null); setOver(null);
    },
  };

  const selected = selectedId ? lookup.get(selectedId) ?? null : null;
  const onSelect = useCallback((id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  // Jumping to a course from anywhere: a search result, or a bridge badge
  // naming a prerequisite in another school. This is the single most
  // useful thing the map does — the prerequisite you care about is almost
  // always one you cannot currently see, and a line drawn to an offscreen
  // node is worth nothing next to actually going there.
  const goToCourse = useCallback((id: string) => {
    setSelectedId(id);
    setFilters(NO_FILTERS);
    // Every row is on one screen now, so "going there" is scrolling there.
    window.setTimeout(() => document.getElementById(`course-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
  }, []);

  // Arriving with somewhere to be: a school's group or a program's row
  // scrolled into view, no course selected, no filters left over from last
  // time — the same act of navigation goToCourse performs, one level up.
  const goToProgram = useCallback((id: string) => {
    setSelectedId(null);
    setFilters(NO_FILTERS);
    window.setTimeout(() => document.querySelector(`[data-program="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
  }, []);
  useEffect(() => {
    if (!target) return;
    if (target.startsWith('program:')) {
      goToProgram(target.slice('program:'.length));
    } else if (target.startsWith('field:')) {
      // From the Faculty board: the courses waiting on one department.
      setSelectedId(null);
      setFilters({ ...NO_FILTERS, field: target.slice('field:'.length) });
    } else if (target === 'unstaffed') {
      setSelectedId(null);
      setFilters({ ...NO_FILTERS, status: 'unstaffed' });
    } else {
      setSelectedId(null);
      setFilters(NO_FILTERS);
      window.setTimeout(() => document.querySelector(`[data-school="${CSS.escape(target)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
    }
    onTargetConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const unseenIds = visibleCourseIds(s).filter((id) => !s.seen.courseIds[id]);
  const unseenKey = unseenIds.join('|');
  useEffect(() => {
    if (unseenIds.length > 0) act({ type: 'MARK_SEEN', kind: 'course', ids: unseenIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseenKey]);

  const filtering = filtersActive(filters);
  const matches = filtering
    ? visibleCourseIds(s)
      .map((id) => lookup.get(id))
      .filter((t): t is Buildable => !!t && matchesFilters(s, t, filters, loads))
    : [];

  return (
    <div className={`tab-content curriculum-layout${selected ? ' with-drawer' : ''}`}>
      <section className="panel curriculum-panel">
        <div className="panel-head">
          <span className="panel-head-title">
            {/* A filter searches the WHOLE catalogue, so while one is on
                the crumb says so. Otherwise the title is the title: every
                row is on this one screen, and there is no level to be
                inside of. */}
            {filtering ? (
              <h2 className="curriculum-crumbs">
                <button type="button" className="crumb" onClick={() => setFilters(NO_FILTERS)}>The Curriculum</button>
                <span className="crumb-sep" aria-hidden="true">›</span>
                <span className="crumb-current">Matching courses</span>
              </h2>
            ) : (
              <h2>The Curriculum</h2>
            )}
          </span>
          <span className="panel-head-figure">
            <span className="progress-figure">
              <ProgressRing
                fraction={catalogFraction}
                size={CATALOG_RING_SIZE}
                center={`${catalogPct}%`}
                title={`${doneCourses} of ${courses.length} courses developed`}
              />
              <span className="stat">{doneCourses} / {courses.length}<br />developed</span>
            </span>
            <AggregateGrade s={s} ids={courses.map((c) => c.id)} label="The catalogue" loads={loads} />
            <HelpHint
              align="end"
              text='One row per program, grouped by school — a school is named once six of its programs share a hall. Each row leads with its next start: the course, the strongest free teacher and the grade they would earn; Develop takes it, "choose…" opens the course to pick somebody else. Programs are founded from an academic hall on the map — the strip above says which halls have room. Drag a professor onto another course in the same department to swap them, and both grades preview while you hold.'
            />
          </span>
        </div>

        {!filtering && (
          <NextUp
            s={s}
            groups={groups}
            lookup={lookup}
            onGoToProgram={goToProgram}
            onFilter={(f) => setFilters({ ...NO_FILTERS, ...f })}
            onInspectHall={onInspectHall}
            onOpenFaculty={onOpenFaculty}
          />
        )}

        <FilterBar filters={filters} onChange={setFilters} resultCount={filtering ? matches.length : null} />

        {s.finance.cash < 0 && (
          <p className="stall-note">Cash is negative — the school is running an operating deficit, so nothing can be started until the balance recovers.</p>
        )}

        <div className="curriculum-scroll">
          {/* A filter replaces the map with its results, across every
              school at once (see the worklist note above). */}
          {filtering ? (
            matches.length === 0 ? (
              <p className="empty-note">Nothing matches those filters.</p>
            ) : (
              <div className="worklist">
                {matches.map((t) => {
                  const home = courseSchools().get(t.id);
                  return (
                    <div key={t.id} className="worklist-row">
                      <CourseCell s={s} t={t} selected={selectedId === t.id} onSelect={onSelect} loads={loads} />
                      <span className="worklist-where">{home?.school ?? ''}</span>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            groups.map((group) => (
              <SchoolGroupView key={group.key} s={s} act={act} group={group} lookup={lookup} selectedId={selectedId} onSelect={onSelect} loads={loads} dnd={dnd} />
            ))
          )}
        </div>
      </section>
      {selected && (
        <CourseDrawer
          s={s}
          act={act}
          t={selected}
          lookup={lookup}
          onClose={() => setSelectedId(null)}
          loads={loads}
          onGoToCourse={goToCourse}
          onOpenFaculty={onOpenFaculty}
        />
      )}
    </div>
  );
}
