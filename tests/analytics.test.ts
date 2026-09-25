import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANALYTICS_BEACON_TOKEN, SITE_URL, SITE_DOMAIN, SITE_NAME } from '../site.config.mjs';

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
