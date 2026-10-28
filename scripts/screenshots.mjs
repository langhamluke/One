// Usage: node scripts/screenshots.mjs [outDir] [width] [height]
// Opens the single-file build over file:// (no server, no network) and captures every screen for each demo persona.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
import path from 'node:path';
import fs from 'node:fs';

const out = path.resolve(process.argv[2] ?? 'screenshots');
const width = Number(process.argv[3] ?? 1440);
const height = Number(process.argv[4] ?? 900);
fs.mkdirSync(out, { recursive: true });
const file = 'file://' + path.resolve('dist-single/flight-plan.html');
const personas = ['cfi23', 'rfo27', 'cargo34'];
const phases = ['PREFLIGHT', 'CHECKLIST', 'FLIGHT PLAN', 'CRUISE', 'LANDING', 'BRIEFING'];
const modes = (process.env.MODES ?? 'advisor').split(',');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) errors.push('NETWORK ' + r.url()); });
await page.goto(file);
for (const mode of modes) {
  await page.getByRole('radio', { name: mode === 'advisor' ? 'Advisor' : 'Client' }).click();
  for (const pid of personas) {
    await page.selectOption('#persona', pid);
    for (const [i, ph] of phases.entries()) {
      await page.getByRole('navigation', { name: 'Phases of flight' }).getByRole('button', { name: new RegExp(ph) }).click();
      await page.waitForTimeout(1300);
      await page.screenshot({ path: path.join(out, `${pid}-${i + 1}-${ph.replace(' ', '').toLowerCase()}-${mode}-${width}.png`), fullPage: true });
    }
  }
}
if (process.env.PRINT) {
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(out, 'briefing.pdf'), format: 'Letter', printBackground: true });
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors, no network requests');
