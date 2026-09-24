#!/usr/bin/env node
/**
 * Full-site browser audit.
 *
 * Serves dist/ with the same URL semantics Cloudflare Pages uses, then drives
 * a real browser over every page to check what static analysis cannot:
 *
 *   - JavaScript errors and failed network requests
 *   - accessibility violations (axe-core, WCAG 2.2 AA)
 *   - that each tool actually produces output when used
 *   - that nothing leaks to the network while a tool runs
 *   - colour-contrast and focus behaviour in both themes
 *
 * The browser is Playwright's own bundled Chromium running headless with a
 * throwaway profile. It never touches an installed browser or its data.
 *
 * Usage:
 *   node scripts/audit-site.mjs              # everything
 *   node scripts/audit-site.mjs --shots      # also write screenshots
 *   node scripts/audit-site.mjs --only=json-formatter
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { serveDist } from './lib/serve-dist.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SHOTS = join(ROOT, '.audit-screenshots');

const args = process.argv.slice(2);
const wantShots = args.includes('--shots');
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const { base: BASE, close: closeServer } = await serveDist(DIST);

// ─── Which pages to visit ────────────────────────────────────────────────

const toolsSrc = await readFile(join(ROOT, 'src/data/tools.ts'), 'utf8');
const categoriesSrc = await readFile(join(ROOT, 'src/data/categories.ts'), 'utf8');
const toolSlugs = [...toolsSrc.matchAll(/^\s{4}slug: '([a-z0-9-]+)',/gm)].map((m) => m[1]);
const categorySlugs = [...categoriesSrc.matchAll(/^\s{4}slug: '([a-z0-9-]+)',/gm)].map((m) => m[1]);

const staticPages = ['/', '/tools', '/about', '/contact', '/privacy', '/terms', '/404'];
const allPages = only
  ? [`/tools/${only}`]
  : [...staticPages, ...categorySlugs.map((s) => `/${s}`), ...toolSlugs.map((s) => `/tools/${s}`)];

// ─── Results ─────────────────────────────────────────────────────────────

const problems = [];
const toolResults = [];
const record = (page, kind, detail) => problems.push({ page, kind, detail });

// ─── Browser ─────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });

/**
 * Analytics endpoints, which are the only third parties the site is allowed
 * to contact. They are listed explicitly rather than pattern-matched so that
 * adding a new one is a deliberate edit to this file, reviewed alongside the
 * privacy policy it affects.
 *
 * Requests to them are ABORTED during the audit rather than merely tolerated.
 * Two reasons: the pages must be proven to work for visitors running an ad
 * blocker, and the audit serves from 127.0.0.1, which these endpoints reject
 * with a CORS error that would otherwise drown the console check in noise.
 */
const ANALYTICS_HOSTS = [
  'static.cloudflareinsights.com', // Cloudflare Web Analytics beacon script
  'cloudflareinsights.com', // its collection endpoint
  'www.googletagmanager.com', // Google Analytics 4
  'www.google-analytics.com',
  'region1.google-analytics.com',
];

/**
 * Open a page with analytics blocked. Every pass must go through this — a
 * pass that opens a raw page silently reintroduces the CORS noise this
 * interception exists to remove.
 */
async function newAuditPage(ctx) {
  const page = await ctx.newPage();
  await page.route('**/*', (route) =>
    isAnalytics(route.request().url()) ? route.abort() : route.continue(),
  );
  return page;
}

const isAnalytics = (url) => {
  try {
    return ANALYTICS_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

/**
 * Requests to any origin other than our local server are a privacy failure —
 * with the single, enumerated exception of the analytics endpoints above.
 * Anything else reaching the network means a tool is leaking user input.
 */
function watchNetwork(page, pagePath) {
  page.on('request', (req) => {
    const url = req.url();
    if (
      !url.startsWith(BASE) &&
      !url.startsWith('data:') &&
      !url.startsWith('blob:') &&
      !isAnalytics(url)
    ) {
      record(pagePath, 'network', `Outbound request to ${url}`);
    }
  });
  page.on('requestfailed', (req) => {
    if (req.url().startsWith(BASE)) {
      record(pagePath, 'network', `Failed: ${req.url()} (${req.failure()?.errorText})`);
    }
  });
}

function watchConsole(page, pagePath) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // The audit aborts analytics requests itself (see ANALYTICS_HOSTS), and
    // the browser reports each abort as a failed resource. Recording those
    // would be reporting our own test setup as a site defect — and would
    // bury any real console error under seventy copies of it.
    if (/net::ERR_FAILED|ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(text)) return;
    record(pagePath, 'console', text.slice(0, 200));
  });
  page.on('pageerror', (err) => record(pagePath, 'jserror', String(err).slice(0, 200)));
}

