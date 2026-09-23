// PHASE 40: THE FIRST HOUR, SCRIPTED. A new player who reads only the notes
// and the NEXT slot: it founds a college, does what each note says, answers
// every beat with its default, and stops at the first Convocation with a
// class. It then checks that the class has beds, seats, dining and a
// teacher in every programme, and that no chrome panel covered the ghost
// while a building was in hand at 1440 × 900.
//
// Drives the real app with Playwright, like tools/density.mjs. It reads the
// run through the dev-only hook in src/main.tsx and acts only through the UI.
// Dev-only: nothing in src/ imports it.
//
//   npx vite --port 5179 --strictPort &   # then
//   node tools/newplayer.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.URL ?? 'http://localhost:5179/';
const OUT = join(import.meta.dirname, '.shots', 'newplayer');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'load' });
await page.evaluate(() => {
  localStorage.clear();
  indexedDB.deleteDatabase?.('unischool');
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1200);

const read = (fn) => page.evaluate(`(${fn})(globalThis.__unischool.snapshot().run.state)`);
const notesRead = [];
const failures = [];
const overlaps = [];

async function dismissNote() {
  const card = page.locator('.note-card');
  if ((await card.count()) === 0) return false;
  notesRead.push(await card.locator('.note-card-title').innerText());
  await card.locator('button').click();
  await page.waitForTimeout(100);
  return true;
}

async function readNotes() {
  while (await dismissNote());
}

const box = (el) => el.boundingBox();
const meets = (a, b) =>
  a &&
  b &&
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

// Sweep the map for open ground: hover until the ghost reads ok, check no
// panel sits over it, and click. Returns once the placement count rises.
async function placeHere(label) {
  const before = await read((s) => s.campus.placements.length);
  for (let y = 300; y <= 700; y += 40) {
    for (let x = 400; x <= 1100; x += 40) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(15);
      const ghost = page.locator('.campus-preview.ok');
      if ((await ghost.count()) === 0) continue;
      const g = await box(ghost.first());
      for (const sel of ['.toolbar-popup', '.note-card', '.toolbar', '.log-ticker']) {
        for (const el of await page.locator(sel).all()) {
          if (meets(g, await box(el))) overlaps.push(`${label}: ghost under ${sel}`);
        }
      }
      await page.mouse.click(x, y);
      await page.waitForTimeout(150);
      if ((await read((s) => s.campus.placements.length)) > before) return true;
    }
  }
  failures.push(`could not place ${label}`);
  return false;
}

