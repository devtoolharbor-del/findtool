import type { APIRoute } from 'astro';
import { SITE } from '~/consts';

/**
 * robots.txt
 *
 * Everything is indexable — there is no private area and no duplicate content
 * to exclude, because canonical redirects collapse www/http at the edge.
 * Generated rather than static so the sitemap URL follows SITE.url.
 */
export const GET: APIRoute = () => {
  const body = `# ${SITE.name} — ${SITE.url}
User-agent: *
Allow: /

# No crawl-delay: the site is static and served from a CDN.

Sitemap: ${SITE.url}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