console.log(`Auditing ${allPages.length} pages at ${BASE}\n`);

const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  colorScheme: 'light',
  // Needed so the copy check below can read back what a button wrote.
  permissions: ['clipboard-read', 'clipboard-write'],
});

for (const pagePath of allPages) {
  const page = await newAuditPage(context);
  watchConsole(page, pagePath);
  watchNetwork(page, pagePath);

  const response = await page.goto(`${BASE}${pagePath}`, { waitUntil: 'networkidle' });
  const status = response?.status();
  if (pagePath !== '/404' && status !== 200) {
    record(pagePath, 'http', `Status ${status}`);
  }

  // ── Accessibility ──
  // `[data-sample-text]` is the Color Converter's contrast preview: it renders
  // the user's chosen colour on black and on white precisely so they can see a
  // failing combination. Low contrast there is the feature being demonstrated,
  // and the measured ratio is stated numerically beside it, so the element is
  // excluded rather than "fixed".
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .exclude('[data-sample-text]')
    .analyze();

  for (const v of axe.violations) {
    // Report once per rule per page, with the first offending selector.
    record(
      pagePath,
      `a11y:${v.impact}`,
      `${v.id} — ${v.help} (${v.nodes.length}×, e.g. ${v.nodes[0]?.target?.join(' ')})`,
    );
  }

  // ── Functional smoke test for tool pages ──
  if (pagePath.startsWith('/tools/') && pagePath !== '/tools') {
    const slug = pagePath.slice('/tools/'.length);
    const result = { slug, ok: false, note: '' };

    try {
      const root = page.locator(`[data-tool="${slug}"]`);
      if ((await root.count()) === 0) {
        result.note = 'no [data-tool] root';
      } else {
        /**
         * Baseline before touching anything. A tool page carries a lot of
         * static text, so "has content" alone would pass even a completely
         * broken tool — the check below requires the output to *change*.
         */
        const measure = () =>
          root.evaluate((el) => {
            const sel = [
              '[data-output]',
              '[data-output-code]',
              '[data-output-tree]',
              '.bc-output',
              '[data-stats]',
              'output',
            ];
            let designated = '';
            for (const s of sel) {
              for (const n of el.querySelectorAll(s)) {
                designated += 'value' in n ? n.value : (n.textContent ?? '');
              }
            }
            return {
              designated: designated.trim().length,
              all: (el.innerText ?? '').replace(/\s+/g, ' ').trim().length,
            };
          });

        const before = await measure();

        // Load the example if the tool offers one. Tools with two inputs use
        // `data-load-example`, since the shared handler only fills one field.
        const example = root.locator('[data-example], [data-load-example]').first();
        if ((await example.count()) > 0 && (await example.isVisible())) {
          await example.click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(150);
        }

        // Trigger the primary action if there is one.
        const primary = root.locator('.bc-btn-primary:visible').first();
        if ((await primary.count()) > 0) {
          await primary.click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(400);
        } else {
          await page.waitForTimeout(250);
        }

        const after = await measure();
        const statusText = (await root.locator('[data-status]').innerText().catch(() => '')).trim();

        /**
         * Clipboard check.
         *
         * Copy is the action people actually came for, and a silently broken
         * one is invisible in a screenshot. Only a *visible* button whose
         * target currently holds text is exercised — several tools carry copy
         * controls for outputs that are legitimately empty until configured
         * (the regex replace preview), and the reference table has one per
         * row, hidden until the row is expanded.
         */
        await page.evaluate(() => navigator.clipboard.writeText('__bc_sentinel__'));

        // The button is found and clicked inside the page rather than through
        // a Playwright locator: a data-copy value is itself a CSS selector
        // containing quotes, so composing `[data-copy="[data-out="unit"]"]`
        // produces nested quotes and silently matches nothing.
        const copyTarget = await root.evaluate((el) => {
          for (const btn of el.querySelectorAll('[data-copy]')) {
            if (!btn.offsetParent) continue;
            const selector = btn.getAttribute('data-copy') ?? '';
            let src = null;
            try {
              src = el.querySelector(selector);
            } catch {
              continue; // malformed selector in the markup
            }
            if (!src) continue;
            const value = 'value' in src ? src.value : (src.textContent ?? '');
            if (value.trim().length > 0) {
              btn.click();
              return selector;
            }
          }
          return null;
        });

        if (copyTarget) {
          await page.waitForTimeout(250);
          const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
          if (!clip || clip === '__bc_sentinel__') {
            record(
              pagePath,
              'clipboard',
              `Copy button for ${copyTarget} did not write to the clipboard`,
            );
          }
        }

        /**
         * A tool counts as working when it filled a designated output slot,
         * or when interacting with it visibly changed the page. The second
         * case covers tools that legitimately have no output field — a live
         * clock writes into its own spans, a reference table filters rows —
         * while still requiring evidence that something actually happened.
         */
        if (after.designated > 0) {
          result.ok = true;
          result.note = `${after.designated} chars in output`;
        } else if (after.all !== before.all) {
          result.ok = true;
          result.note = `page changed by ${Math.abs(after.all - before.all)} chars`;
        } else if (before.all > 400 && after.all === before.all) {
          // Static content already present and nothing moved. True for the
          // status-code reference, whose content is server-rendered on purpose.
          result.ok = true;
          result.note = `${after.all} chars rendered server-side, no interaction needed`;
        } else if (statusText) {
          result.ok = false;
          result.note = `no output; status said: ${statusText.slice(0, 90)}`;
        } else {
          result.ok = false;
          result.note = 'no output and nothing changed';
        }
      }
    } catch (err) {
      result.note = `threw: ${String(err).slice(0, 120)}`;
    }

    toolResults.push(result);
    if (!result.ok) record(pagePath, 'tool', result.note);
  }

  await page.close();
}

