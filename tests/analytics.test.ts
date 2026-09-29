import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANALYTICS_BEACON_TOKEN,
  GA_MEASUREMENT_ID,
  SITE_URL,
  SITE_DOMAIN,
  SITE_NAME,
} from '../site.config.mjs';

const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * Analytics configuration.
 *
 * Cloudflare Web Analytics recorded nothing for this site for some time while
 * looking completely healthy: the beacon was in the HTML with a plausible
 * token, so every visual check passed. Two separate causes, both silent —
 * the site record had no hostname, so collection POSTs 404'd, and the token
 * in use was `site_tag` rather than `site_token`, which are adjacent fields
 * of the same shape in the API response.
 *
 * The fix was to let Cloudflare inject the beacon at the edge, which means
 * the repository must NOT ship one. These tests pin that, because a token
 * pasted back into the config is an easy and invisible mistake — the page
 * would then carry two beacons and double-count every pageview.
 *
 * What cannot be tested here: whether collection actually succeeds. That
 * needs a real browser against production watching for a 204 on
 * /cdn-cgi/rum, which is what `npm run check:analytics` does.
 */
describe('analytics beacon configuration', () => {
  it('ships no beacon token — Cloudflare injects it at the edge', () => {
    expect(ANALYTICS_BEACON_TOKEN).toBe('');
  });

  it('hard-codes no beacon token anywhere in source', () => {
    // A Cloudflare site token is 32 lowercase hex characters. Catching the
    // shape rather than a specific value means a *different* wrong token
    // fails this too.
    for (const path of [
      'site.config.mjs',
      'src/consts.ts',
      'src/layouts/BaseLayout.astro',
      'public/_headers',
    ]) {
      const source = read(path);
      const inBeaconContext = source.match(/data-cf-beacon[^\n]*"([0-9a-f]{32})"/);
      expect(inBeaconContext, `${path} hard-codes a beacon token`).toBeNull();
    }
  });

  it('keeps the documented warning against setting the token', () => {
    // The comment is the only thing standing between a future reader and
    // re-adding the token that broke this. If it is deleted, so is the
    // reason, so the test asserts it survives.
    const config = read('site.config.mjs');
    expect(config).toMatch(/MUST STAY EMPTY/);
    expect(config).toMatch(/site_token/);
  });

  it('allows an env override for a non-Cloudflare deployment', () => {
    // The edge trick only works behind Cloudflare. Anywhere else needs the
    // tag, so the layout must still honour PUBLIC_CF_BEACON_TOKEN.
    expect(read('src/layouts/BaseLayout.astro')).toMatch(/PUBLIC_CF_BEACON_TOKEN/);
  });

  it('permits the beacon hosts in the Content-Security-Policy', () => {
    // An edge-injected beacon is still subject to our CSP. If script-src or
    // connect-src stops naming these, analytics dies silently again.
    const headers = read('public/_headers');
    expect(headers).toMatch(/script-src[^;]*static\.cloudflareinsights\.com/);
    expect(headers).toMatch(/connect-src[^;]*cloudflareinsights\.com/);
  });

  it('counts the analytics hosts as forbidden during the offline audit', () => {
    // The audit fails the build on any outbound request, which would flag the
    // beacon if it ever appeared locally. Those hosts are enumerated so the
    // ban stays specific rather than being switched off wholesale.
    const audit = read('scripts/audit-site.mjs');
    expect(audit).toMatch(/static\.cloudflareinsights\.com/);
    expect(audit).toMatch(/'cloudflareinsights\.com'/);
  });
});

/**
 * Google Analytics, in cookieless mode.
 *
 * The whole point of these is one flag. `client_storage: 'none'` is what
 * stops GA4 writing `_ga` and `_ga_<id>`, and two pages state plainly that
 * the site sets no cookies:
 *
 *   /privacy  "FindTool sets no cookies — not for analytics, not for anything."
 *   /about    "It sets no cookies and does not follow you between sites."
 *
 * Dropping the flag would falsify both and create a consent obligation in the
 * EU and UK — and it is a one-word edit that nothing else would catch. The
 * browser audit additionally fails if any page sets a cookie at all.
 */
describe('Google Analytics stays cookieless', () => {
  const layout = read('src/layouts/BaseLayout.astro');

  it('configures GA with client_storage set to none', () => {
    expect(layout, 'GA must not be allowed to write cookies').toContain("client_storage:'none'");
  });

  it('disables Google Signals and ad personalisation', () => {
    // Both re-enable cross-site identity, which /about says does not happen.
    expect(layout).toContain('allow_google_signals:false');
    expect(layout).toContain('allow_ad_personalization_signals:false');
  });

  it('emits nothing at all when no measurement ID is configured', () => {
    // Local builds and previews must not report into production numbers.
    expect(layout).toMatch(/gaId &&/);
  });

  it('names the GA hosts in the CSP, or the tag is blocked', () => {
    const headers = read('public/_headers');
    const csp = headers.match(/^\s*Content-Security-Policy:(.*)$/m)![1]!;
    expect(csp.match(/script-src ([^;]+);/)![1]).toContain('https://www.googletagmanager.com');
    const connect = csp.match(/connect-src ([^;]+);/)![1]!;
    expect(connect).toContain('https://www.google-analytics.com');
    expect(connect).toContain('https://region1.google-analytics.com');
  });

  it('counts the GA hosts as forbidden during the offline audit', () => {
    const audit = read('scripts/audit-site.mjs');
    expect(audit).toContain('www.googletagmanager.com');
    expect(audit).toContain('www.google-analytics.com');
  });

  it('fails the audit if any page sets a cookie', () => {
    // The behavioural half of the claim. Without this the flag could be
    // removed and only a human reading the config would notice.
    expect(read('scripts/audit-site.mjs')).toContain('page.context().cookies()');
  });

  it('keeps the measurement ID out of the repo until it is deliberately set', () => {
    // Not a secret — it ships in the HTML — but an ID committed by accident
    // sends development and preview traffic into the production property.
    expect(GA_MEASUREMENT_ID === '' || /^G-[A-Z0-9]{6,}$/.test(GA_MEASUREMENT_ID)).toBe(true);
  });

  it('documents why the flag cannot be removed', () => {
    expect(read('site.config.mjs')).toMatch(/client_storage/);
    expect(read('site.config.mjs')).toMatch(/sets no cookies/);
  });
});

describe('site identity', () => {
  it('uses the current brand everywhere it is derived from', () => {
    expect(SITE_NAME).toBe('FindTool');
    expect(SITE_DOMAIN).toBe('findtool.dev');
    expect(SITE_URL).toBe('https://findtool.dev');
  });

  it('has no trailing slash on the origin, which canonicals depend on', () => {
    expect(SITE_URL.endsWith('/')).toBe(false);
  });

  it('mentions the old brand name nowhere in the config', () => {
    expect(read('site.config.mjs')).not.toMatch(/bytecabin/i);
    expect(read('package.json')).not.toMatch(/bytecabin/i);
  });
});
