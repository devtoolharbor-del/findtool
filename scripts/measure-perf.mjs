#!/usr/bin/env node
/**
 * Core Web Vitals measurement against the built site.
 *
 * Measures LCP, CLS and FCP in a real browser under simulated network and CPU
 * throttling, because unthrottled numbers on a local server are meaningless —
 * everything is instant when it is served from disk over loopback.
 *
 * Thresholds are Google's "good" boundaries. A regression past them fails the
 * run, so performance is a build gate rather than an aspiration.
 *
 * Usage: node scripts/measure-perf.mjs [--no-throttle]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const throttle = !process.argv.includes('--no-throttle');

// Google's "good" thresholds.
const BUDGET = {
  lcp: 2500, // ms
  cls: 0.1,
  fcp: 1800, // ms
  /**
   * Our own budget: compressed bytes over the wire for a cold visit, including
   * the 47 KB font. Cloudflare serves brotli, which is ~15% better than the
   * gzip used here, so production will come in under these figures.
   */
  transferKb: 120,
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  for (const candidate of [join(DIST, p), join(DIST, `${p}.html`)]) {
    if (existsSync(candidate) && extname(candidate)) {
      const raw = await readFile(candidate);
      const ext = extname(candidate);

      /**
       * Compress text responses, because Cloudflare does. Measuring raw bytes
       * would overstate real transfer by roughly 4x for HTML and JS and make
       * the budget meaningless. woff2 and png are already compressed, so they
       * are served as-is — exactly how a CDN treats them.
       */
      const compressible = ['.html', '.js', '.css', '.json', '.svg', '.xml', '.txt', '.webmanifest'].includes(ext);
      const accepts = (req.headers['accept-encoding'] ?? '').includes('gzip');
      const body = compressible && accepts ? gzipSync(raw, { level: 9 }) : raw;

      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Content-Length': body.length,
        ...(body !== raw ? { 'Content-Encoding': 'gzip' } : {}),
      });
      return res.end(body);
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end('not found');
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const PAGES = [
  '/',
  '/tools',
  '/json',
  '/tools/json-formatter',
  '/tools/regex-tester',
  '/tools/http-status-codes', // the heaviest page: 63 status codes server-rendered
];

const browser = await chromium.launch();
const results = [];

for (const path of PAGES) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Simulate a mid-tier mobile connection: Slow 4G plus 4× CPU slowdown,
  // which is roughly what Lighthouse's mobile profile applies.
  const cdp = await context.newCDPSession(page);
  if (throttle) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }

  let transfer = 0;
  page.on('response', async (res) => {
    const len = Number(res.headers()['content-length'] ?? 0);
    transfer += len;
  });

  /**
   * Observers must be installed before the document runs: LCP and layout-shift
   * entries are not reliably retrievable with getEntriesByType afterwards,
   * which is why an earlier version of this script reported an LCP of 0.
   */
  await page.addInitScript(() => {
    window.__vitals = { lcp: 0, cls: 0 };
    try {
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) window.__vitals.lcp = Math.round(last.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) window.__vitals.cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* older engines simply report zero */
    }
  });

  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });

  // Settle: give LCP and any late shifts a chance to be recorded.
  await page.waitForTimeout(throttle ? 2500 : 800);

  const vitals = await page.evaluate(() => {
    let fcp = 0;
    for (const e of performance.getEntriesByType('paint')) {
      if (e.name === 'first-contentful-paint') fcp = Math.round(e.startTime);
    }
    return {
      fcp,
      lcp: window.__vitals?.lcp ?? 0,
      cls: Math.round((window.__vitals?.cls ?? 0) * 1000) / 1000,
    };
  });

  results.push({ path, ...vitals, transferKb: Math.round(transfer / 1024) });
  await context.close();
}

await browser.close();
server.close();

// ─── Report ──────────────────────────────────────────────────────────────

console.log(
  throttle
    ? 'Throttled: Slow 4G (1.6 Mbps, 150ms RTT) + 4x CPU slowdown\n'
    : 'Unthrottled (local loopback)\n',
);
console.log('page                            LCP      CLS     FCP    transfer');
console.log('─'.repeat(70));

const failures = [];
for (const r of results) {
  const flag = (v, limit) => (v > limit ? '!' : ' ');
  console.log(
    `${r.path.padEnd(30)} ${String(r.lcp).padStart(5)}ms${flag(r.lcp, BUDGET.lcp)} ` +
      `${String(r.cls).padStart(6)}${flag(r.cls, BUDGET.cls)} ` +
      `${String(r.fcp).padStart(5)}ms${flag(r.fcp, BUDGET.fcp)} ` +
      `${String(r.transferKb).padStart(6)} KB${flag(r.transferKb, BUDGET.transferKb)}`,
  );
  if (r.lcp > BUDGET.lcp) failures.push(`${r.path}: LCP ${r.lcp}ms > ${BUDGET.lcp}ms`);
  if (r.cls > BUDGET.cls) failures.push(`${r.path}: CLS ${r.cls} > ${BUDGET.cls}`);
  if (r.fcp > BUDGET.fcp) failures.push(`${r.path}: FCP ${r.fcp}ms > ${BUDGET.fcp}ms`);
  if (r.transferKb > BUDGET.transferKb)
    failures.push(`${r.path}: ${r.transferKb} KB > ${BUDGET.transferKb} KB budget`);
}

console.log('─'.repeat(70));
console.log(
  `Budget: LCP < ${BUDGET.lcp}ms · CLS < ${BUDGET.cls} · FCP < ${BUDGET.fcp}ms · ` +
    `transfer < ${BUDGET.transferKb} KB`,
);

if (failures.length) {
  console.error(`\n${failures.length} budget breach(es):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n✓ All pages within budget.');