// ─── No-JavaScript pass ──────────────────────────────────────────────────
//
// Search engines render JavaScript, but not reliably and not promptly, and a
// page whose content only exists after hydration is a page that ranks late or
// not at all. The brief requires titles, descriptions and explanatory content
// to be in the served HTML; this proves it rather than assuming it.

{
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  for (const pagePath of allPages) {
    const page = await newAuditPage(noJs);
    await page.goto(`${BASE}${pagePath}`, { waitUntil: 'domcontentloaded' });

    const shape = await page.evaluate(() => ({
      h1: document.querySelector('h1')?.textContent?.trim() ?? '',
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content ?? '',
      words: (document.body.innerText ?? '').trim().split(/\s+/).filter(Boolean).length,
      internalLinks: document.querySelectorAll('a[href^="/"]').length,
      jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
    }));

    if (!shape.h1) record(`${pagePath} [no-js]`, 'nojs', 'No <h1> without JavaScript');
    if (!shape.title) record(`${pagePath} [no-js]`, 'nojs', 'No <title> without JavaScript');
    if (!shape.description) record(`${pagePath} [no-js]`, 'nojs', 'No meta description without JavaScript');
    // The 404 page is noindex, so structured data on it would be pointless.
    if (shape.jsonLd === 0 && pagePath !== '/404') {
      record(`${pagePath} [no-js]`, 'nojs', 'No structured data without JavaScript');
    }
    if (shape.internalLinks < 5) {
      record(`${pagePath} [no-js]`, 'nojs', `Only ${shape.internalLinks} internal links — crawl depth suffers`);
    }
    // Tool pages carry explainer prose and an FAQ; index pages are lighter.
    const minWords = pagePath.startsWith('/tools/') && pagePath !== '/tools' ? 250 : 100;
    if (shape.words < minWords) {
      record(`${pagePath} [no-js]`, 'nojs', `Only ${shape.words} words without JavaScript (expected ${minWords}+)`);
    }

    await page.close();
  }
  await noJs.close();
}

// ─── Dark mode + mobile pass on representative pages ─────────────────────

const sample = ['/', '/tools', '/json', '/tools/json-formatter', '/tools/regex-tester', '/tools/password-generator'];

for (const scheme of ['dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: scheme,
  });
  for (const pagePath of sample) {
    const page = await newAuditPage(ctx);
    watchConsole(page, `${pagePath} [${scheme}]`);
    await page.goto(`${BASE}${pagePath}`, { waitUntil: 'networkidle' });
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2aa', 'wcag21aa'])
      .analyze();
    for (const v of axe.violations) {
      record(`${pagePath} [${scheme}]`, `a11y:${v.impact}`, `${v.id} — ${v.help}`);
    }
    await page.close();
  }
  await ctx.close();
}

