import { useState } from 'react';
import {
  ACADEMIC_WORDS,
  courseListings,
  PROGRAMS,
  SCHOOLS,
  tierById,
  type ProgramDef,
  type SchoolDef,
} from '../content/schools.ts';
import { buildingById } from '../content/buildings.ts';
import { FACULTY_READINGS, FACULTY_WORDS, rankById, withArticle } from '../content/faculty.ts';
import { fillWords } from '../content/people.ts';
import {
  advancementCost,
  advancementYears,
  advanceVerdict,
  affordableFinancing,
  annualProgramCost,
  annualProgramCosts,
  canPay,
  adjunctFor,
  campusCapacity,
  canApply,
  facultyOf,
  foundedSchool,
  formatMoney,
  frozen,
  hallName,
  hallsAvailable,
  hallsFor,
  neglected,
  nextTier,
  openProgram,
  programCrowding,
  programSeats,
  enrolled,
  programOpeningCost,
  programQuality,
  schoolFoundingCost,
  signatureRoom,
  signatures,
  staffingNeed,
  type Financing,
  type GameState,
  type OpenProgram,
} from '../sim/index.ts';
import Figure from './Figure.tsx';
import { DECAY_AFTER_YEARS, SIGNATURE_LIMIT } from '../tuning.ts';

// THE CURRICULUM SCREEN (DD §7.1–§7.2), in v1's visual language: a group
// per school under its hue and mark, a row per program with its courses
// as cells — the levels its tier has opened filled in the school's colour,
// the rest a wall of empty slots — and, for a school not yet founded, the
// founding card. Programs are the unit; courses are generated flavour.

