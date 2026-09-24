/**
 * Global, build-time site configuration for ByteCabin.
 *
 * Nothing secret belongs in this file — it is compiled into the public bundle.
 * Secrets live in environment variables / GitHub Actions secrets (see README).
 */

import { SITE_NAME, SITE_DOMAIN, SITE_URL } from '../site.config.mjs';

export const SITE = {
  name: SITE_NAME,
  /** Canonical production origin. Every other host redirects here. */
  url: SITE_URL,
  domain: SITE_DOMAIN,
  tagline: 'Fast, private developer tools',
  description:
    'A fast, ad-light collection of developer utilities — JSON, encoding, hashing, time, text and web tools that run entirely in your browser.',
  locale: 'en',
  lang: 'en-US',
  /** Default social preview image, generated at build time into /og.png. */
  ogImage: '/og.png',
  themeColorLight: '#fbfbfa',
  themeColorDark: '#0c0a09',
} as const;

export const CONTACT = {
  general: `contact@${SITE_DOMAIN}`,
  support: `support@${SITE_DOMAIN}`,
  privacy: `privacy@${SITE_DOMAIN}`,
} as const;

export const REPO_URL = 'https://github.com/devtoolharbor-del/bytecabin';

/**
 * Launch date, used as the default `lastmod` and for "recently added" logic.
 */
export const LAUNCH_DATE = '2026-09-24';

/**
 * Shared privacy copy. Only rendered on tools where `serverProcessing === false`,
 * i.e. only where the statement is literally true.
 */
export const LOCAL_PROCESSING_NOTE =
  'Your data is processed locally in your browser and is not uploaded to ByteCabin servers.';

/**
 * Advertising configuration.
 *
 * Ads are OFF. The three approved placements already exist in the page
 * structure (see components/AdSlot.astro), so enabling them later means
 * flipping `enabled`, adding the AdSense client ID and pasting slot IDs —
 * no layout or template changes.
 *
 * Do not enable without explicit approval from the site owner, and not before
 * an AdSense application has actually been accepted.
 */
export const ADS = {
  enabled: false,
  /** AdSense publisher ID, e.g. 'ca-pub-0000000000000000'. */
  client: '',
  /** AdSense slot IDs per placement. Empty means that placement stays off. */
  slots: {
    'below-header': '',
    'after-tool': '',
    'in-content': '',
  },
} as const;

/**
 * Input guards. Tools refuse work above these sizes rather than locking the tab.
 */
export const LIMITS = {
  /** Max characters accepted by a text input before we refuse to process. */
  maxInputChars: 2_000_000,
  /** Max size for uploaded files, in bytes. */
  maxFileBytes: 5 * 1024 * 1024,
  /** Milliseconds a regex match is allowed to run inside its worker. */
  regexTimeoutMs: 1500,
} as const;
