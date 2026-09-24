#!/usr/bin/env node
/**
 * Cross-browser functional suite.
 *
 * Exercises every tool in Chromium, Firefox and WebKit. WebKit is the engine
 * behind Safari, which is where client-side tools break most often: clipboard
 * permissions, `<dialog>`, `Intl.Segmenter`, `crypto.randomUUID` and lookbehind
 * in regular expressions have all shipped there later than elsewhere.
 *
 * These are Playwright's own bundled browser builds with throwaway profiles.
 * No installed browser or user profile is touched.
 *
 * Usage:
 *   node scripts/cross-browser.mjs                  # all three engines
 *   node scripts/cross-browser.mjs --engine=webkit
 *   node scripts/cross-browser.mjs --only=jwt-decoder
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { serveDist } from './lib/serve-dist.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const engineArg = args.find((a) => a.startsWith('--engine='))?.split('=')[1];

const ENGINES = { chromium, firefox, webkit };
const selected = engineArg ? { [engineArg]: ENGINES[engineArg] } : ENGINES;

const toolsSrc = await readFile(join(ROOT, 'src/data/tools.ts'), 'utf8');
const slugs = only
  ? [only]
  : [...toolsSrc.matchAll(/^\s{4}slug: '([a-z0-9-]+)',/gm)].map((m) => m[1]);

const { base, close } = await serveDist(DIST);

/**
 * Drive one tool the way a visitor would and report whether it worked.
 * Kept identical across engines so a difference in result is a real
 * difference in engine behaviour, not in the test.
 */
async function exerciseTool(page, slug) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160));
  });

  await page.goto(`${base}/tools/${slug}`, { waitUntil: 'load' });

  const root = page.locator(`[data-tool="${slug}"]`);
  if ((await root.count()) === 0) return { ok: false, note: 'tool root missing', errors };

  const example = root.locator('[data-example]').first();
  if ((await example.count()) > 0 && (await example.isVisible().catch(() => false))) {
    await example.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(200);
  }

  const primary = root.locator('.bc-btn-primary:visible').first();
  if ((await primary.count()) > 0) {
    await primary.click({ timeout: 5000 }).catch(() => {});
  }
  await page.waitForTimeout(500);

  const produced = await root.evaluate((el) => {
    const sel = ['[data-output]', '[data-output-code]', '[data-output-tree]', '.bc-output', '[data-stats]', 'output'];
    let text = '';
    for (const s of sel) {
      for (const n of el.querySelectorAll(s)) {
        text += 'value' in n ? n.value : (n.textContent ?? '');
      }
    }
    if (text.trim().length) return text.trim().length;
    return (el.innerText ?? '').replace(/\s+/g, ' ').trim().length > 120
      ? (el.innerText ?? '').trim().length
      : 0;
  });

  // An error surfaced to the user is a legitimate outcome for some inputs, so
  // it is reported but does not by itself count as a failure.
  const status = (await root.locator('[data-status]').innerText().catch(() => '')).trim();

  return {
    ok: produced > 0 && errors.length === 0,
    note: errors.length
      ? `${errors.length} JS error(s): ${errors[0]}`
      : produced > 0
        ? `${produced} chars`
        : `no output${status ? ` — status: ${status.slice(0, 70)}` : ''}`,
    errors,
  };
}

const failures = [];

for (const [name, engine] of Object.entries(selected)) {
  if (!engine) {
    console.error(`Unknown engine: ${name}`);
    process.exit(1);
  }

  process.stdout.write(`\n${name}\n${'─'.repeat(60)}\n`);
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  let pass = 0;
  for (const slug of slugs) {
    const page = await context.newPage();
    let result;
    try {
      result = await exerciseTool(page, slug);
    } catch (err) {
      result = { ok: false, note: `threw: ${String(err).slice(0, 120)}`, errors: [] };
    }
    await page.close();

    if (result.ok) {
      pass++;
    } else {
      failures.push({ engine: name, slug, note: result.note });
      console.log(`  ✗ ${slug.padEnd(30)} ${result.note}`);
    }
  }

  console.log(`  ${pass}/${slugs.length} tools working in ${name}`);

  // The search dialog is the one piece of shared UI with real engine
  // divergence: <dialog> shipped late in Safari and Firefox.
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'load' });
  const searchWorks = await page
    .evaluate(async () => {
      const btn = document.querySelector('[data-search-open]');
      if (!btn) return 'no trigger';
      btn.click();
      await new Promise((r) => setTimeout(r, 400));
      const dialog = document.getElementById('bc-search');
      return dialog && dialog.open ? 'ok' : 'did not open';
    })
    .catch((e) => `threw: ${e}`);
  if (searchWorks !== 'ok') {
    failures.push({ engine: name, slug: '(search dialog)', note: searchWorks });
    console.log(`  ✗ search dialog: ${searchWorks}`);
  } else {
    console.log(`  ✓ search dialog opens`);
  }

  // Theme toggle relies on localStorage, which throws in some privacy modes.
  const themeWorks = await page
    .evaluate(async () => {
      const btn = document.getElementById('bc-theme-toggle');
      if (!btn) return 'no toggle';
      const before = document.documentElement.classList.contains('dark');
      btn.click();
      await new Promise((r) => setTimeout(r, 100));
      return document.documentElement.classList.contains('dark') !== before
        ? 'ok'
        : 'did not toggle';
    })
    .catch((e) => `threw: ${e}`);
  if (themeWorks !== 'ok') {
    failures.push({ engine: name, slug: '(theme toggle)', note: themeWorks });
    console.log(`  ✗ theme toggle: ${themeWorks}`);
  } else {
    console.log(`  ✓ theme toggle works`);
  }
  await page.close();

  await context.close();
  await browser.close();
}

close();

console.log(`\n${'═'.repeat(60)}`);
if (failures.length) {
  console.error(`${failures.length} failure(s):\n`);
  for (const f of failures) console.error(`  [${f.engine}] ${f.slug}: ${f.note}`);
  process.exit(1);
}
console.log(`All ${slugs.length} tools working in ${Object.keys(selected).join(', ')}.`);
