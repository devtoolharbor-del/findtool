#!/usr/bin/env node
/**
 * Active security checks.
 *
 * Static review tells you the code looks safe. This tries to break it:
 * it feeds every tool a set of XSS payloads and asserts nothing executes,
 * confirms the regex worker cannot hang the tab, checks that oversized input
 * is refused rather than freezing the page, and greps the source for patterns
 * that should never appear.
 *
 * Run after `npm run build`. Exits non-zero on any finding.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveDist } from './lib/serve-dist.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const findings = [];
const report = (area, detail) => findings.push({ area, detail });

// ─── 1. Source-level patterns that must never appear ─────────────────────

console.log('1. Scanning source for dangerous patterns…');

/**
 * `eval` and `new Function` execute strings as code. `document.write` and
 * `outerHTML` are injection sinks. `dangerouslySetInnerHTML` would indicate
 * a framework crept in. `innerHTML` is allowed but audited separately below,
 * because two tools legitimately use it with escaped content.
 */
const BANNED = [
  [/\beval\s*\(/, 'eval()'],
  [/new\s+Function\s*\(/, 'new Function()'],
  [/document\.write\s*\(/, 'document.write()'],
  [/\.outerHTML\s*=/, 'outerHTML assignment'],
  [/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'],
  [/setTimeout\s*\(\s*['"`]/, 'setTimeout with a string body'],
  [/setInterval\s*\(\s*['"`]/, 'setInterval with a string body'],
];

async function walkSource(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkSource(full)));
    else if (/\.(ts|astro|mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const sourceFiles = await walkSource(join(ROOT, 'src'));
for (const file of sourceFiles) {
  const text = await readFile(file, 'utf8');
  // Strip comments so prose explaining why we avoid eval() is not a hit.
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*\*.*$/gm, '');
  for (const [pattern, label] of BANNED) {
    if (pattern.test(code)) {
      report('source', `${label} in ${file.replace(ROOT + '/', '')}`);
    }
  }
}

// ─── 2. Security headers ─────────────────────────────────────────────────

console.log('2. Checking security headers…');

const headers = await readFile(join(DIST, '_headers'), 'utf8').catch(() => '');
const REQUIRED_HEADERS = [
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy:',
  'X-Frame-Options: DENY',
  'Content-Security-Policy:',
  'Strict-Transport-Security:',
];
for (const h of REQUIRED_HEADERS) {
  if (!headers.includes(h)) report('headers', `Missing ${h}`);
}

// The CSP must not be trivially defeatable.
const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1] ?? '';
for (const directive of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"]) {
  if (!csp.includes(directive)) report('csp', `CSP is missing ${directive}`);
}
if (/script-src[^;]*\*/.test(csp)) report('csp', 'CSP script-src contains a wildcard');
if (/'unsafe-eval'/.test(csp)) report('csp', "CSP allows 'unsafe-eval'");

// ─── 3. Live XSS attempts against every tool ─────────────────────────────

console.log('3. Feeding XSS payloads to every tool…');

const toolsSrc = await readFile(join(ROOT, 'src/data/tools.ts'), 'utf8');
const slugs = [...toolsSrc.matchAll(/^\s{4}slug: '([a-z0-9-]+)',/gm)].map((m) => m[1]);

/**
 * Payloads chosen to survive different escaping mistakes: raw tags, attribute
 * breakouts, javascript: URLs, SVG handlers, and HTML-entity-encoded forms
 * that a decoder tool might turn back into live markup — that last case is the
 * realistic risk here, since several tools exist precisely to decode things.
 */
const PAYLOADS = [
  '<img src=x onerror="window.__xss=1">',
  '"><script>window.__xss=1</script>',
  "<svg onload=\"window.__xss=1\">",
  'javascript:window.__xss=1',
  '&lt;img src=x onerror=&quot;window.__xss=1&quot;&gt;',
  '&#60;script&#62;window.__xss=1&#60;/script&#62;',
  '{"<img src=x onerror=\'window.__xss=1\'>": "<svg onload=alert(1)>"}',
];

const { base, close } = await serveDist(DIST);
const browser = await chromium.launch();
const context = await browser.newContext();

// Any dialog at all means a payload executed.
let dialogFired = false;

for (const slug of slugs) {
  const page = await context.newPage();
  page.on('dialog', async (d) => {
    dialogFired = true;
    report('xss', `${slug}: a dialog opened — payload executed`);
    await d.dismiss().catch(() => {});
  });

  await page.goto(`${base}/tools/${slug}`, { waitUntil: 'load' });

  const root = page.locator(`[data-tool="${slug}"]`);
  if ((await root.count()) === 0) {
    await page.close();
    continue;
  }

  for (const payload of PAYLOADS) {
    const fields = await root.locator('textarea, input[type="text"], input:not([type])').all();
    if (!fields.length) break;

    for (const field of fields.slice(0, 2)) {
      await field.fill(payload).catch(() => {});
    }

    // Trigger whatever the tool does with input.
    const primary = root.locator('.bc-btn-primary:visible').first();
    if ((await primary.count()) > 0) await primary.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(120);

    const executed = await page.evaluate(() => Boolean(window.__xss));
    if (executed) {
      report('xss', `${slug}: payload executed — ${payload.slice(0, 50)}`);
      await page.evaluate(() => {
        delete window.__xss;
      });
    }

    // A payload that became live DOM is a finding even if it did not fire.
    const injected = await root.evaluate(() => {
      return Boolean(
        document.querySelector('[data-tool] img[src="x"]') ||
          document.querySelector('[data-tool] svg[onload]') ||
          document.querySelector('[data-tool] script'),
      );
    });
    if (injected) {
      report('xss', `${slug}: payload became live DOM — ${payload.slice(0, 50)}`);
    }
  }

  await page.close();
}

// ─── 4. Regex denial of service ──────────────────────────────────────────

console.log('4. Testing catastrophic backtracking containment…');

{
  const page = await context.newPage();
  await page.goto(`${base}/tools/regex-tester`, { waitUntil: 'load' });
  const root = page.locator('[data-tool="regex-tester"]');

  // The classic exponential pattern against an input that nearly matches.
  const patternField = root.locator('input, textarea').first();
  await patternField.fill('(a+)+$').catch(() => {});
  const testField = root.locator('textarea').first();
  await testField.fill('a'.repeat(40) + 'b').catch(() => {});

  const started = Date.now();
  // If the page is still responsive, this evaluate resolves quickly.
  const responsive = await Promise.race([
    page.evaluate(() => 'alive').then(() => true),
    new Promise((r) => setTimeout(() => r(false), 8000)),
  ]);
  const elapsed = Date.now() - started;

  if (!responsive) {
    report('redos', `Page became unresponsive after ${elapsed}ms with pattern (a+)+$`);
  } else {
    console.log(`   page stayed responsive (${elapsed}ms)`);
  }
  await page.close();
}

// ─── 5. Oversized input is refused, not hung ─────────────────────────────

console.log('5. Testing oversized input handling…');

{
  const page = await context.newPage();
  await page.goto(`${base}/tools/json-formatter`, { waitUntil: 'load' });
  const root = page.locator('[data-tool="json-formatter"]');

  // Above LIMITS.maxInputChars (2,000,000).
  await page.evaluate(() => {
    const el = document.querySelector('[data-tool="json-formatter"] [data-primary-input]');
    if (el) {
      el.value = '{"a":"' + 'x'.repeat(2_200_000) + '"}';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  const start = Date.now();
  await root.locator('.bc-btn-primary').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  const status = await root.locator('[data-status]').innerText().catch(() => '');
  const elapsed = Date.now() - start;

  if (!/limit|too large|over the/i.test(status)) {
    report('limits', `Oversized input was not refused with a message (status: "${status.slice(0, 80)}")`);
  } else {
    console.log(`   refused politely in ${elapsed}ms`);
  }
  await page.close();
}

await context.close();
await browser.close();
close();

// ─── Report ──────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(64));
if (findings.length === 0) {
  console.log(`No findings.
  - ${sourceFiles.length} source files scanned for dangerous patterns
  - ${slugs.length} tools × ${PAYLOADS.length} XSS payloads, none executed
  - security headers and CSP present and non-trivial
  - catastrophic backtracking contained
  - oversized input refused`);
  process.exit(0);
}

console.error(`${findings.length} finding(s):\n`);
for (const f of findings) console.error(`  [${f.area}] ${f.detail}`);
process.exit(1);
