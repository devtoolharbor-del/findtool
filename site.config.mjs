/**
 * Brand and origin — the single place either is written down.
 *
 * Plain JavaScript on purpose: `astro.config.mjs` and the Node scripts under
 * `scripts/` cannot import TypeScript, so keeping this here is what lets the
 * build config, the build verifier, the social-card generator and the site
 * source all agree. `src/consts.ts` re-exports it for application code.
 *
 * Renaming the site is an edit to these three values and nothing else.
 * Everything derived — canonical URLs, the sitemap, Open Graph tags, contact
 * addresses, the verifier's expected origin — follows from them.
 */

export const SITE_NAME = 'ByteCabin';

/** Bare hostname, no scheme. Used for email addresses and display. */
export const SITE_DOMAIN = 'bytecabin.dev';

/** Canonical production origin. Every other host redirects here. */
export const SITE_URL = `https://${SITE_DOMAIN}`;
