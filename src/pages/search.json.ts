import type { APIRoute } from 'astro';
import { TOOLS } from '~/data/tools';
import { CATEGORY_MAP } from '~/data/categories';
import type { SearchEntry } from '~/lib/search';

/**
 * The search index, fetched once by the search dialog on first use.
 *
 * Field names are single letters because this file is downloaded by every
 * visitor who searches; at 50 tools it is roughly 8 KB before compression,
 * and it stays practical into the thousands. Popular tools come first so the
 * empty-query state can simply take the first six.
 */
export const GET: APIRoute = () => {
  const ordered = [...TOOLS].sort((a, b) => {
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
