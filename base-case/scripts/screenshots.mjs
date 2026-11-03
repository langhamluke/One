#!/usr/bin/env node
/**
 * Visual review loop. Logs in as each demo role, visits every route at 1440 / 1024 / 768 px,
 * fails loudly on console errors, failed requests, and any request to a non-local host,
 * checks for horizontal overflow, screenshots to ./screenshots/, and prints the SUMMARY to PDF (expects 1 page).
 *
 * Usage: BASE_URL=http://localhost:8787 node scripts/screenshots.mjs [--role client|advisor|admin] [--quick]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';
const args = process.argv.slice(2);
const onlyRole = args.includes('--role') ? args[args.indexOf('--role') + 1] : null;
const quick = args.includes('--quick');
const WIDTHS = quick ? [1280] : [1440, 1024, 768];

const ACCOUNTS = {
  client: { email: process.env.CLIENT_EMAIL || 'maya@demo.basecase.local', password: 'BaseCase-Client-2026!' },
  advisor: { email: 'advisor@demo.basecase.local', password: 'BaseCase-Advisor-2026!' },
  admin: { email: 'admin@demo.basecase.local', password: 'BaseCase-Admin-2026!' },
};

const ROUTES = {
  client: ['/', '/plan/profile', '/plan/risk', '/plan/career', '/plan/plan', '/plan/future', '/plan/summary', '/proposals', '/assistant', '/playbook', '/data', '/account', '/privacy', '/terms', '/methodology'],
  advisor: ['/', '/clients', '/proposals', '/assistant', '/playbook', '/data', '/account'],
  admin: ['/', '/clients', '/proposals', '/admin/users', '/admin/audit', '/admin/settings', '/data', '/account'],
};

const outDir = path.resolve('screenshots');
fs.mkdirSync(outDir, { recursive: true });

const problems = [];
const localHost = new URL(BASE_URL).host;

async function login(context, role) {
  const acct = ACCOUNTS[role];
  const res = await context.request.post(`${BASE_URL}/api/auth/login`, {
    data: acct,
    headers: { 'X-Requested-With': 'base-case', Origin: BASE_URL, 'Content-Type': 'application/json' },
  });
  if (!res.ok()) throw new Error(`login failed for ${role}: ${res.status()} ${await res.text()}`);
  return res.json();
}

async function firstClientId(context) {
  const res = await context.request.get(`${BASE_URL}/api/clients`, { headers: { 'X-Requested-With': 'base-case' } });
  if (!res.ok()) return null;
  const list = await res.json();
  return Array.isArray(list) && list[0] ? list[0].id : null;
}

const browser = await chromium.launch();
try {
  for (const role of Object.keys(ACCOUNTS)) {
    if (onlyRole && onlyRole !== role) continue;
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await login(context, role);
      let routes = [...ROUTES[role]];
      if (role !== 'client') {
        const cid = await firstClientId(context);
        if (cid) routes.push(`/clients/${cid}`, `/clients/${cid}/plan/profile`, `/clients/${cid}/plan/career`, `/clients/${cid}/plan/plan`, `/clients/${cid}/plan/future`, `/clients/${cid}/plan/summary`);
      }
      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') problems.push({ role, width, route: page.url(), kind: 'console', text: msg.text().slice(0, 300) });
      });
      page.on('pageerror', (err) => problems.push({ role, width, route: page.url(), kind: 'pageerror', text: String(err).slice(0, 300) }));
      page.on('request', (req) => {
        const host = new URL(req.url()).host;
        if (host !== localHost && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) {
          problems.push({ role, width, route: page.url(), kind: 'external-request', text: req.url() });
        }
      });
      page.on('requestfailed', (req) => problems.push({ role, width, route: page.url(), kind: 'requestfailed', text: `${req.url()} ${req.failure()?.errorText}` }));
      page.on('response', (res) => {
        if (res.status() >= 400 && res.url().includes('/api/')) problems.push({ role, width, route: page.url(), kind: 'http', text: `${res.status()} ${res.url()}` });
      });

      for (const route of routes) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(700);
        const overflow = await page.evaluate(() => {
          const de = document.documentElement;
          const wide = [];
          if (de.scrollWidth > de.clientWidth + 1) {
            for (const el of document.querySelectorAll('body *')) {
              const r = el.getBoundingClientRect();
              if (r.right > de.clientWidth + 1 && r.width > 0) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')}`);
              if (wide.length > 5) break;
            }
            return { wide: true, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, culprits: wide };
          }
          return { wide: false };
        });
        if (overflow.wide) problems.push({ role, width, route, kind: 'overflow', text: `${overflow.scrollWidth}>${overflow.clientWidth} ${overflow.culprits.join(', ')}` });
        const file = path.join(outDir, `${role}-${route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true });
        process.stdout.write(`✓ ${role} ${width} ${route}\n`);
      }

      if (role === 'client' && width === WIDTHS[0]) {
        await page.goto(`${BASE_URL}/plan/summary`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
        await page.emulateMedia({ media: 'print' });
        const pdf = await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
        fs.writeFileSync(path.join(outDir, 'summary.pdf'), pdf);
        const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
        process.stdout.write(`PDF pages: ${pages}\n`);
        if (pages !== 1) problems.push({ role, width, route: '/plan/summary', kind: 'pdf-pages', text: `expected 1 page, got ${pages}` });
        await page.emulateMedia({ media: 'screen' });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`- [${p.kind}] ${p.role} @${p.width} ${p.route}: ${p.text}`);
  process.exitCode = 1;
} else {
  console.log('\nNo problems found.');
}
