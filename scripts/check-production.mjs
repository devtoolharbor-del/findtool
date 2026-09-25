#!/usr/bin/env node
/**
 * Smoke-test the live site.
 *
 * Everything else in scripts/ runs against dist/. This one runs against
 * production, because a handful of things only exist there: the Pages
 * Function that renders the IP page, Cloudflare's redirect rules, the
 * security headers as actually served, and the edge-injected analytics
 * beacon.
 *
 * **The analytics beacon is blocked in every page this opens.** Driving
 * production in a browser otherwise records a pageview per navigation, and at
 * ~60 navigations a run that swamps the real numbers on a young site — it was
 * briefly 54% of all recorded visits. `npm run check:analytics` is the one
 * script that deliberately lets the beacon through, because proving
 * collection works is its entire job; two pageviews a run is a fair price.
 *
 *     npm run check:prod
 *     npm run check:prod -- https://some-preview.pages.dev
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { SITE_URL } from '../site.config.mjs';

const ORIGIN = process.argv[2] ?? SITE_URL;

/** Hosts whose requests are aborted so a check run records nothing. */
const BEACON_HOSTS = ['static.cloudflareinsights.com', 'cloudflareinsights.com'];

const problems = [];
const fail = (msg) => problems.push(msg);
const ok = (msg) => console.log(`  ✓ ${msg}`);

console.log(`Checking ${ORIGIN}\n`);

const browser = await chromium.launch();
const context = await browser.newContext();

// Applied at the context level so nothing opened here can leak a pageview.
await context.route('**/*', (route) => {
  let host = '';
  try {
    host = new URL(route.request().url()).hostname;
  } catch {
    /* non-URL scheme */
  }
  return BEACON_HOSTS.includes(host) ? route.abort() : route.continue();
});

// ─── Every URL in the sitemap resolves ───────────────────────────────────

const sitemap = await fetch(`${ORIGIN}/sitemap.xml`).then((r) => r.text());
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urls.length === 0) fail('sitemap.xml listed no URLs');

let broken = 0;
await Promise.all(
  urls.map(async (url) => {
    const res = await fetch(url, { redirect: 'manual' }).catch(() => null);
    if (!res || res.status !== 200) {
      fail(`${url} returned ${res ? res.status : 'no response'}`);
      broken++;
    }
  }),
);
if (broken === 0) ok(`${urls.length} sitemap URLs all return 200`);

// ─── Canonical host and retired URLs ─────────────────────────────────────

for (const [from, expect] of [
  [`http://${new URL(ORIGIN).hostname}/`, 301],
  [`https://www.${new URL(ORIGIN).hostname}/`, 301],
]) {
  const res = await fetch(from, { redirect: 'manual' }).catch(() => null);
  if (!res || res.status !== expect) {
    fail(`${from} returned ${res ? res.status : 'no response'}, expected ${expect}`);
  }
}
ok('http:// and www both redirect to the canonical host');

/*
  Anything in public/_redirects must still redirect rather than 404.

  Read from disk, not over HTTP: Cloudflare consumes _redirects as build
  configuration and does not serve it, so fetching it returns nothing and this
  check silently passed while verifying zero redirects.
*/
const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8').catch(
  () => '',
);
for (const line of redirects.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const [from, to] = t.split(/\s+/);
  const res = await fetch(`${ORIGIN}${from}`, { redirect: 'manual' }).catch(() => null);
  if (!res || res.status !== 301) fail(`retired ${from} returned ${res?.status}, expected 301`);
  else if (res.headers.get('location') !== to) {
    fail(`retired ${from} points at ${res.headers.get('location')}, expected ${to}`);
  }
}
if (redirects.trim()) ok('retired URLs still 301 to their replacements');

// ─── Security headers, as actually served ────────────────────────────────

const headers = (await fetch(ORIGIN)).headers;
for (const h of [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
]) {
  if (!headers.get(h)) fail(`missing header: ${h}`);
}
ok('security headers present');

// ─── Tool cards are the same size everywhere ─────────────────────────────
//
// The defect this catches is invisible on any single page: /tools renders one
// grid per category, so sections can size independently and only differ when
// compared side by side, at particular widths.

