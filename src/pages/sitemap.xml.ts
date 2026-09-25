import type { APIRoute } from 'astro';
import { SITE, LAUNCH_DATE } from '~/consts';
import { TOOLS } from '~/data/tools';
import { CATEGORIES } from '~/data/categories';

/**
 * Sitemap, generated from the registry.
 *
 * Deliberately hand-rolled rather than using an integration: it keeps
 * `lastmod` tied to each tool's `addedAt`, guarantees the canonical
 * (no-trailing-slash) form of every URL, and stays correct at 1,000 tools.
 */

interface Entry {
  loc: string;
  lastmod: string;
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: string;
}

function build(): Entry[] {
  const entries: Entry[] = [
    // Bare origin, no trailing slash, to match the homepage's own
    // <link rel="canonical"> and og:url exactly.
    { loc: '', lastmod: LAUNCH_DATE, changefreq: 'weekly', priority: '1.0' },
    { loc: '/tools', lastmod: LAUNCH_DATE, changefreq: 'weekly', priority: '0.9' },
  ];

  for (const c of CATEGORIES) {
    entries.push({
      loc: `/${c.slug}`,
      lastmod: LAUNCH_DATE,
      changefreq: 'weekly',
      priority: '0.8',
    });
  }

  for (const t of TOOLS) {
    entries.push({
      loc: `/tools/${t.slug}`,
      lastmod: t.addedAt,
      changefreq: 'monthly',
      priority: t.popular ? '0.8' : '0.7',
    });
  }

  for (const page of ['/about', '/contact', '/privacy', '/terms']) {
    entries.push({
      loc: page,
      lastmod: LAUNCH_DATE,
      changefreq: 'yearly',
      priority: '0.3',
    });
  }

  return entries;
}

export const GET: APIRoute = () => {
  const urls = build()
    .map(
      (e) => `  <url>
    <loc>${SITE.url}${e.loc === '/' ? '/' : e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