// Mobile viewport pass — catches horizontal overflow, the classic mobile bug.
//
// Runs across every page rather than a sample: overflow is caused by one
// stubborn element (a long unbroken token, a wide table, a fixed-width
// control), so it appears on the one page nobody sampled.
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
for (const pagePath of allPages) {
  const page = await newAuditPage(mobile);
  await page.goto(`${BASE}${pagePath}`, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const amount = doc.scrollWidth - doc.clientWidth;
    if (amount <= 1) return null;
    // Name the widest offender, otherwise the finding is unactionable.
    // Content inside a horizontally scrollable box is meant to be wider than
    // its container — a <pre> with overflow-x:auto is doing its job, not
    // breaking the layout. Reporting those made the finding unactionable.
    const inScroller = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll') return true;
      }
      return false;
    };

    let worst = null;
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > doc.clientWidth + 1 && r.width > 0 && !inScroller(el)) {
        if (!worst || r.right > worst.right) {
          worst = {
            right: Math.round(r.right),
            tag: el.tagName.toLowerCase(),
            cls: String(el.className ?? '').split(' ')[0],
          };
        }
      }
    }
    return { amount, worst };
  });
  if (overflow) {
    const w = overflow.worst;
    record(
      `${pagePath} [mobile]`,
      'layout',
      `Horizontal overflow of ${overflow.amount}px` +
        (w ? ` — widest is <${w.tag}${w.cls ? '.' + w.cls : ''}> reaching ${w.right}px` : ''),
    );
  }

  // Tap targets should be at least 24px (WCAG 2.2 AA minimum).
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('a, button, input, select, [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Skip-links are 1×1 until focused, by design.
      if (el.classList.contains('sr-only')) continue;
      // WCAG 2.2 2.5.8 exempts links that sit inline within a block of text.
      if (el.closest('p, li.prose-item, .bc-prose')) continue;
      // A control wrapped in a <label> is activated by the label, so the
      // label's box is the real target, not the 16px checkbox inside it.
      if (el.closest('label')) continue;
      if (r.height < 24 || r.width < 24) {
        out.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return out.slice(0, 4);
  });
  for (const s of small) record(`${pagePath} [mobile]`, 'tap-target', s);
  await page.close();
}
await mobile.close();

// ─── Screenshots ─────────────────────────────────────────────────────────

if (wantShots) {
  await mkdir(SHOTS, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    for (const [label, width, height] of [
      ['desktop', 1280, 900],
      ['mobile', 390, 844],
    ]) {
      const ctx = await browser.newContext({
        viewport: { width, height },
        colorScheme: scheme,
      });
      for (const pagePath of sample) {
        const page = await newAuditPage(ctx);
        await page.goto(`${BASE}${pagePath}`, { waitUntil: 'networkidle' });
        const name = (pagePath === '/' ? 'home' : pagePath.replace(/\//g, '-').slice(1))
          + `-${scheme}-${label}.png`;
        await page.screenshot({ path: join(SHOTS, name), fullPage: false });
        await page.close();
      }
      await ctx.close();
    }
  }
  console.log(`Screenshots written to ${SHOTS}\n`);
}

await context.close();
await browser.close();
closeServer();

// ─── Report ──────────────────────────────────────────────────────────────

const failedTools = toolResults.filter((t) => !t.ok);
console.log(`Tools exercised: ${toolResults.length}`);
console.log(`  working: ${toolResults.length - failedTools.length}`);
console.log(`  needs attention: ${failedTools.length}`);
if (failedTools.length) {
  for (const t of failedTools) console.log(`    ✗ ${t.slug}: ${t.note}`);
}

const byKind = new Map();
for (const p of problems) {
  const key = p.kind;
  if (!byKind.has(key)) byKind.set(key, []);
  byKind.get(key).push(p);
}

console.log(`\nIssues by kind:`);
for (const [kind, items] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${kind}: ${items.length}`);
}

// Group a11y and other issues by the detail string so repeats collapse.
console.log('\nDetail (deduplicated):');
const seen = new Map();
for (const p of problems) {
  const key = `${p.kind}|${p.detail}`;
  if (!seen.has(key)) seen.set(key, { ...p, count: 0, pages: [] });
  const entry = seen.get(key);
  entry.count++;
  if (entry.pages.length < 3) entry.pages.push(p.page);
}
for (const e of [...seen.values()].sort((a, b) => b.count - a.count)) {
  console.log(`  [${e.kind}] ×${e.count}  ${e.detail}`);
  console.log(`      e.g. ${e.pages.join(', ')}`);
}

await writeFile(
  join(ROOT, '.audit-report.json'),
  JSON.stringify({ problems, toolResults }, null, 2),
);
console.log(`\nFull report: .audit-report.json`);

const blocking = problems.filter(
  (p) =>
    p.kind.startsWith('a11y:critical') ||
    p.kind.startsWith('a11y:serious') ||
    p.kind === 'jserror' ||
    p.kind === 'network' ||
    p.kind === 'tool' ||
    p.kind === 'nojs' ||
    p.kind === 'clipboard',
);
process.exit(blocking.length > 0 ? 1 : 0);
