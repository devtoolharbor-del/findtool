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
 * MUST STAY EMPTY for findtool.dev.
 *
 * Real User Measurements is enabled for the hostname on the proxied zone, so
 * Cloudflare injects the beacon itself at the edge with the correct token and
 * endpoint. A token here would add a SECOND beacon to the HTML and
 * double-count every pageview.
 *
 * Two traps, both hit in practice and both silent:
 *
 * 1. A site record created without a hostname does not recognise its own
 *    token. Every collection POST answers 404, and because a 404 carries no
 *    Access-Control-Allow-Origin header the browser reports it as a CORS
 *    error. The beacon sits in the HTML looking perfectly correct and records
 *    nothing at all. Enabling RUM for the hostname is what binds them.
 *
 * 2. The API exposes `site_tag` and `site_token` side by side and they look
 *    identical. The beacon needs `site_token`.
 *
 * Verify any change by watching the POST to /cdn-cgi/rum in a real browser:
 * 204 means accepted. The script tag being present proves nothing — that is
 * precisely how a completely dead beacon went unnoticed.
 *
 * Note the edge injection only happens for browser-shaped requests. A bare
 * `curl` sees no beacon and looks broken; add a browser User-Agent and
 * `Accept: text/html` to see it.
 *
 * Set this only for a deployment NOT proxied through Cloudflare.
 */
export const ANALYTICS_BEACON_TOKEN = '';

/**
 * Google Analytics 4 measurement ID, e.g. 'G-XXXXXXXXXX'.
 *
 * Empty disables GA entirely — no script, no requests. That is the correct
 * value for local development and preview builds, so they never pollute
 * production numbers.
 *
 * **GA runs here in cookieless mode and must stay that way.** The site states
 * in two places that it sets no cookies:
 *
 *   /privacy  "FindTool sets no cookies — not for analytics, not for anything."
 *   /about    "It sets no cookies and does not follow you between sites."
 *
 * Consent Mode is what keeps those true: `analytics_storage: 'denied'`, set
 * before the config call, makes GA send cookieless pings instead of writing
 * `_ga` and `_ga_<id>`. Remove it and both sentences become false, and EU/UK
 * visitors need a consent banner before the script may load at all.
 *
 * Note the mechanism, because the obvious one is wrong: `client_storage:
 * 'none'` is a Universal Analytics parameter that GA4 accepts and silently
 * ignores. It was tried first and caught writing both cookies in testing.
 * tests/analytics.test.ts pins the consent call, and the browser audit fails
 * if any page sets a cookie — the check that actually found this.
 *
 * The cost of cookieless, so nobody is surprised by the reports: there is no
 * persistent client ID, so every pageview counts as a new user. Pageviews,
 * referrers, landing pages and geography are trustworthy; users, sessions and
 * retention are not. Cloudflare Web Analytics remains the source for visit
 * counts.
 *
 * A measurement ID is not a secret — it ships in the HTML of every page that
 * uses it.
 */
export const GA_MEASUREMENT_ID = 'G-1Z84JFQJPV';
