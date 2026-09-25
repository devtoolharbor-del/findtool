import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TOOLS,
  TOOL_MAP,
  toolsInCategory,
  popularTools,
  allToolsSorted,
} from '~/data/tools';
import { CATEGORIES, CATEGORY_MAP } from '~/data/categories';
import { FEATURED, featuredRank } from '~/data/featured';
import { faqFor } from '~/data/faqs';

const ROOT = join(import.meta.dirname, '..');

/**
 * Invariants of the tool registry.
 *
 * `npm run verify` checks most of this too, but only against a finished
 * build. These run in milliseconds with no build step, so a broken registry
 * fails on save rather than three minutes later — and they cover ordering
 * rules that a built page cannot express.
 */

describe('registry integrity', () => {
  it('has a unique slug per tool', () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses URL-safe slugs', () => {
    for (const tool of TOOLS) {
      expect(tool.slug, tool.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('points every tool at a component file that exists', () => {
    for (const tool of TOOLS) {
      const path = join(ROOT, 'src/tools', `${tool.component}.astro`);
      expect(existsSync(path), `${tool.slug} → ${tool.component}.astro`).toBe(true);
    }
  });

  it('leaves no orphaned component files behind', () => {
    // A tool removed from the registry but left on disk still ships its code.
    // This is how the merged Current Unix Timestamp could have lingered.
    const declared = new Set(TOOLS.map((t) => `${t.component}.astro`));
    const onDisk = readFileSync(join(ROOT, 'package.json'), 'utf8') && // keep fs import honest
      require('node:fs').readdirSync(join(ROOT, 'src/tools'));
    for (const file of onDisk as string[]) {
      expect(declared.has(file), `src/tools/${file} is not referenced by any tool`).toBe(true);
    }
  });

  it('assigns every tool to a real category', () => {
    for (const tool of TOOLS) {
      expect(CATEGORY_MAP[tool.category], `${tool.slug} → ${tool.category}`).toBeDefined();
    }
  });

  it('resolves every related slug', () => {
    for (const tool of TOOLS) {
      for (const slug of tool.related) {
        expect(TOOL_MAP[slug], `${tool.slug} relates to missing ${slug}`).toBeDefined();
      }
    }
  });

  it('never relates a tool to itself', () => {
    for (const tool of TOOLS) {
      expect(tool.related, tool.slug).not.toContain(tool.slug);
    }
  });

  it('leaves no tool without an inbound related link', () => {
    /*
      `related` is the internal link graph. A tool nobody links to is
      reachable only from its category page and /tools, which is the weakest
      possible internal signal and makes it the last thing crawled.

      Lorem Ipsum Generator sat at zero, and the two newest tools — the ones
      with the highest search intent — sat at one apiece because they only
      pointed at each other. Adding a tool does not automatically get it
      linked; something existing has to point at it.
    */
    const inbound = new Map(TOOLS.map((t) => [t.slug, 0]));
    for (const tool of TOOLS) {
      for (const slug of tool.related) inbound.set(slug, (inbound.get(slug) ?? 0) + 1);
    }
    const orphans = [...inbound].filter(([, n]) => n === 0).map(([slug]) => slug);
    expect(orphans, 'no other tool links to these').toEqual([]);
  });

  it('gives every tool a unique SEO title and description', () => {
    const titles = TOOLS.map((t) => t.seoTitle);
    const descriptions = TOOLS.map((t) => t.seoDescription);
    expect(new Set(titles).size, 'duplicate seoTitle').toBe(titles.length);
    expect(new Set(descriptions).size, 'duplicate seoDescription').toBe(descriptions.length);
  });

  /*
    Bounds below match the ones scripts/verify-build.mjs enforces against the
    built pages, so the two cannot disagree about what "too long" means. The
    ideal is tighter — roughly 140–160 for a description and 60 for a rendered
    title, which is where Google starts truncating — and verify warns from
    there. These are the hard floor and ceiling.
  */
  it('keeps meta descriptions within the length verify-build enforces', () => {
    for (const tool of TOOLS) {
      expect(tool.seoDescription.length, `${tool.slug} description`).toBeGreaterThanOrEqual(80);
      expect(tool.seoDescription.length, `${tool.slug} description`).toBeLessThanOrEqual(175);
    }
  });

  it('keeps rendered titles within the length verify-build enforces', () => {
    // The layout appends " — FindTool", so the budget covers the title plus that.
    for (const tool of TOOLS) {
      expect(`${tool.seoTitle} — FindTool`.length, `${tool.slug} title`).toBeLessThanOrEqual(70);
    }
  });

  it('gives every tool searchable keywords and aliases', () => {
    for (const tool of TOOLS) {
      expect(tool.keywords.length, tool.slug).toBeGreaterThan(0);
      expect(tool.aliases.length, tool.slug).toBeGreaterThan(0);
    }
  });

  it('dates every tool', () => {
    for (const tool of TOOLS) {
      expect(tool.addedAt, tool.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('privacy claims', () => {
  it('never attaches privacyNote to a server-processing tool', () => {
    // privacyNote is appended to the standard local-processing claim, which a
    // server-processing tool never renders — the sentence would vanish.
    for (const tool of TOOLS) {
      if (tool.serverProcessing) {
        expect(tool.privacyNote, `${tool.slug} must use privacyNoteOverride`).toBeUndefined();
      }
    }
  });

  it('gives every server-processing tool bespoke wording', () => {
    for (const tool of TOOLS.filter((t) => t.serverProcessing)) {
      expect(tool.privacyNoteOverride, `${tool.slug} needs a privacy note of its own`).toBeTruthy();
      expect(tool.privacyNoteOverride).not.toMatch(/processed locally in your browser/);
    }
  });

  it('has exactly one server-processing tool, and it is the IP page', () => {
    // Not a style rule: "everything runs client-side" is on the homepage, the
    // about page and the launch copy. A second one appearing silently would
    // make those untrue.
    const server = TOOLS.filter((t) => t.serverProcessing).map((t) => t.slug);
    expect(server).toEqual(['what-is-my-ip']);
  });

  it('backs the one server-processing tool with an actual edge function', () => {
    for (const tool of TOOLS.filter((t) => t.serverProcessing)) {
      const fn = join(ROOT, 'functions', 'tools', `${tool.slug}.js`);
      expect(existsSync(fn), `functions/tools/${tool.slug}.js`).toBe(true);
    }
  });
});

describe('ordering', () => {
  it('leads Web & Dev with What Is My IP, then the subnet calculator', () => {
    const web = toolsInCategory('web').map((t) => t.slug);
    expect(web[0]).toBe('what-is-my-ip');
    expect(web[1]).toBe('subnet-calculator');
  });

  it('leads Date & Time with the timestamp converter', () => {
    expect(toolsInCategory('time')[0]!.slug).toBe('unix-timestamp-converter');
  });

  it('sorts a category by order, then alphabetically', () => {
    for (const category of CATEGORIES) {
      const tools = toolsInCategory(category.id);
      const ordered = tools.filter((t) => t.order !== undefined).map((t) => t.order!);
      expect([...ordered].sort((a, b) => a - b), category.id).toEqual(ordered);
    }
  });

  it('gives no two tools in a category the same order', () => {
    for (const category of CATEGORIES) {
      const orders = toolsInCategory(category.id)
        .map((t) => t.order)
        .filter((o): o is number => o !== undefined);
      expect(new Set(orders).size, `${category.id} has duplicate order values`).toBe(orders.length);
    }
  });

  it('puts every tool in some category', () => {
    const placed = CATEGORIES.flatMap((c) => toolsInCategory(c.id));
    expect(placed.length).toBe(TOOLS.length);
  });

  it('sorts allToolsSorted alphabetically', () => {
    const names = allToolsSorted().map((t) => t.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });
});

describe('featured tools', () => {
  it('points every featured slug at a real tool', () => {
    for (const entry of FEATURED) {
      expect(TOOL_MAP[entry.slug], `featured: ${entry.slug}`).toBeDefined();
    }
  });

  it('leads with What Is My IP', () => {
    expect(FEATURED[0]!.slug).toBe('what-is-my-ip');
    expect(featuredRank('what-is-my-ip')).toBe(0);
  });

  it('lists each tool once', () => {
    const slugs = FEATURED.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps labels short enough for one row on desktop', () => {
    for (const entry of FEATURED) {
      expect(entry.label.length, entry.label).toBeLessThanOrEqual(16);
    }
  });

  it('reports Infinity for a tool that is not featured', () => {
    expect(featuredRank('css-minifier')).toBe(Number.POSITIVE_INFINITY);
  });

  it('orders popularTools by the featured list first', () => {
    // The homepage shortcut row, the Most used grid and the footer all read
    // from this. They used to disagree because it returned array order.
    const popular = popularTools(8).map((t) => t.slug);
    expect(popular[0]).toBe('what-is-my-ip');

    const featuredInPopular = popular.filter((s) => featuredRank(s) !== Infinity);
    const ranks = featuredInPopular.map((s) => featuredRank(s));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('only returns tools actually marked popular', () => {
    for (const tool of popularTools(20)) {
      expect(tool.popular, tool.slug).toBe(true);
    }
  });

  it('respects the limit', () => {
    expect(popularTools(3)).toHaveLength(3);
  });
});

describe('FAQs', () => {
  it('gives every tool at least two, which the structured data needs', () => {
    for (const tool of TOOLS) {
      expect(faqFor(tool.slug).length, `${tool.slug} FAQs`).toBeGreaterThanOrEqual(2);
    }
  });

  it('has no empty entries', () => {
    // A stray comma in the source array produces a hole, which reached the
    // build once and crashed the verifier rather than being reported.
    for (const tool of TOOLS) {
      for (const entry of faqFor(tool.slug)) {
        expect(entry, `${tool.slug} has an empty FAQ entry`).toBeTruthy();
        expect(entry.q?.trim(), tool.slug).toBeTruthy();
        expect(entry.a?.trim(), tool.slug).toBeTruthy();
      }
    }
  });

  it('keeps markup out of questions, which breaks FAQPage validation', () => {
    for (const tool of TOOLS) {
      for (const entry of faqFor(tool.slug)) {
        expect(entry.q, `${tool.slug}: ${entry.q}`).not.toMatch(/<[a-z]/i);
      }
    }
  });

  it('carries no FAQs for tools that no longer exist', () => {
    const slugs = new Set(TOOLS.map((t) => t.slug));
    const source = readFileSync(join(ROOT, 'src/data/faqs/time.ts'), 'utf8');
    for (const match of source.matchAll(/^ {2}'([a-z0-9-]+)': \[/gm)) {
      expect(slugs.has(match[1]!), `orphaned FAQ block: ${match[1]}`).toBe(true);
    }
  });
});

describe('retired URLs', () => {
  const redirects = readFileSync(join(ROOT, 'public/_redirects'), 'utf8');

  it('redirects the merged Current Unix Timestamp page', () => {
    // It was indexed. Letting it 404 discards its ranking instead of passing
    // it to the page that absorbed it.
    expect(redirects).toMatch(
      /^\/tools\/current-unix-timestamp\s+\/tools\/unix-timestamp-converter\s+301$/m,
    );
  });

  it('never redirects to a URL that does not exist', () => {
    for (const line of redirects.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [, to] = trimmed.split(/\s+/);
      const slug = to?.replace(/^\/tools\//, '');
      if (to?.startsWith('/tools/')) {
        expect(TOOL_MAP[slug!], `redirect target ${to} does not exist`).toBeDefined();
      }
    }
  });

  it('never redirects away from a slug that is still live', () => {
    for (const line of redirects.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [from] = trimmed.split(/\s+/);
      if (from?.startsWith('/tools/')) {
        const slug = from.replace(/^\/tools\//, '');
        expect(TOOL_MAP[slug], `${from} both redirects and exists`).toBeUndefined();
      }
    }
  });
});

describe('categories', () => {
  it('has a unique id and slug per category', () => {
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
    expect(new Set(CATEGORIES.map((c) => c.slug)).size).toBe(CATEGORIES.length);
  });

  it('never collides a category slug with a tool slug', () => {
    // Categories live at the root (/web), tools under /tools/, but a clash
    // would still be confusing in search and in the nav.
    const toolSlugs = new Set(TOOLS.map((t) => t.slug));
    for (const category of CATEGORIES) {
      expect(toolSlugs.has(category.slug), category.slug).toBe(false);
    }
  });

  it('leaves no category empty', () => {
    for (const category of CATEGORIES) {
      expect(toolsInCategory(category.id).length, category.id).toBeGreaterThan(0);
    }
  });
});