async function build(name) {
  await readNotes();
  if ((await page.locator('.build-popup').count()) === 0) await page.keyboard.press('b');
  await page.waitForTimeout(150);
  for (const tab of await page.locator('.build-cat-tab').all()) {
    if ((await page.locator('.build-tile', { hasText: name }).count()) > 0) break;
    await tab.click();
    await page.waitForTimeout(80);
  }
  await page.locator('.build-tile', { hasText: name }).first().click();
  await page.waitForTimeout(150);
  const strip = page.locator('.build-popup.holding');
  if ((await strip.count()) === 0) failures.push(`the build menu did not fold for ${name}`);
  await placeHere(name);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

// ---- found the college ----
await page.locator('.title-actions button', { hasText: 'Found a new college' }).click();
await page.waitForTimeout(300);
await page.fill('.startup-name', 'Blackmoor');
await page.locator('.startup-begin-btn').click();
await page.waitForTimeout(800);
await readNotes();
await placeHere('Founders Hall');
await readNotes();

// ---- what the notes ask for ----
await build('Residence Hall');
await build('Dining Hall');
await readNotes();
// Founders Hall takes a month to go up: let the clock run until it opens.
await page.keyboard.press('1');
for (let i = 0; i < 200; i++) {
  await readNotes();
  const open = await read((s) =>
    s.campus.placements.some((p) => p.buildingId === 'founders-hall' && p.status === 'open'),
  );
  if (open) break;
  await page.waitForTimeout(250);
}
await page.keyboard.press('Space');
await page.keyboard.press('c');
await page.waitForTimeout(300);
await page.locator('.found-btn').first().click();
await page.waitForTimeout(200);
for (let i = 0; i < 3; i++) {
  await page.locator('.program-offer').first().click();
  await page.waitForTimeout(150);
}
await page.keyboard.press('Escape');
await readNotes();

// ---- let the year run, answering beats with their defaults ----
async function staffWithAdjuncts() {
  await page.keyboard.press('c');
  await page.waitForTimeout(300);
  for (const btn of await page.locator('.adjunct-btn:not([disabled])').all()) {
    await btn.click();
    await page.waitForTimeout(120);
  }
  await page.keyboard.press('Escape');
}

let staffed = false;
let lastWeek = -1;
let still = 0;
for (let step = 0; step < 4000; step++) {
  await readNotes();
  const s = await read((s) => ({
    beat: s.pendingBeat,
    year: s.clock.year,
    week: s.clock.absoluteWeek,
    enrolled: s.people.cohorts.reduce((t, c) => t + c.size, 0),
  }));
  if (s.beat === 'convocation' && s.enrolled > 0) break;
  if (s.week === lastWeek) still++;
  else still = 0;
  lastWeek = s.week;
  if (still === 30) {
    await page.screenshot({ path: join(OUT, 'stalled.png') });
    const held = await read((s) => ({
      beat: s.pendingBeat,
      letter: s.distress.pendingLetter,
      events: s.events.pending.map((p) => p.eventId),
      phase: s.phase,
      paused: s.clock,
    }));
    console.log(`stalled at week ${s.week}: ${JSON.stringify(held)}`);
  }
  if (still > 60) {
    failures.push(`the clock stopped at week ${s.week} and nothing the notes said moved it`);
    break;
  }
  if (step % 40 === 0) console.log(`week ${s.week} (Year ${s.year})`);
  if (s.beat) {
    // The NEXT slot names what is waiting; clicking it opens the screen.
    if ((await page.locator('.beat-screen').count()) === 0) {
      const next = page.locator('button.log-ticker-next-text');
      if ((await next.count()) > 0) await next.click();
      await page.waitForTimeout(250);
    }
    const btn = page.locator('.beat-screen .beat-resolve').last();
    if ((await btn.count()) > 0) await btn.click();
    await page.waitForTimeout(200);
    // After Budget & Hiring, a player who hired nobody reaches for adjuncts.
    if (s.beat === 'budget-and-hiring' && !staffed) {
      await staffWithAdjuncts();
      staffed = true;
    }
    continue;
  }
  const letter = page.locator('.board-letter .beat-resolve, .event-letter .beat-resolve');
  if ((await letter.count()) > 0) {
    await letter.first().click();
    await page.waitForTimeout(150);
    continue;
  }
  await page.keyboard.press('2');
  await page.waitForTimeout(250);
}

const end = await read((s) => {
  return {
    year: s.clock.year,
    beat: s.pendingBeat,
    enrolled: s.people.cohorts.reduce((t, c) => t + c.size, 0),
    programs: s.academics.programs.map((p) => ({
      id: p.programId,
      teachers: s.faculty.roster.filter((f) => f.programId === p.programId).length,
    })),
  };
});
await page.screenshot({ path: join(OUT, 'convocation.png') });

// The campus's capacity, as the Students screen prints it.
await page.keyboard.press('Escape');
await page.keyboard.press('u');
await page.waitForTimeout(300);
const figures = await page.locator('.students .figure-row').nth(1).innerText();
const ratio = (label) => {
  const m = figures.match(new RegExp(`${label}\\s+(\\d+)\\s*/\\s*(\\d+)`, 'i'));
  return m ? { have: Number(m[1]), of: Number(m[2]) } : null;
};

console.log(`Year ${end.year}, ${end.beat ?? 'no beat'}: ${end.enrolled} enrolled`);
console.log(`notes read: ${notesRead.join(' · ')}`);
if (end.beat !== 'convocation' || end.enrolled === 0)
  failures.push('never reached a Convocation with a class');
for (const [label, name] of [
  ['Beds', 'beds'],
  ['Dining seats', 'dining'],
  ['Teaching seats', 'seats'],
]) {
  const r = ratio(label);
  if (!r) failures.push(`no ${name} figure on the Students screen`);
  else if (r.have < end.enrolled) failures.push(`${name}: ${r.have} / ${r.of} for ${end.enrolled}`);
  else console.log(`${name}: ${r.have} / ${r.of}`);
}
for (const p of end.programs)
  if (p.teachers === 0) failures.push(`${p.id} has nobody teaching it`);
  else console.log(`${p.id}: ${p.teachers} teaching`);
if (end.programs.length === 0) failures.push('no programmes open');
for (const o of overlaps) failures.push(o);
for (const e of errors) failures.push(`page error: ${e}`);

await browser.close();
if (failures.length) {
  console.log(`\nFAILED\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nThe first hour holds.');
