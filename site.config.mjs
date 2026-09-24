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

export const SITE_NAME = 'FindTool';

/** Bare hostname, no scheme. Used for email addresses and display. */
export const SITE_DOMAIN = 'findtool.dev';

/** Canonical production origin. Every other host redirects here. */
export const SITE_URL = `https://${SITE_DOMAIN}`;

/**
 * Cloudflare Web Analytics beacon token.
 *
 * Deliberately EMPTY. findtool.dev is proxied through Cloudflare with
 * auto_install enabled, so Cloudflare injects the beacon at the edge with the
 * correct token and collection endpoint. Hardcoding our own beacon meant
 * Cloudflare skipped its injection and ours posted to an endpoint that
 * answered 404 — which the browser reports as a CORS failure, because a 404
 * carries no Access-Control-Allow-Origin header. The result was a beacon that
 * looked present in the HTML and recorded nothing.
 *
 * Set this only for a deployment that is NOT proxied through Cloudflare, and
 * use the `site_token` field from the API — not `site_tag`, which sits beside
 * it and looks identical.
 *
 * Public by design — it appears verbatim in every page's HTML and grants no
 * access; it only identifies which site a pageview belongs to. It lives here
 * rather than in a CI secret because a secret it is not, and because the
 * build must work for anyone who clones the repository.
 *
 * Cloudflare calls this the "site tag" for proxied domains and does not
 * present it as a snippet, which is why it has to be read from the API.
 *
 * Empty string disables analytics entirely — which is what happens on local
 * builds and previews, so development traffic never reaches production stats.
 */
export const ANALYTICS_BEACON_TOKEN = '';
