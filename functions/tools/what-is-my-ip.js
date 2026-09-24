/**
 * Edge renderer for /tools/what-is-my-ip.
 *
 * This is the only server-side code in the project, and it exists so that the
 * IP page does not have to ask anyone for the visitor's address. The address
 * is already in the request that fetched the page; a client-side tool would
 * have to send that request on to a third-party API, handing the visitor's IP
 * to someone else in order to be told what we were handed for free.
 *
 * How it works: the page is built statically by Astro exactly like every
 * other tool, so it keeps its layout, prose, FAQ, structured data and sitemap
 * entry. This function sits on the same route, fetches that built HTML with
 * next(), and rewrites the placeholder cells in the stream. Nothing is
 * buffered and no template is duplicated.
 *
 * The contract with src/tools/WhatIsMyIp.astro is the key names below. They
 * must match `[data-ip="<key>"]` and `tr[data-ip-row="<key>"]` in that file.
 *
 * Deployment: `wrangler pages deploy dist` compiles ./functions from the repo
 * root, so the directory must be checked out in the deploy job. It is —
 * see .github/workflows/deploy.yml.
 */

/** Rows to hide when the edge has no value for them, rather than show empty. */
const OPTIONAL = new Set(['region', 'city', 'postal', 'postalCode', 'language']);

/** Turn an ISO country code into a name, falling back to the code itself. */
export function countryName(code) {
  if (!code) return null;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

/**
 * The .arpa name a PTR lookup would use.
 *
 * This duplicates representations() in src/lib/ip.ts, because a Pages Function
 * is bundled separately and pulling a TypeScript module into it would drag the
 * whole build toolchain into the Worker. The duplication is pinned by
 * tests/edge-ip.test.ts, which runs both against the same addresses and fails
 * if they ever disagree.
 */
export function reverseDnsName(ip) {
  if (!ip) return null;

  if (!ip.includes(':')) {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    return `${parts.reverse().join('.')}.in-addr.arpa`;
  }

  // Expand the address to 32 nibbles, then reverse them.
  const [head, tail] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail === undefined ? [] : tail ? tail.split(':') : [];
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  if (groups.length !== 8) return null;

  const nibbles = groups.map((g) => g.padStart(4, '0')).join('');
  if (!/^[0-9a-fA-F]{32}$/.test(nibbles)) return null;
  return `${[...nibbles.toLowerCase()].reverse().join('.')}.ip6.arpa`;
}

/** Build the full set of display values from the request. */
export function collect(request) {
  const cf = request.cf ?? {};
  const ip = request.headers.get('CF-Connecting-IP');
  const isV6 = Boolean(ip && ip.includes(':'));

  const asn = cf.asn ? `AS${cf.asn}` : null;

  return {
    address: ip || null,
    version: ip ? (isV6 ? 'IPv6' : 'IPv4') : null,
    reverse: reverseDnsName(ip),
    country: countryName(cf.country),
    region: cf.region || null,
    city: cf.city || null,
    postal: cf.postalCode || null,
    timezone: cf.timezone || null,
    asn,
    org: cf.asOrganization || null,
    protocol: cf.httpProtocol || null,
    tls: cf.tlsVersion || null,
    cipher: cf.tlsCipher || null,
    colo: cf.colo || null,
    language: request.headers.get('Accept-Language'),
  };
}

/** Labels for the plain-text block behind the "Copy all details" button. */
const LABELS = {
  address: 'IP address',
  version: 'Protocol',
  reverse: 'Reverse DNS name',
  country: 'Country',
  region: 'Region',
  city: 'City',
  postal: 'Postal code',
  timezone: 'Time zone',
  asn: 'Network (ASN)',
  org: 'Network operator',
  protocol: 'HTTP version',
  tls: 'TLS version',
  cipher: 'Cipher suite',
  colo: 'Edge location',
  language: 'Accept-Language',
};

export async function onRequest(context) {
  const { request, next } = context;

  /*
    Conditional headers are stripped before asking for the asset. A 304 from
    the asset server carries no body, so there would be nothing for the
    rewriter to transform and the browser would redisplay a cached page with
    a stale address. The response below is no-store, so this should never
    arise — but "should never" is how a stale IP ships.
  */
  const assetHeaders = new Headers(request.headers);
  assetHeaders.delete('If-None-Match');
  assetHeaders.delete('If-Modified-Since');

  let asset;
  try {
    asset = await next(new Request(request.url, { method: 'GET', headers: assetHeaders }));
  } catch {
    // If the asset server is unreachable there is nothing useful to add.
    return next();
  }

  const contentType = asset.headers.get('Content-Type') ?? '';
  if (!asset.ok || !contentType.includes('text/html')) return asset;

  const headers = new Headers(asset.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('CDN-Cache-Control', 'no-store');
  // Validators from the static asset would let a browser or proxy revalidate
  // its way back to someone else's address.
  headers.delete('ETag');
  headers.delete('Last-Modified');

  const response = new Response(asset.body, { status: asset.status, headers });

  let values;
  try {
    values = collect(request);
  } catch {
    // Never 500 an indexed page over a formatting error; the static fallback
    // in the HTML already explains that the values are missing.
    return response;
  }

  const summary = Object.entries(LABELS)
    .filter(([key]) => values[key])
    .map(([key, label]) => `${label.padEnd(18)}${values[key]}`)
    .join('\n');

  return new HTMLRewriter()
    // Fill each placeholder cell. setInnerContent escapes by default, so a
    // hostile Accept-Language header cannot inject markup.
    .on('[data-ip]', {
      element(element) {
        const key = element.getAttribute('data-ip');
        const value = values[key];
        if (value) element.setInnerContent(value);
        else if (!OPTIONAL.has(key)) element.setInnerContent('Not reported');
      },
    })
    // Hide rows the edge genuinely has nothing for, rather than showing a
    // column of "Not reported" against a visitor's city and postal code.
    .on('tr[data-ip-row]', {
      element(element) {
        const key = element.getAttribute('data-ip-row');
        if (OPTIONAL.has(key) && !values[key]) element.setAttribute('hidden', '');
      },
    })
    // The static copy of the page explains that it is unfilled. It is.
    .on('[data-ip-fallback]', {
      element(element) {
        element.setAttribute('hidden', '');
      },
    })
    .on('[data-output]', {
      element(element) {
        element.setInnerContent(summary || 'Not available');
      },
    })
    .transform(response);
}
