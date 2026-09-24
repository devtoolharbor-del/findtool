import type { APIRoute } from 'astro';
import { SITE } from '~/consts';

/**
 * Web app manifest, generated rather than static.
 *
 * It lived in public/ as hand-written JSON and was missed by the rebrand,
 * so an installed icon still carried the old name long after every page had
 * changed. Deriving it from SITE means the name can only ever be wrong in
 * one place, and that place is checked by the build.
 */
export const GET: APIRoute = () => {
  const manifest = {
    name: `${SITE.name} — Developer Tools`,
    short_name: SITE.name,
    description: SITE.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: SITE.themeColorLight,
    theme_color: '#0f766e',
    categories: ['developer', 'utilities', 'productivity'],
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
