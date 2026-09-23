// PHASE 21 CHECKPOINT: the information-density pass (audit §5d).
//
// Drives the real app with Playwright and measures, per screen and per
// viewport: scroll depth, what share of the viewport carries no ink, the
// word count, and how far down the page the screen's own controls sit.
// Dev-only, like tools/screenshots.mjs: nothing in src/ imports it.
//
//   npx vite --port 5179 --strictPort &   # then
//   node tools/density.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCEN = join(import.meta.dirname, '.scenarios');
const URL = 'http://localhost:5179/';
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
];
// save, hotkey, the screen's root, and the controls a player has to find.
const SCREENS = [
  ['mature-year-32', 'c', '.curriculum', 'Curriculum', []],
  ['mature-year-32', 'f', '.faculty', 'Faculty', [['Seats panel', '.seats']]],
  [
    'mature-year-32',
    'u',
    '.students',
    'Students',
    [
      ['Alumni ledger', '.alumni-table'],
      ['Campaigns panel', '.campaigns'],
    ],
  ],
  ['mature-year-32', 't', '.treasury', 'Treasury', []],
  ['mature-year-32', 'h', '.history', 'History', []],
  [
    'beat-budget-hiring',
    null,
    '.beat-screen',
    'Beat: Budget & Hiring',
    [['Resolve button', '.beat-resolve']],
  ],
  [
    'beat-board-meeting',
    null,
    '.beat-screen',
    'Beat: Board Meeting',
    [['Resolve button', '.beat-resolve']],
  ],
  [
    'beat-convocation',
    null,
    '.beat-screen',
    'Beat: Convocation',
    [['Resolve button', '.beat-resolve']],
  ],
  [
    'beat-admissions',
    null,
    '.beat-screen',
    'Beat: Admissions Day',
    [['Resolve button', '.beat-resolve']],
  ],
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  headless: true,
});
const rows = [];

async function inject(page, name) {
  const file = JSON.parse(readFileSync(join(SCEN, `${name}.json`), 'utf8'));
  await page.evaluate(async (save) => {
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('unischool-v2', 1);
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
  await page.keyboard.press(' ');
  await page.waitForTimeout(350);
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await page.goto(URL);
  for (const [save, key, root, label, controls] of SCREENS) {
    await inject(page, save);
    if (key) await page.keyboard.press(key);
    else {
      // A beat is reached the way a player reaches it: the ticker's own link.
      const next = page.locator('button.log-ticker-next-text');
      if (await next.count()) {
        await next.click();
        await page.waitForTimeout(400);
      }
    }
    const found = await page.waitForSelector(root, { timeout: 8000 }).catch(() => null);
    if (!found) {
      rows.push({ vp: vp.name, label, note: `${root} never appeared` });
      continue;
    }
    await page.waitForTimeout(250);
    const m = await page.evaluate(
      ([sel, ctrls, vh]) => {
        const el = document.querySelector(sel);
        const scroller = (() => {
          let n = el;
          while (n && n !== document.body) {
            const s = getComputedStyle(n);
            if (/auto|scroll/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 2) return n;
            n = n.parentElement;
          }
          return document.scrollingElement;
        })();
        // Ink: the union area of every text-bearing or bordered box that is
        // inside the first viewport, as a share of it.
        let ink = 0;
        const seen = [];
        for (const n of el.querySelectorAll('*')) {
          if (n.children.length > 0 && !n.textContent.trim()) continue;
          if (n.children.length > 0) continue; // leaves only, so nothing double-counts
          const r = n.getBoundingClientRect();
          if (r.width < 1 || r.height < 1 || r.top > vh || r.bottom < 0) continue;
          const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
          ink += r.width * h;
          seen.push(1);
        }
        const words = el.innerText.trim().split(/\s+/).filter(Boolean).length;
        const out = {
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          words,
          inkShare: Math.min(1, ink / (el.getBoundingClientRect().width * vh)),
          controls: {},
        };
        for (const [name, csel] of ctrls) {
          const c = document.querySelector(csel);
          if (c && getComputedStyle(c.closest('.beat-actions') ?? c).position === 'sticky') {
            const r = c.getBoundingClientRect();
            out.controls[name] = r.bottom <= vh ? Math.round(r.top) : Math.round(r.top);
            continue;
          }
          // Reachable from the top of the screen by a jump link (21G)?
          const anchored = c && c.closest('[id]');
          if (anchored && document.querySelector(`.jump-bar-link[data-target="${anchored.id}"]`)) {
            out.jumps = { ...(out.jumps ?? {}), [name]: true };
          }
          out.controls[name] = c
            ? Math.round(
                c.getBoundingClientRect().top +
                  scroller.scrollTop -
                  el.getBoundingClientRect().top -
                  scroller.scrollTop +
                  c.getBoundingClientRect().top <
                  0
                  ? 0
                  : c.getBoundingClientRect().top + scroller.scrollTop,
              )
            : null;
        }
        return out;
      },
      [root, controls, vp.height],
    );
    rows.push({ vp: vp.name, label, ...m });
  }
  await ctx.close();
}
await browser.close();

const pad = (v, n) => String(v).padEnd(n);
console.log(
  pad('viewport', 11) +
    pad('screen', 26) +
    pad('scroll', 9) +
    pad('view', 7) +
    pad('screens', 9) +
    pad('words', 7) +
    pad('ink%', 7) +
    'controls below the fold',
);
for (const r of rows) {
  if (r.note) {
    console.log(pad(r.vp, 11) + pad(r.label, 26) + r.note);
    continue;
  }
  const screens = (r.scrollHeight / Math.max(1, r.clientHeight)).toFixed(2);
  const below = Object.entries(r.controls)
    .map(([k, v]) =>
      v === null
        ? `${k}: absent`
        : v > r.clientHeight
          ? `${k}: y=${v} (${(v / r.clientHeight).toFixed(1)} screens down${r.jumps?.[k] ? ', one jump from the top' : ''})`
          : `${k}: visible`,
    )
    .join('; ');
  console.log(
    pad(r.vp, 11) +
      pad(r.label, 26) +
      pad(r.scrollHeight, 9) +
      pad(r.clientHeight, 7) +
      pad(screens, 9) +
      pad(r.words, 7) +
      pad((r.inkShare * 100).toFixed(0) + '%', 7) +
      below,
  );
}
