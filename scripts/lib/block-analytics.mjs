/**
 * Stop a test run from being counted as real traffic.
 *
 * Every browser-driven script here must use this. The reason changed when
 * Google Analytics was added: the Cloudflare beacon is injected at the edge,
 * so a locally served `dist/` never carried it and local runs were harmless.
 * The GA tag is in the built HTML, so it fires from `dist/` too — and
 * cross-browser alone loads 51 tools in 3 engines, which would have put
 * ~150 fabricated pageviews into the property on every push.
 *
 * Aborting rather than tolerating also proves the pages work for visitors
 * running an ad blocker, which is a meaningful share of a developer audience.
 *
 * The deliberate exception is `scripts/check-analytics.mjs`, whose entire
 * purpose is proving collection works. Two pageviews a run is the price of
 * knowing the thing is alive.
 */

/** Analytics endpoints. Enumerated, so adding one is a reviewed edit. */
export const ANALYTICS_HOSTS = [
  'static.cloudflareinsights.com', // Cloudflare Web Analytics beacon script
  'cloudflareinsights.com', // its collection endpoint
  'www.googletagmanager.com', // gtag.js
  'www.google-analytics.com', // GA4 collection
  'region1.google-analytics.com', // GA4 regional collection
  'analytics.google.com',
];

/** Just the collection endpoints — the script itself is left alone. */
export const COLLECTION_HOSTS = [
  'cloudflareinsights.com',
  'www.google-analytics.com',
  'region1.google-analytics.com',
  'analytics.google.com',
];

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

export const isAnalytics = (url) => ANALYTICS_HOSTS.includes(hostOf(url));
export const isCollection = (url) => COLLECTION_HOSTS.includes(hostOf(url));

/**
 * Stop analytics requests for everything opened on `target`.
 *
 * Pass a BrowserContext rather than a Page where possible — a route on the
 * context covers pages opened later, which a per-page route silently does not.
 *
 * **Fulfilled with an empty 204 by default, not aborted.** An abort surfaces
 * as `Failed to load resource: net::ERR_FAILED` in the console, and the
 * suites that fail on any JavaScript error then fail on their own blocking.
 * A 204 is silent and equally unsent.
 *
 * `abort: true` restores the hard failure, which the browser audit wants: it
 * proves the pages still work for a visitor running an ad blocker, and that
 * suite already tolerates the console noise that comes with it.
 *
 * `collectionOnly` keeps the tag script loading while dropping the beacon —
 * for the perf script, which needs to measure what third-party JavaScript
 * costs without reporting a visit for the privilege.
 */
export async function blockAnalytics(target, { collectionOnly = false, abort = false } = {}) {
  const match = collectionOnly ? isCollection : isAnalytics;
  await target.route('**/*', (route) => {
    if (!match(route.request().url())) return route.continue();
    return abort ? route.abort() : route.fulfill({ status: 204, body: '' });
  });
}
