#!/usr/bin/env node
/**
 * Post-build verification.
 *
 * Runs against dist/ after `astro build` and fails the build on anything that
 * would be embarrassing in production: a missing page, a broken internal link,
 * a duplicated <title>, a tool that rendered without its interface, a sitemap
 * that disagrees with what was actually generated, or a secret that leaked
 * into the output.
 *
 * Deliberately dependency-free so it runs identically in CI and locally.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const ORIGIN = 'https://bytecabin.dev';

const errors = [];
const warnings = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ─── Load the registry straight from source ──────────────────────────────
// Parsed rather than imported so this script stays plain Node with no
// TypeScript toolchain. The shapes we need are simple and stable.

const toolsSrc = await readFile(join(ROOT, 'src/data/tools.ts'), 'utf8');
const categoriesSrc = await readFile(join(ROOT, 'src/data/categories.ts'), 'utf8');

const toolSlugs = [...toolsSrc.matchAll(/^\s{4}slug: '([a-z0-9-]+)',/gm)].map((m) => m[1]);
const componentNames = [...toolsSrc.matchAll(/^\s{4}component: '([A-Za-z0-9]+)',/gm)].map(
  (m) => m[1],
);
const categorySlugs = [...categoriesSrc.matchAll(/^\s{4}slug: '([a-z0-9-]+)',/gm)].map((m) => m[1]);

if (toolSlugs.length === 0) fail('Could not parse any tool slugs from src/data/tools.ts');
if (categorySlugs.length === 0) fail('Could not parse any category slugs');

console.log(
  `Verifying ${toolSlugs.length} tools and ${categorySlugs.length} categories in dist/\n`,
);

// ─── Every declared component file exists ────────────────────────────────
for (const name of componentNames) {
  if (!existsSync(join(ROOT, 'src/tools', `${name}.astro`))) {
    fail(`Registry references src/tools/${name}.astro, which does not exist`);
  }
}

// ─── Map a site path to the file that serves it ──────────────────────────
function resolvePath(urlPath) {
  const clean = urlPath.split('#')[0].split('?')[0];
  if (clean === '/' || clean === '') return join(DIST, 'index.html');
  const noSlash = clean.replace(/\/$/, '');
  const candidates = [
    join(DIST, `${noSlash}.html`),
    join(DIST, noSlash, 'index.html'),
    join(DIST, noSlash),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

// ─── Collect the pages we expect ─────────────────────────────────────────
const expected = [
  '/',
  '/tools',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  ...categorySlugs.map((s) => `/${s}`),
  ...toolSlugs.map((s) => `/tools/${s}`),
];

for (const page of expected) {
  if (!resolvePath(page)) fail(`Missing page in dist: ${page}`);
}

for (const asset of ['404.html', 'robots.txt', 'sitemap.xml', 'search.json', 'favicon.svg', 'site.webmanifest', '_headers']) {
  if (!existsSync(join(DIST, asset))) fail(`Missing required file: dist/${asset}`);
}

// ─── Per-page HTML checks ────────────────────────────────────────────────
const titles = new Map();
const descriptions = new Map();

for (const page of expected) {
  const file = resolvePath(page);
  if (!file) continue;
  const html = await readFile(file, 'utf8');

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  const h1Count = (html.match(/<h1[\s>]/g) ?? []).length;

  if (!title) fail(`${page}: missing <title>`);
  if (!desc) fail(`${page}: missing meta description`);
  if (!canonical) fail(`${page}: missing canonical link`);
  if (h1Count === 0) fail(`${page}: no <h1>`);
  if (h1Count > 1) fail(`${page}: ${h1Count} <h1> elements, expected exactly 1`);

  // Canonical must be absolute, on the production origin, and match the page.
  const wantCanonical = page === '/' ? ORIGIN : `${ORIGIN}${page}`;
  if (canonical && canonical !== wantCanonical) {
    fail(`${page}: canonical is "${canonical}", expected "${wantCanonical}"`);
  }

  // Uniqueness of title and description across the whole site.
  if (title) {
    if (titles.has(title)) fail(`Duplicate <title> on ${page} and ${titles.get(title)}: "${title}"`);
    else titles.set(title, page);
  }
  if (desc) {
    if (descriptions.has(desc)) {
      fail(`Duplicate meta description on ${page} and ${descriptions.get(desc)}`);
    } else descriptions.set(desc, page);
  }

  // Description length is an SEO quality signal, not a hard failure.
  if (desc && (desc.length < 80 || desc.length > 175)) {
    warn(`${page}: meta description is ${desc.length} chars (aim for 140–160)`);
  }
  if (title && title.length > 70) {
    warn(`${page}: <title> is ${title.length} chars, Google truncates around 60`);
  }

  // Open Graph completeness.
  for (const prop of ['og:title', 'og:description', 'og:url', 'og:image']) {
    if (!html.includes(`property="${prop}"`)) fail(`${page}: missing ${prop}`);
  }

  // Tool pages must have actually rendered their interface and prose.
  if (page.startsWith('/tools/') && page !== '/tools') {
    const slug = page.slice('/tools/'.length);
    if (!html.includes(`data-tool="${slug}"`)) {
      fail(`${page}: tool interface did not render (no [data-tool="${slug}"])`);
    }
    if (!html.includes('What this tool does')) {
      warn(`${page}: no "What this tool does" section — explainer prose may be missing`);
    }
    // The privacy claim must appear on locally-processed tools.
    if (!html.includes('processed locally in your browser')) {
      warn(`${page}: local-processing note not rendered`);
    }
    // Structured data.
    if (!html.includes('"@type":"SoftwareApplication"')) {
      fail(`${page}: missing SoftwareApplication structured data`);
    }
    if (!html.includes('"@type":"BreadcrumbList"')) {
      fail(`${page}: missing BreadcrumbList structured data`);
    }
  }
}

// ─── Internal link integrity across every generated HTML file ────────────
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const htmlFiles = await walk(DIST);
const brokenLinks = new Set();

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const page = '/' + relative(DIST, file).replace(/\.html$/, '').replace(/\/index$/, '');

  for (const match of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    const href = match[1];
    // Skip non-page assets that legitimately have no HTML file.
    if (/\.(svg|png|ico|xml|txt|json|webmanifest|js|css|woff2?)$/.test(href)) {
      if (!existsSync(join(DIST, href))) brokenLinks.add(`${href}  (linked from ${page})`);
      continue;
    }
    if (!resolvePath(href)) brokenLinks.add(`${href}  (linked from ${page})`);
  }
}

for (const link of brokenLinks) fail(`Broken internal link: ${link}`);

// ─── Sitemap consistency ─────────────────────────────────────────────────
const sitemap = await readFile(join(DIST, 'sitemap.xml'), 'utf8').catch(() => '');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

for (const page of expected) {
  const want = page === '/' ? `${ORIGIN}/` : `${ORIGIN}${page}`;
  if (!sitemapUrls.includes(want)) fail(`Sitemap is missing ${want}`);
}
for (const url of sitemapUrls) {
  const path = url.replace(ORIGIN, '') || '/';
  if (!resolvePath(path)) fail(`Sitemap lists ${url}, which does not exist in dist/`);
  if (!url.startsWith(ORIGIN)) fail(`Sitemap URL is not on the canonical origin: ${url}`);
}
if (sitemapUrls.some((u) => u.endsWith('/') && u !== `${ORIGIN}/`)) {
  fail('Sitemap contains trailing-slash URLs, which do not match our canonical form');
}

// ─── robots.txt ──────────────────────────────────────────────────────────
const robots = await readFile(join(DIST, 'robots.txt'), 'utf8').catch(() => '');
if (!robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) {
  fail('robots.txt does not point at the sitemap');
}
if (/^Disallow: \/$/m.test(robots)) fail('robots.txt disallows the whole site');

// ─── Search index ────────────────────────────────────────────────────────
try {
  const index = JSON.parse(await readFile(join(DIST, 'search.json'), 'utf8'));
  if (index.length !== toolSlugs.length) {
    fail(`search.json has ${index.length} entries, expected ${toolSlugs.length}`);
  }
  for (const entry of index) {
    if (!resolvePath(`/tools/${entry.s}`)) fail(`search.json references missing tool ${entry.s}`);
    if (!entry.n || !entry.d) fail(`search.json entry ${entry.s} is missing name or description`);
  }
} catch (err) {
  fail(`search.json is not valid JSON: ${err.message}`);
}

// ─── Secret scanning on build output ─────────────────────────────────────
const SECRET_PATTERNS = [
  [/\bghp_[A-Za-z0-9]{36}\b/, 'GitHub personal access token'],
  [/\bgithub_pat_[A-Za-z0-9_]{60,}\b/, 'GitHub fine-grained token'],
  [/\bsk-[A-Za-z0-9]{32,}\b/, 'API secret key'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key ID'],
];

for (const file of htmlFiles) {
  const content = await readFile(file, 'utf8');
  for (const [pattern, label] of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      fail(`Possible ${label} found in ${relative(DIST, file)}`);
    }
  }
}

// ─── Weight budget ───────────────────────────────────────────────────────
const astroDir = join(DIST, '_astro');
if (existsSync(astroDir)) {
  let jsBytes = 0;
  for (const name of await readdir(astroDir)) {
    if (name.endsWith('.js')) jsBytes += (await stat(join(astroDir, name))).size;
  }
  console.log(`Total JavaScript across all tools: ${(jsBytes / 1024).toFixed(1)} KB (uncompressed)`);
}

// ─── Report ──────────────────────────────────────────────────────────────
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('\nBuild verification FAILED.');
  process.exit(1);
}

console.log(
  `\n✓ Verified ${expected.length} pages, ${htmlFiles.length} HTML files, ` +
    `${sitemapUrls.length} sitemap entries. No broken links, no duplicate metadata.`,
);
