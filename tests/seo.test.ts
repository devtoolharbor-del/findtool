import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLS, TOOL_MAP } from '~/data/tools';
import { CATEGORIES } from '~/data/categories';
import { SITE_URL } from '../site.config.mjs';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const read = (p: string) => readFileSync(p, 'utf8');

/**
 * SEO surfaces, checked against the built site.
 *
 * `npm run verify` covers a lot of this too, but it runs only as part of the
 * build pipeline. Having it here as well means `npm test` catches a broken
 * canonical or a sitemap that has drifted from the registry, and gives the
 * specific assertion that failed rather than a line in a long report.
 *
 * Skipped with a clear message when dist/ is absent, so a fresh clone running
 * `npm test` before `npm run build` is not confusing.
 */
const built = existsSync(join(DIST, 'index.html'));
const describeBuilt = built ? describe : describe.skip;

if (!built) {
  // eslint-disable-next-line no-console
  console.warn('tests/seo.test.ts: dist/ not found — run `npm run build` to include these.');
}

describeBuilt('sitemap', () => {
  const xml = () => read(join(DIST, 'sitemap.xml'));

  it('is well-formed and non-empty', () => {
    const s = xml();
    expect(s.startsWith('<?xml')).toBe(true);
    expect(s).toContain('<urlset');
    expect(s).toContain('</urlset>');
    expect((s.match(/<url>/g) ?? []).length).toBe((s.match(/<\/url>/g) ?? []).length);
  });

  it('lists every tool exactly once', () => {
    const s = xml();
    for (const tool of TOOLS) {
      const loc = `<loc>${SITE_URL}/tools/${tool.slug}</loc>`;
      expect((s.split(loc).length - 1), `${tool.slug} in sitemap`).toBe(1);
    }
  });

  it('lists every category', () => {
    const s = xml();
    for (const category of CATEGORIES) {
      expect(s, category.slug).toContain(`<loc>${SITE_URL}/${category.slug}</loc>`);
    }
  });

  it('lists the homepage and the index pages', () => {
    const s = xml();
    // The root is the one URL that keeps its trailing slash; everything else
    // is canonically slash-free.
    expect(s, 'homepage').toContain(`<loc>${SITE_URL}/</loc>`);
    for (const path of ['/tools', '/about', '/contact', '/privacy', '/terms']) {
      expect(s, path).toContain(`<loc>${SITE_URL}${path}</loc>`);
    }
  });

  it('never lists a URL that was retired', () => {
    // A redirected URL in the sitemap tells Google to crawl something that
    // 301s, which is a wasted crawl and a "page with redirect" in Search
    // Console rather than an indexed page.
    const redirects = read(join(ROOT, 'public/_redirects'));
    const s = xml();
    for (const line of redirects.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [from] = trimmed.split(/\s+/);
      expect(s, `${from} is retired but still in the sitemap`).not.toContain(
        `<loc>${SITE_URL}${from}</loc>`,
      );
    }
  });

  it('uses absolute canonical URLs with no trailing slash and no .html', () => {
    for (const match of xml().matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = match[1]!;
      expect(loc.startsWith(SITE_URL), loc).toBe(true);
      expect(loc.endsWith('.html'), loc).toBe(false);
      // Only the root may end in a slash.
      if (loc !== `${SITE_URL}/`) expect(loc.endsWith('/'), loc).toBe(false);
    }
  });

  it('gives every entry a valid lastmod', () => {
    for (const match of xml().matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      expect(match[1], match[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(match[1]!)), match[1]).toBe(false);
    }
  });

  it('agrees with the number of pages actually built', () => {
    const expected = TOOLS.length + CATEGORIES.length + 6; // + home, /tools, 4 legal pages
    expect((xml().match(/<url>/g) ?? []).length).toBe(expected);
  });
});