function ProgramRow({
  def,
  program,
  state,
  financing,
  onClose,
  onAdvance,
  onSignature,
  onAdjunct,
}: {
  def: ProgramDef;
  program: OpenProgram;
  state: GameState;
  financing: Financing;
  onClose: () => void;
  onAdvance: (payWith: Financing) => void;
  onSignature: (signature: boolean) => void;
  onAdjunct: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const tier = tierById(program.tier);
  const listings = courseListings(def);
  const staff = facultyOf(state, program.programId);
  const need = staffingNeed(program);
  const quality = programQuality(state, program);
  const adjunct = adjunctFor(state, program.programId);
  const adjunctVerdict = canApply(state, { type: 'hireAdjunct', programId: program.programId });
  const to = nextTier(program.tier);
  const toTier = to ? tierById(to) : null;
  const verdict = advanceVerdict(state, program.programId);
  const iced = frozen(state);
  const cost = advancementCost(program);
  const payWith = canPay(state, cost, financing) ? financing : affordableFinancing(state, cost);
  const week = state.clock.absoluteWeek;
  const a = program.advancing;
  const leadName = (t: string) => {
    const rank = tierById(t as 'founded').leadRank;
    return rank ? withArticle(rankById(rank).name) : 'a senior hire';
  };
  const advanceLine = a
    ? a.stalled || a.completesWeek <= week
      ? fillWords(ACADEMIC_WORDS.lines.stalled, {
          tier: tierById(a.to).name,
          rank: leadName(a.to),
        })
      : fillWords(ACADEMIC_WORDS.lines.advancing, {
          tier: tierById(a.to).name,
          weeks: a.completesWeek - week,
        })
    : null;
  return (
    <div className="program-row">
      <div className="program-row-head">
        <h4>{def.name}</h4>
        <span className="program-row-code">{def.code}</span>
        <span className="tier-chip figure" tabIndex={0}>
          {tier.name}
          <span className="figure-hint" role="tooltip">
            {ACADEMIC_WORDS.readings.tier}
          </span>
        </span>
        <button
          type="button"
          className={`signature-toggle figure ${program.signature ? 'on' : ''}`}
          disabled={!program.signature && !signatureRoom(state)}
          aria-pressed={program.signature}
          onClick={() => onSignature(!program.signature)}
        >
          {program.signature
            ? `★ ${ACADEMIC_WORDS.lines.signature}`
            : signatureRoom(state)
              ? `☆ ${ACADEMIC_WORDS.lines.makeSignature}`
              : `☆ ${ACADEMIC_WORDS.lines.signaturesFull}`}
          <span className="figure-hint" role="tooltip">
            {ACADEMIC_WORDS.readings.signatures}
          </span>
        </button>
        {/* It printed "2 / 6" beside every program, which is two numbers
            and no noun (Phase 21F). */}
        <span className="lane-count">
          {fillWords(ACADEMIC_WORDS.lines.coursesOffered, {
            offered: listings.filter((c) => c.level <= tier.levels).length,
            total: listings.length,
          })}
        </span>
      </div>
      <p className="program-row-blurb">{def.blurb}</p>
      <div className="program-row-cells">
        {listings.map((c, i) => {
          const offered = c.level <= tier.levels;
          const rule = i > 0 && i % 2 === 0;
          return (
            <span key={c.code} className={rule ? 'with-rule' : ''}>
              {rule && <span className="tier-rule" aria-hidden="true" />}
              <div className={`course-cell ${offered ? 'done' : 'placeholder'}`}>
                <span className="cell-code">{c.code}</span>
                <span className="cell-title">
                  {offered ? c.title : tierById(c.level === 2 ? 'established' : 'renowned').name}
                </span>
              </div>
            </span>
          );
        })}
      </div>
      <p className={`program-row-faculty ${staff.length === 0 ? 'bad' : ''}`}>
        {staff.length === 0
          ? FACULTY_WORDS.nobodyTeaches
          : fillWords(FACULTY_WORDS.taughtBy, { names: staff.map((f) => f.name).join(', ') })}
      </p>
      {advanceLine && (
        <p className={`program-row-advancing ${a?.stalled ? 'bad' : ''}`}>{advanceLine}</p>
      )}
      {!a && program.tier !== 'founded' && neglected(state, program) && (
        <p className="program-row-advancing bad figure" tabIndex={0}>
          {fillWords(ACADEMIC_WORDS.lines.neglected, {
            years: program.neglectYears,
            rank: leadName(program.tier),
            limit: DECAY_AFTER_YEARS,
          })}
          <span className="figure-hint" role="tooltip">
            {ACADEMIC_WORDS.readings.neglect}
          </span>
        </p>
      )}
      <div className="program-row-foot">
        <span className={`figure ${staff.length < need ? 'bad' : ''}`} tabIndex={0}>
          {staff.length} / {need} staffed
          <span className="figure-hint" role="tooltip">
            {FACULTY_READINGS.staffing}
          </span>
        </span>
        <span className="figure" tabIndex={0}>
          Quality {quality.toFixed(0)}
          <span className="figure-hint" role="tooltip">
            {FACULTY_READINGS.programQuality}
          </span>
        </span>
        <span className="figure" tabIndex={0}>
          {tier.seats} seats
          <span className="figure-hint" role="tooltip">
            {ACADEMIC_WORDS.readings.seats}
          </span>
        </span>
        <span className="figure" tabIndex={0}>
          {formatMoney(annualProgramCost(program))} /yr
          <span className="figure-hint" role="tooltip">
            {ACADEMIC_WORDS.readings.annualCost}
          </span>
        </span>
        <span className="program-row-actions">
          {/* Staffing without a trap (Phase 39): an adjunct any week of
              the year, dearer and weaker than a summer hire. */}
          {staff.length < need && adjunct && (
            <button
              type="button"
              className="newgame-btn adjunct-btn figure"
              disabled={!adjunctVerdict.ok}
              onClick={onAdjunct}
            >
              {fillWords(FACULTY_WORDS.hireAdjunct, { salary: formatMoney(adjunct.salary) })}
              <span className="figure-hint" role="tooltip">
                {adjunctVerdict.ok ? FACULTY_READINGS.adjunct : adjunctVerdict.reason}
              </span>
            </button>
          )}
          {!a && toTier && (
            <button
              type="button"
              className="newgame-btn advance-btn figure"
              disabled={iced || !verdict.ok || payWith === null}
              onClick={() => {
                if (payWith) onAdvance(payWith);
              }}
            >
              {iced
                ? ACADEMIC_WORDS.lines.frozen
                : verdict.ok
                  ? fillWords(ACADEMIC_WORDS.lines.advance, {
                      tier: toTier.name,
                      cost: formatMoney(cost),
                      years: advancementYears(toTier.id),
                    })
                  : fillWords(ACADEMIC_WORDS.lines.needsLead, { rank: leadName(toTier.id) })}
              <span className="figure-hint" role="tooltip">
                {ACADEMIC_WORDS.readings.advance}
              </span>
            </button>
          )}
          {!a && !toTier && <span className="program-row-top">{ACADEMIC_WORDS.lines.topTier}</span>}
          {armed ? (
            <>
              <span className="newgame-confirm-label">
                {fillWords(ACADEMIC_WORDS.lines.closeConfirm, { program: def.name })}
              </span>
              <button type="button" className="newgame-btn armed" onClick={onClose}>
                Close
              </button>
              <button type="button" className="newgame-btn" onClick={() => setArmed(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="newgame-btn" onClick={() => setArmed(true)}>
              {ACADEMIC_WORDS.lines.close}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function SchoolGroup({
  school,
  state,
  financing,
  onFound,
  onOpen,
  onClose,
  onAdvance,
  onSignature,
  onAdjunct,
}: {
  school: SchoolDef;
  state: GameState;
  financing: Financing;
  onFound: (schoolId: string, placementId: string, payWith: Financing) => void;
  onOpen: (programId: string, payWith: Financing) => void;
  onClose: (programId: string) => void;
  onAdvance: (programId: string, payWith: Financing) => void;
  onSignature: (programId: string, signature: boolean) => void;
  onAdjunct: (programId: string) => void;
}) {
  const founded = foundedSchool(state, school.id);
  const halls = hallsFor(state, school.id);
  // A hall still going up is a hall on its way, not a hall to go and build
  // (the playtest: Founders Hall's first month read "build one first").
  const rising = state.campus.placements.find(
    (p) =>
      p.status === 'building' &&
      buildingById(p.buildingId).housesSchool &&
      !state.academics.schools.some((sc) => sc.placementId === p.id),
  );
  const [hallId, setHallId] = useState<string>('');
  const chosenHall = halls.find((h) => h.id === hallId) ?? halls[0] ?? null;
  const cost = schoolFoundingCost();
  const payWith = canPay(state, cost, financing) ? financing : affordableFinancing(state, cost);
  const iced = frozen(state);
  const open = school.programs.filter((p) => openProgram(state, p.id));
  const closed = school.programs.filter((p) => !openProgram(state, p.id));
  const openCost = programOpeningCost();
  const openPayWith = canPay(state, openCost, financing)
    ? financing
    : affordableFinancing(state, openCost);
  return (
    <section
      className={`school-group ${founded ? 'founded' : 'unfounded'}`}
      style={{ '--school-hue': school.hue } as React.CSSProperties}
    >
      <div className="school-group-head">
        <span className="school-group-mark" aria-hidden="true">
          {school.mark}
        </span>
        <h3>{founded ? `School of ${school.name}` : school.name}</h3>
        {founded ? (
          <span className="school-group-hall">{hallName(state, founded.placementId)}</span>
        ) : (
          <span className="school-group-unnamed">unfounded</span>
        )}
        <span className="lane-count">
          {open.length} / {school.programs.length} programs
        </span>
      </div>
      {!founded ? (
        <div className="founding-card">
          <p className="founding-blurb">{school.blurb}</p>
          <div className="founding-controls">
            {halls.length === 0 && rising ? (
              <span className="treasury-note">
                {fillWords(ACADEMIC_WORDS.lines.hallRising, {
                  hall: buildingById(rising.buildingId).name,
                  weeks: Math.max(1, (rising.completesWeek ?? 0) - state.clock.absoluteWeek),
                })}
              </span>
            ) : halls.length === 0 ? (
              <span className="treasury-note bad">{ACADEMIC_WORDS.lines.needHall}</span>
            ) : iced ? (
              <span className="treasury-note bad">{ACADEMIC_WORDS.lines.frozen}</span>
            ) : (
              <>
                <label className="founding-hall">
                  <span>In</span>
                  <select
                    value={chosenHall?.id ?? ''}
                    onChange={(e) => setHallId(e.target.value)}
                    aria-label={`Hall for the School of ${school.name}`}
                  >
                    {halls.map((h) => (
                      <option key={h.id} value={h.id}>
                        {fillWords(ACADEMIC_WORDS.lines.hallOption, {
                          building: hallName(state, h.id),
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="beat-resolve found-btn"
                  disabled={!chosenHall || payWith === null}
                  title={payWith === null ? 'Not enough cash' : undefined}
                  onClick={() => {
                    if (chosenHall && payWith) onFound(school.id, chosenHall.id, payWith);
                  }}
                >
                  {fillWords(ACADEMIC_WORDS.lines.found, { school: school.name })} ·{' '}
                  {formatMoney(cost)}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="program-rows">
            {open.length === 0 && (
              <p className="treasury-note">{ACADEMIC_WORDS.lines.noPrograms}</p>
            )}
            {open.map((def) => (
              <ProgramRow
                key={def.id}
                def={def}
                program={openProgram(state, def.id)!}
                state={state}
                financing={financing}
                onClose={() => onClose(def.id)}
                onAdvance={(payWith) => onAdvance(def.id, payWith)}
                onSignature={(signature) => onSignature(def.id, signature)}
                onAdjunct={() => onAdjunct(def.id)}
              />
            ))}
          </div>
          {closed.length > 0 && (
            <div className="program-offers">
              {closed.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  className="program-offer"
                  disabled={iced || openPayWith === null}
                  title={iced ? ACADEMIC_WORDS.lines.frozen : def.blurb}
                  onClick={() => {
                    if (openPayWith) onOpen(def.id, openPayWith);
                  }}
                >
                  <span className="program-offer-name">{def.name}</span>
                  <span className="program-offer-code">{def.code}</span>
                  <span className="program-offer-cost">
                    {fillWords(ACADEMIC_WORDS.lines.open, { cost: formatMoney(openCost) })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function CurriculumScreen({
  state,
  financing,
  onFound,
  onOpen,
  onClose,
  onAdvance,
  onSignature,
  onAdjunct,
}: {
  state: GameState;
  financing: Financing;
  onFound: (schoolId: string, placementId: string, payWith: Financing) => void;
  onOpen: (programId: string, payWith: Financing) => void;
  onClose: (programId: string) => void;
  onAdvance: (programId: string, payWith: Financing) => void;
  onSignature: (programId: string, signature: boolean) => void;
  onAdjunct: (programId: string) => void;
}) {
  const founded = state.academics.schools.length;
  const open = state.academics.programs.length;
  const seats = programSeats(state);
  const rooms = campusCapacity(state).seats;
  const students = enrolled(state);
  const crowded = programCrowding(state) > 1;
  return (
    <div className="curriculum">
      <div className="figure-row">
        <Figure
          label="Schools"
          value={`${founded} / ${SCHOOLS.length}`}
          hint={ACADEMIC_WORDS.readings.schools}
          size="lg"
        />
        <Figure
          label="Programs"
          value={`${open} / ${PROGRAMS.length}`}
          hint={ACADEMIC_WORDS.readings.programs}
        />
        <Figure
          label="Program costs"
          value={`${formatMoney(annualProgramCosts(state))} /yr`}
          hint={ACADEMIC_WORDS.readings.programCosts}
        />
        <Figure
          label="Halls free"
          value={String(hallsAvailable(state).length)}
          hint={ACADEMIC_WORDS.readings.halls}
          tone={hallsAvailable(state).length === 0 && founded < SCHOOLS.length ? 'bad' : undefined}
        />
        <Figure
          label="Signatures"
          value={`${signatures(state).length} / ${SIGNATURE_LIMIT}`}
          hint={ACADEMIC_WORDS.readings.signatures}
        />
        <Figure
          label="Program seats"
          value={`${students} / ${seats}`}
          hint={ACADEMIC_WORDS.readings.crowding}
          tone={crowded ? 'bad' : undefined}
        />
        <Figure
          label="Classroom seats"
          value={`${students} / ${rooms}`}
          hint={ACADEMIC_WORDS.readings.classroomSeats}
          tone={students > rooms ? 'bad' : undefined}
        />
      </div>
      {/* Where seats come from (Phase 40): the review's new player found
          two seat counts and no word on how either grows. */}
      <p className="treasury-note">{ACADEMIC_WORDS.lines.seatsFrom}</p>
      {crowded && (
        <p className="treasury-note bad">
          {fillWords(ACADEMIC_WORDS.lines.crowded, { enrolled: students, seats })}
        </p>
      )}
      {SCHOOLS.map((school) => (
        <SchoolGroup
          key={school.id}
          school={school}
          state={state}
          financing={financing}
          onFound={onFound}
          onOpen={onOpen}
          onClose={onClose}
          onAdvance={onAdvance}
          onSignature={onSignature}
          onAdjunct={onAdjunct}
        />
      ))}
    </div>
  );
}
