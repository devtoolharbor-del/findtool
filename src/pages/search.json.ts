import type { APIRoute } from 'astro';
import { TOOLS } from '~/data/tools';
import { CATEGORY_MAP } from '~/data/categories';
import { featuredRank } from '~/data/featured';
import type { SearchEntry } from '~/lib/search';

/**
 * The search index, fetched once by the search dialog on first use.
 *
 * Field names are single letters because this file is downloaded by every
 * visitor who searches; at 50 tools it was roughly 8 KB before compression,
 * and it stays practical into the thousands. Popular tools come first so the
 * empty-query state can simply take the first six.
 */
export const GET: APIRoute = () => {
  /*
    The dialog shows the first six entries when the query is empty, so the
    head of this file is a curated list rather than an accident of sorting.

    Featured tools lead, in the order chosen in src/data/featured.ts, so the
    empty state matches the homepage shortcuts exactly. Popular tools follow,
    then everything else. Alphabetical is only the final tie-break — using it
    as the primary sort is what previously opened the dialog with Base64
    Decoder and Color Converter.
  */
  const ordered = [...TOOLS].sort((a, b) => {
    const rank = featuredRank(a.slug) - featuredRank(b.slug);
    if (rank !== 0 && Number.isFinite(Math.min(featuredRank(a.slug), featuredRank(b.slug)))) {
      return rank;
    }
    if (!!a.popular !== !!b.popular) return a.popular ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const index: SearchEntry[] = ordered.map((t) => ({
    s: t.slug,
    n: t.name,
    d: t.description,
    c: CATEGORY_MAP[t.category]?.shortName ?? '',
    cs: t.category,
    k: [...t.keywords, ...t.aliases, t.category].join(' ').toLowerCase(),
    i: t.icon,
  }));

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
};