const WIDTHS = [1440, 1280, 1024, 820, 768, 640, 480, 390, 360];
const cardHeights = new Set();
const truncated = new Set();

for (const width of WIDTHS) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 1000 });
  for (const path of ['/tools', '/web', '/json', '/']) {
    await page.goto(ORIGIN + path, { waitUntil: 'networkidle' });
    const result = await page.evaluate(() => {
      const heights = [];
      const cut = [];
      for (const grid of document.querySelectorAll('.bc-tool-grid')) {
        for (const card of grid.children) {
          const href = card.getAttribute('href') ?? '';
          if (!href.startsWith('/tools/')) continue;
          heights.push(Math.round(card.getBoundingClientRect().height));
          for (const el of card.querySelectorAll('[class*="line-clamp"]')) {
            if (el.scrollHeight > el.clientHeight + 1) cut.push(href);
          }
        }
      }
      return { heights, cut };
    });
    result.heights.forEach((h) => cardHeights.add(`${width}:${h}`));
    result.cut.forEach((c) => truncated.add(c));
  }
  await page.close();
}

const perWidth = new Map();
for (const entry of cardHeights) {
  const [w, h] = entry.split(':');
  perWidth.set(w, (perWidth.get(w) ?? new Set()).add(h));
}
const uneven = [...perWidth].filter(([, hs]) => hs.size > 1);
if (uneven.length) {
  for (const [w, hs] of uneven) fail(`cards differ in height at ${w}px: ${[...hs].join(', ')}`);
} else {
  ok(`tool cards identical at every width from ${Math.min(...WIDTHS)}px up`);
}
if (truncated.size) fail(`descriptions truncated on: ${[...truncated].join(', ')}`);

// ─── The edge-rendered IP page ───────────────────────────────────────────

const ipPage = await context.newPage();
const outbound = new Set();
ipPage.on('request', (req) => {
  const host = new URL(req.url()).hostname;
  if (host !== new URL(ORIGIN).hostname) outbound.add(host);
});
await ipPage.goto(`${ORIGIN}/tools/what-is-my-ip`, { waitUntil: 'networkidle' });
await ipPage.waitForTimeout(7000);

const ip = await ipPage.evaluate(() => ({
  version: document.querySelector('[data-ip="version"]')?.textContent?.trim(),
  v4: document.querySelector('[data-ip="addressV4"]')?.textContent?.trim(),
  v6: document.querySelector('[data-ip="addressV6"]')?.textContent?.trim(),
}));

if (ip.version !== 'IPv4' && ip.version !== 'IPv6') {
  fail(`IP page did not render at the edge — version reads "${ip.version}"`);
} else {
  const looksV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip.v4 ?? '');
  const looksV6 = (ip.v6 ?? '').includes(':');
  // One comes from the edge and one from the lookup; a "No IPvN on this
  // network" message is a legitimate answer for the fetched one.
  if (!looksV4 && !/^No IPv4/.test(ip.v4 ?? '')) fail(`IPv4 row reads "${ip.v4}"`);
  if (!looksV6 && !/^No IPv6/.test(ip.v6 ?? '')) fail(`IPv6 row reads "${ip.v6}"`);
  ok(`IP page rendered at the edge (arrived over ${ip.version})`);
}

const ipHeaders = (await fetch(`${ORIGIN}/tools/what-is-my-ip`)).headers;
if (!/no-store/.test(ipHeaders.get('cache-control') ?? '')) {
  fail('IP page is cacheable — a cached copy is somebody else\'s address');
} else {
  ok('IP page is no-store');
}

const unexpected = [...outbound].filter(
  (h) =>
    !['ipv4.icanhazip.com', 'ipv6.icanhazip.com'].includes(h) &&
    // The request event fires before the route abort, so blocked beacon hosts
    // still appear here. They never left the browser.
    !BEACON_HOSTS.includes(h),
);
if (unexpected.length) fail(`unexpected outbound requests: ${unexpected.join(', ')}`);
else ok('no outbound requests beyond the documented IP lookup');

await ipPage.close();
await browser.close();

// ─── Report ──────────────────────────────────────────────────────────────

console.log();
if (problems.length) {
  console.error(`${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('✓ Production looks correct. No analytics recorded by this run.');
