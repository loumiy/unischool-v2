// PHASE 21 CHECKPOINT: the screenshot pass.
//
// Drives the real app with Playwright, injecting the saves tools/scenarios.ts
// built, and shoots every state at both viewports. Dev-only: nothing here is
// imported by src/, and playwright-core is a devDependency.
//
//   npx vite --port 5179 --strictPort &   # then
//   node tools/screenshots.mjs

import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SCEN = join(import.meta.dirname, '.scenarios');
const OUT = join(import.meta.dirname, '..', 'docs', 'audits', 'phase-21', 'screenshots');
const URL = 'http://localhost:5179/';
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  headless: true,
});
const errors = [];
const shots = [];

// Put a save into the slot the app boots from, then reload into it.
async function inject(page, name) {
  const file = JSON.parse(readFileSync(join(SCEN, `${name}.json`), 'utf8'));
  await page.evaluate(async (save) => {
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('unischool-v2');
      open.onupgradeneeded = () => open.result.createObjectStore('saves');
      open.onsuccess = () => {
        const tx = open.result.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(save, 'autosave');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  }, file);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.toolbar', { timeout: 15000 });
  // Pause the clock so a screenshot is of a moment, not a blur.
  await page.keyboard.press(' ');
  await page.waitForTimeout(350);
}

async function shoot(page, vp, label) {
  const path = join(OUT, `${label}--${vp.name}.png`);
  await page.screenshot({ path });
  shots.push(`docs/audits/phase-21/screenshots/${label}--${vp.name}.png`);
  return path;
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${vp.name} pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404'))
      errors.push(`${vp.name} console: ${m.text()}`);
  });

  // ---------- the startup flow, every step ----------
  await page.goto(URL);
  await page.evaluate(() => indexedDB.deleteDatabase('unischool-v2'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.startup-card', { timeout: 15000 });
  await shoot(page, vp, '01-startup-1-name');
  await page.fill('.startup-name', 'Blackmoor');
  await page.waitForTimeout(150);
  await shoot(page, vp, '01-startup-2-named');
  // Whatever further steps the card offers.
  const motifBtns = await page.locator('.startup-card button').count();
  if (motifBtns > 2) {
    await page
      .locator('.startup-card button')
      .nth(1)
      .click()
      .catch(() => {});
    await page.waitForTimeout(150);
    await shoot(page, vp, '01-startup-3-choices');
  }
  await page.click('.startup-begin-btn');
  await page.waitForSelector('.siting-card', { timeout: 15000 });
  await shoot(page, vp, '02-empty-map-siting');

  // Founders Hall placed.
  const box = await page.locator('.campus-map-svg').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2 + 1);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForSelector('g[aria-label="Founders Hall"]', { timeout: 15000 });
  await page.keyboard.press(' ');
  await page.waitForTimeout(300);
  await shoot(page, vp, '03-founders-hall-placed');

  // ---------- states from saves ----------
  const tabs = [
    ['c', '.curriculum', 'curriculum'],
    ['f', '.faculty', 'faculty'],
    ['s', '.students', 'students'],
    ['t', '.treasury', 'treasury'],
    ['h', '.history', 'history'],
  ];

  const plan = [
    ['year-01-before-convocation', '04-year-01', []],
    ['mid-game-year-15', '05-midgame-y15', tabs],
    ['mature-year-32', '06-mature-y32', tabs],
    ['stress-dense-campus', '07-stress-dense', []],
    ['motif-georgian', '08-motif-georgian', []],
    ['motif-gothic', '08-motif-gothic', []],
    ['motif-classical', '08-motif-classical', []],
    ['motif-mission', '08-motif-mission', []],
    ['motif-modern', '08-motif-modern', []],
    ['seats-staffed', '09-seats', [['f', '.seats', 'seats']]],
    ['campaign-running', '10-campaign', [['s', '.campaigns', 'campaigns']]],
    ['distress-rung-0', '11-rung-0', []],
    ['distress-rung-1', '11-rung-1', []],
    ['distress-rung-2', '11-rung-2', []],
    ['distress-rung-3', '11-rung-3', []],
    ['distress-rung-4', '11-rung-4', []],
    ['distress-rung-5', '11-rung-5', []],
  ];

  for (const [scenario, label, screens] of plan) {
    try {
      await inject(page, scenario);
      await shoot(page, vp, `${label}-map`);
      for (const [key, sel, sub] of screens) {
        await page.keyboard.press(key);
        await page.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(250);
        await shoot(page, vp, `${label}-${sub}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
      }
    } catch (e) {
      errors.push(`${vp.name} ${scenario}: ${e.message.split('\n')[0]}`);
    }
  }

  // ---------- the beat screens ----------
  for (const [scenario, label] of [
    ['beat-convocation', '12-beat-convocation'],
    ['beat-board-meeting', '12-beat-board-meeting'],
    ['beat-admissions', '12-beat-admissions'],
    ['beat-budget-hiring', '12-beat-budget-hiring'],
  ]) {
    try {
      await inject(page, scenario);
      const next = page.locator('button.log-ticker-next-text');
      if (await next.count()) {
        await next.click();
        await page.waitForTimeout(400);
      }
      await shoot(page, vp, label);
    } catch (e) {
      errors.push(`${vp.name} ${scenario}: ${e.message.split('\n')[0]}`);
    }
  }

  // ---------- events ----------
  try {
    await inject(page, 'event-inline');
    await page.waitForSelector('.event-prompt', { timeout: 8000 }).catch(() => {});
    await shoot(page, vp, '13-event-inline');
  } catch (e) {
    errors.push(`${vp.name} event-inline: ${e.message.split('\n')[0]}`);
  }
  try {
    await inject(page, 'event-seismic');
    const next = page.locator('button.log-ticker-next-text');
    if (await next.count()) {
      await next.click();
      await page.waitForTimeout(400);
    }
    await shoot(page, vp, '13-event-seismic');
  } catch (e) {
    errors.push(`${vp.name} event-seismic: ${e.message.split('\n')[0]}`);
  }

  // ---------- chrome states ----------
  try {
    await inject(page, 'mature-year-32');
    await page.keyboard.press('l');
    await page.waitForSelector('.journal', { timeout: 8000 }).catch(() => {});
    await shoot(page, vp, '14-journal');
    await page.keyboard.press('Escape');
    await page.keyboard.press('b');
    await page.waitForTimeout(300);
    await shoot(page, vp, '14-build-menu');
    await page.keyboard.press('Escape');
  } catch (e) {
    errors.push(`${vp.name} chrome: ${e.message.split('\n')[0]}`);
  }

  await ctx.close();
}

await browser.close();
console.log(`\n${shots.length} screenshots written to docs/audits/phase-21/screenshots/`);
console.log(`console/page errors during capture: ${errors.length}`);
for (const e of errors.slice(0, 30)) console.log('  ' + e);
