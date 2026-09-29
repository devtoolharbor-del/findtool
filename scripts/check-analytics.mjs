#!/usr/bin/env node
/**
 * Prove that analytics is actually recording, against live production.
 *
 * This exists because analytics on this site was dead for some time while
 * looking perfect. The beacon script was in the HTML with a plausible token,
 * so every inspection passed. It was recording nothing: the site record had
 * been created without a hostname, so each collection POST answered 404, and
 * a 404 carries no Access-Control-Allow-Origin header, which the browser
 * reports as a CORS error rather than as a 404.
 *
 * The lesson, and the reason this script drives a real browser rather than
 * fetching HTML: **the script tag being present proves nothing.** Only a
 * successful collection response does. So this waits for the actual POST to
 * /cdn-cgi/rum and checks its status.
 *
 * Not part of `npm run ci` — it needs the public internet and tests the
 * deployed site rather than the build. Run it after a deploy, or whenever
 * the numbers look wrong:
 *
 *     npm run check:analytics
 *     npm run check:analytics -- https://some-preview.pages.dev
 */

import { chromium } from 'playwright';
import { SITE_URL } from '../site.config.mjs';

const target = process.argv[2] ?? SITE_URL;
const TIMEOUT_MS = 15000;

console.log(`Checking Cloudflare Web Analytics on ${target}\n`);

const browser = await chromium.launch();
// A real browser User-Agent matters: Cloudflare only injects the beacon for
// browser-shaped requests, so a bare fetch sees no beacon and looks broken.
const context = await browser.newContext();
const page = await context.newPage();

/** Every collection attempt the page makes, with the status it got back. */
const collections = [];
let beaconScript = null;

/** Google Analytics collection hits, and whether it wrote any cookie. */
const gaHits = [];

page.on('response', (response) => {
  const url = response.url();
  if (url.includes('/cdn-cgi/rum') || url.includes('cloudflareinsights.com/cdn-cgi/rum')) {
    collections.push({ url, status: response.status() });
  }
  // GA4 reports via /g/collect on either host.
  if (/google-analytics\.com\/(g\/)?collect/.test(url)) {
    gaHits.push({ status: response.status() });
  }
});

page.on('requestfailed', (request) => {
  if (request.url().includes('/cdn-cgi/rum')) {
    collections.push({ url: request.url(), status: 'FAILED', error: request.failure()?.errorText });
  }
});

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await page.goto(target, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });

beaconScript = await page.evaluate(() => {
  const el = document.querySelector('script[data-cf-beacon], script[src*="cloudflareinsights"]');
  if (!el) return null;
  return { src: el.getAttribute('src'), beacon: el.getAttribute('data-cf-beacon') };
});

// The beacon posts after load; give it a moment rather than racing it.
await page.waitForTimeout(3000);

// A second navigation, because some beacon versions only report on unload.
await page.goto(`${target}/tools`, { waitUntil: 'networkidle', timeout: TIMEOUT_MS }).catch(() => {});
await page.waitForTimeout(2000);

await browser.close();

// ─── Report ──────────────────────────────────────────────────────────────

const problems = [];

if (!beaconScript) {
  problems.push(
    'No beacon script in the page. Cloudflare injects it at the edge when Real ' +
      'User Measurements is enabled for the hostname — check that it still is, ' +
      'under Analytics & Logs → Web Analytics.',
  );
} else {
  console.log(`Beacon script present: ${beaconScript.src ?? '(inline)'}`);
  const token = beaconScript.beacon?.match(/"token":\s*"([0-9a-f]+)"/)?.[1];
  if (token) console.log(`Beacon token:          ${token.slice(0, 8)}… (${token.length} chars)`);
}

if (collections.length === 0) {
  problems.push(
    'The beacon never posted to /cdn-cgi/rum. Presence of the script is not ' +
      'evidence of anything — this is exactly the failure that went unnoticed ' +
      'before.',
  );
} else {
  console.log(`\nCollection attempts: ${collections.length}`);
  for (const c of collections) {
    const ok = c.status === 204 || c.status === 200;
    console.log(`  ${ok ? '✓' : '✗'} ${c.status}${c.error ? ` — ${c.error}` : ''}`);
    if (!ok) {
      problems.push(
        `Collection POST answered ${c.status}${c.error ? ` (${c.error})` : ''}. ` +
          'A 404 here means the site record has no hostname bound to it, which ' +
          'surfaces in the browser as a CORS error rather than as a 404.',
      );
    }
  }
}

const corsErrors = consoleErrors.filter((e) => /cors|cloudflareinsights/i.test(e));
if (corsErrors.length > 0) {
  problems.push(`Console reported: ${corsErrors[0]}`);
}

// ─── Google Analytics ────────────────────────────────────────────────────

const gaConfigured = await page
  .evaluate(() => !!document.querySelector('script[src*="googletagmanager.com/gtag/js"]'))
  .catch(() => false);

if (!gaConfigured) {
  console.log('\nGoogle Analytics: not configured (no measurement ID set)');
} else {
  console.log(`\nGA collection hits: ${gaHits.length}`);
  for (const h of gaHits) {
    const good = h.status === 200 || h.status === 204;
    console.log(`  ${good ? '✓' : '✗'} ${h.status}`);
    if (!good) problems.push(`GA collect returned ${h.status}`);
  }
  if (gaHits.length === 0) {
    problems.push(
      'GA tag is on the page but never reported. The tag being present proves ' +
        'nothing — that is exactly how the Cloudflare beacon went unnoticed.',
    );
  }

  /*
    The claim that actually matters. /privacy and /about both say the site
    sets no cookies, which holds only while GA runs with
    client_storage: 'none'. Checked here against the live site rather than
    against the config, because the config is not what visitors get.
  */
  const cookies = await context.cookies();
  if (cookies.length > 0) {
    problems.push(
      `GA set ${cookies.length} cookie(s) — /privacy and /about both state none: ` +
        cookies.map((c) => c.name).join(', '),
    );
  } else {
    console.log('  ✓ no cookies set');
  }
}

console.log();
if (problems.length > 0) {
  console.error('Analytics is NOT recording:\n');
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  process.exit(1);
}

console.log('✓ Analytics is recording — the beacon posted and was accepted.');
