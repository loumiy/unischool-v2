// THE CONTACT SHEET (Phase 44): the whole catalogue standing on one parcel,
// in each of the five motifs, photographed at the default zoom in quarters
// and zoomed out whole. Run tools/catalogue.ts first for the saves.
// Dev-only, like tools/density.mjs: nothing in src/ imports it.
//
//   node --experimental-strip-types tools/catalogue.ts
//   npx vite --port 5179 --strictPort &   # then
//   node tools/contactsheet.mjs [motif…]
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.URL ?? 'http://localhost:5179/';
const SCEN = join(import.meta.dirname, '.scenarios');
const OUT = join(import.meta.dirname, '.shots', 'contactsheet');
mkdirSync(OUT, { recursive: true });
const MOTIFS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['georgian', 'gothic', 'classical', 'mission', 'modern'];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL);
for (const motif of MOTIFS) {
  const save = JSON.parse(readFileSync(join(SCEN, `catalogue-${motif}.json`), 'utf8'));
  await page.evaluate(async (file) => {
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('unischool-v2');
      open.onupgradeneeded = () => open.result.createObjectStore('saves');
      open.onsuccess = () => {
        const tx = open.result.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(file, 'autosave');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, save);
  await page.reload({ waitUntil: 'load' });
  await page
    .locator('.title-continue')
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.waitForSelector('.toolbar', { timeout: 15000 });
  await page.waitForTimeout(600);
  // Whole: zoomed out until the parcel fits.
  for (let i = 0; i < 3; i++) await page.keyboard.press('-');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${motif}-whole.png`) });
  console.log(`${motif}: ${join(OUT, `${motif}-whole.png`)}`);
}
if (errors.length) console.log(errors);
await browser.close();