describeBuilt('robots.txt', () => {
  const txt = () => read(join(DIST, 'robots.txt'));

  it('allows crawling', () => {
    expect(txt()).toMatch(/User-agent:\s*\*/);
    expect(txt()).toMatch(/Allow:\s*\//);
  });

  it('points at the absolute sitemap URL', () => {
    expect(txt()).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it('blocks nothing by accident', () => {
    expect(txt()).not.toMatch(/^Disallow:\s*\/\s*$/m);
  });
});

describeBuilt('per-page metadata', () => {
  const pageFor = (slug: string) => read(join(DIST, 'tools', `${slug}.html`));

  it('gives every tool page a self-referencing canonical', () => {
    for (const tool of TOOLS) {
      const html = pageFor(tool.slug);
      expect(html, tool.slug).toContain(
        `<link rel="canonical" href="${SITE_URL}/tools/${tool.slug}">`,
      );
    }
  });

  it('gives every tool page exactly one h1', () => {
    for (const tool of TOOLS) {
      expect((pageFor(tool.slug).match(/<h1[\s>]/g) ?? []).length, tool.slug).toBe(1);
    }
  });

  it('renders the registry title and description into the head', () => {
    // Astro escapes entities on the way out, and the source strings already
    // contain some, so compare decoded values rather than raw substrings.
    const decode = (s: string) =>
      s
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');

    for (const tool of TOOLS) {
      const html = pageFor(tool.slug);
      const title = decode(html.match(/<title>([^<]*)<\/title>/)![1]!);
      const description = decode(
        html.match(/<meta name="description" content="([^"]*)"/)![1]!,
      );
      expect(title, `${tool.slug} title`).toBe(`${tool.seoTitle} — FindTool`);
      expect(description, `${tool.slug} description`).toBe(tool.seoDescription);
    }
  });

  it('gives every tool page complete Open Graph tags', () => {
    for (const tool of TOOLS) {
      const html = pageFor(tool.slug);
      for (const property of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) {
        expect(html, `${tool.slug} missing ${property}`).toContain(`property="${property}"`);
      }
    }
  });

  it('points og:image at a file that exists', () => {
    for (const tool of TOOLS) {
      const src = pageFor(tool.slug).match(/property="og:image" content="([^"]+)"/)?.[1];
      expect(src, `${tool.slug} og:image`).toBeTruthy();
      expect(src!.startsWith(SITE_URL), src).toBe(true);
      expect(existsSync(join(DIST, src!.slice(SITE_URL.length))), src).toBe(true);
    }
  });

  it('renders the tool interface server-side, so it works without JS', () => {
    for (const tool of TOOLS) {
      expect(pageFor(tool.slug), tool.slug).toContain(`data-tool="${tool.slug}"`);
    }
  });

  it('renders the explainer prose into the HTML rather than hydrating it', () => {
    for (const tool of TOOLS) {
      expect(pageFor(tool.slug), tool.slug).toContain('What this tool does');
    }
  });

  it('emits FAQPage structured data on every tool page', () => {
    for (const tool of TOOLS) {
      expect(pageFor(tool.slug), tool.slug).toContain('"@type":"FAQPage"');
    }
  });

  it('keeps .html out of breadcrumb URLs', () => {
    for (const tool of TOOLS) {
      const html = pageFor(tool.slug);
      const breadcrumbs = html.match(/"BreadcrumbList"[\s\S]*?<\/script>/)?.[0] ?? '';
      expect(breadcrumbs, tool.slug).not.toMatch(/\.html"/);
    }
  });
});

describeBuilt('the merged and retired pages', () => {
  it('no longer builds a page for the retired timestamp tool', () => {
    expect(existsSync(join(DIST, 'tools', 'current-unix-timestamp.html'))).toBe(false);
  });

  it('ships the _redirects file that covers it', () => {
    expect(existsSync(join(DIST, '_redirects'))).toBe(true);
    expect(read(join(DIST, '_redirects'))).toContain('/tools/current-unix-timestamp');
  });

  it('keeps the merged page reachable and carrying the old search intent', () => {
    const tool = TOOL_MAP['unix-timestamp-converter']!;
    expect(tool.keywords.join(' ')).toMatch(/current unix timestamp/);
    expect(tool.aliases).toContain('epoch now');
    expect(existsSync(join(DIST, 'tools', 'unix-timestamp-converter.html'))).toBe(true);
  });
});

describeBuilt('the edge-rendered IP page', () => {
  const html = () => read(join(DIST, 'tools', 'what-is-my-ip.html'));

  it('never claims local processing', () => {
    expect(html()).not.toContain('processed locally in your browser');
  });

  it('shows its own privacy wording instead', () => {
    expect(html()).toContain('built from the request your browser already made');
  });

  it('carries a placeholder for every key the edge function fills', () => {
    const fn = read(join(ROOT, 'functions/tools/what-is-my-ip.js'));
    const labels = fn.match(/const LABELS = \{([\s\S]*?)\n\};/)![1]!;
    const keys = [...labels.matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map((m) => m[1]!);
    const page = html();
    for (const key of keys) {
      expect(page, `no [data-ip="${key}"] for the function to fill`).toContain(`data-ip="${key}"`);
    }
  });

  it('still renders honestly when served as a plain static file', () => {
    // dist/ is what local dev and the audit serve, with no function in front.
    expect(html()).toContain('data-ip-fallback');
    // Astro re-wraps prose, so compare with whitespace collapsed.
    expect(html().replace(/\s+/g, ' ')).toContain('You are seeing the unfilled version');
  });
});
