#!/usr/bin/env node
/**
 * IndexNow submission.
 *
 * Tells Bing, Yandex, Seznam and Naver that URLs have changed, instead of
 * waiting for them to re-crawl. Google does not participate, so this
 * supplements normal crawling — it never replaces it, and the sitemap
 * remains the primary signal.
 *
 * Usage:
 *   node scripts/submit-indexnow.mjs                 # submit every URL
 *   node scripts/submit-indexnow.mjs /tools/json-formatter /about
 *   node scripts/submit-indexnow.mjs --changed       # only URLs changed in HEAD
 *   node scripts/submit-indexnow.mjs --dry-run
 *
 * Requires INDEXNOW_KEY, which must match the file served at /<key>.txt.
 * Generate one with:  node -e "console.log(crypto.randomUUID().replace(/-/g,''))"
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { SITE_URL as ORIGIN } from '../site.config.mjs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The origin comes from site.config.mjs, the one place it is written down.
// This previously scraped src/consts.ts with a regex, which broke silently
// the moment that file started importing the value instead of literalising it.
const HOST = new URL(ORIGIN).host;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const changedOnly = args.includes('--changed');
const explicit = args.filter((a) => a.startsWith('/'));

const key = process.env.INDEXNOW_KEY;
if (!key && !dryRun) {
  console.error(
    'INDEXNOW_KEY is not set.\n' +
      'Generate one:  node -e "console.log(crypto.randomUUID().replace(/-/g,\'\'))"\n' +
      'Then save it as public/<key>.txt containing the key itself, and set the variable.',
  );
  process.exit(1);
}

/** Every indexable URL, derived from the same registry the sitemap uses. */
async function allUrls() {
  const sitemapPath = join(ROOT, 'dist/sitemap.xml');
  if (!existsSync(sitemapPath)) {
    console.error('dist/sitemap.xml not found — run `npm run build` first.');
    process.exit(1);
  }
  const xml = await readFile(sitemapPath, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

/**
 * URLs touched by the most recent commit.
 *
 * Submitting only what changed is the polite default for a routine deploy;
 * blasting all 50+ URLs on every push looks like spam to the endpoints.
 */
function changedUrls() {
  const files = execSync('git diff --name-only HEAD~1 HEAD', { cwd: ROOT })
    .toString()
    .split('\n')
    .filter(Boolean);

  const urls = new Set();
  for (const file of files) {
    const toolMatch = file.match(/^src\/tools\/(\w+)\.astro$/);
    if (toolMatch) {
      // Map the component back to its slug via the registry.
      const registry = execSync(`grep -B6 "component: '${toolMatch[1]}'" src/data/tools.ts`, {
        cwd: ROOT,
      }).toString();
      const slug = registry.match(/slug: '([a-z0-9-]+)'/)?.[1];
      if (slug) urls.add(`${ORIGIN}/tools/${slug}`);
      continue;
    }
    if (file === 'src/data/tools.ts' || file === 'src/data/categories.ts') {
      // A registry change can affect listings site-wide.
      urls.add(`${ORIGIN}/`);
      urls.add(`${ORIGIN}/tools`);
    }
    const pageMatch = file.match(/^src\/pages\/(about|contact|privacy|terms)\.astro$/);
    if (pageMatch) urls.add(`${ORIGIN}/${pageMatch[1]}`);
  }
  return [...urls];
}

const urls = explicit.length
  ? explicit.map((p) => `${ORIGIN}${p}`)
  : changedOnly
    ? changedUrls()
    : await allUrls();

if (!urls.length) {
  console.log('No URLs to submit.');
  process.exit(0);
}

console.log(`IndexNow: ${urls.length} URL(s) for ${HOST}`);
for (const u of urls.slice(0, 10)) console.log(`  ${u}`);
if (urls.length > 10) console.log(`  … and ${urls.length - 10} more`);

if (dryRun) {
  console.log('\n--dry-run: nothing submitted.');
  process.exit(0);
}

// api.indexnow.org fans the submission out to all participating engines,
// so one request is enough.
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key,
    keyLocation: `${ORIGIN}/${key}.txt`,
    urlList: urls,
  }),
});

// 200 = accepted, 202 = accepted but key validation still pending.
if (response.ok || response.status === 202) {
  console.log(`\nSubmitted. HTTP ${response.status}.`);
} else {
  const body = await response.text().catch(() => '');
  console.error(`\nSubmission failed: HTTP ${response.status} ${body}`);
  // A failed IndexNow ping is not worth failing a deploy over.
  process.exit(0);
}
