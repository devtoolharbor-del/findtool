import { describe, it, expect } from 'vitest';
// Plain JS Pages Function, deliberately outside src/ — it is bundled for the
// Workers runtime, not for the site build.
import { reverseDnsName, countryName, collect } from '../functions/tools/what-is-my-ip.js';
import { parseIPv4, parseIPv6, representations } from '~/lib/ip';

/**
 * The edge Function that renders /tools/what-is-my-ip.
 *
 * It cannot import from src/lib, because a Pages Function is bundled on its
 * own and pulling in the TypeScript build would put the whole toolchain in
 * the Worker. So reverse DNS is implemented twice, and this file exists to
 * make sure the two implementations never quietly diverge — the copy at the
 * edge is the one nobody looks at again.
 */

const addresses = [
  '1.1.1.1',
  '8.8.8.8',
  '192.168.1.1',
  '0.0.0.0',
  '255.255.255.255',
  '203.0.113.42',
];

const v6Addresses = [
  '::1',
  '::',
  '2001:db8::1',
  '2a0d:6fc0:e12:2000:a86e:b4f0:81b1:777',
  'fe80::1',
  '2001:0db8:0000:0000:0000:ff00:0042:8329',
  '2606:4700:4700::1111',
];

describe('reverseDnsName agrees with src/lib/ip', () => {
  it.each(addresses)('IPv4 %s', (ip) => {
    expect(reverseDnsName(ip)).toBe(representations(4, BigInt(parseIPv4(ip))).reverseDns);
  });

  it.each(v6Addresses)('IPv6 %s', (ip) => {
    expect(reverseDnsName(ip)).toBe(representations(6, parseIPv6(ip)).reverseDns);
  });
});

describe('reverseDnsName on input the edge should refuse', () => {
  it('returns null rather than a malformed name', () => {
    expect(reverseDnsName('')).toBeNull();
    expect(reverseDnsName(null)).toBeNull();
    expect(reverseDnsName('1.2.3')).toBeNull();
    expect(reverseDnsName('not an address')).toBeNull();
    expect(reverseDnsName('2001:db8::zzzz')).toBeNull();
  });
});

describe('countryName', () => {
  it('expands an ISO code', () => {
    expect(countryName('IL')).toBe('Israel (IL)');
    expect(countryName('GB')).toBe('United Kingdom (GB)');
  });

  it('falls back to the code when it is not a region', () => {
    // T1 is what Cloudflare reports for Tor traffic; Intl has no name for it.
    expect(countryName('T1')).toBe('T1');
  });

  it('returns null for no code', () => {
    expect(countryName(undefined)).toBeNull();
    expect(countryName('')).toBeNull();
  });
});

describe('collect', () => {
  /** Minimal stand-in for the Workers Request the Function receives. */
  const fakeRequest = (headers: Record<string, string>, cf?: Record<string, unknown>) => ({
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    cf,
  });

  it('reads the address and derives the family', () => {
    // The address goes into the slot for its own family; the other stays
    // null so the page can leave that row for the client to fill.
    const v4 = collect(fakeRequest({ 'cf-connecting-ip': '203.0.113.42' }, {}));
    expect(v4.addressV4).toBe('203.0.113.42');
    expect(v4.addressV6).toBeNull();
    expect(v4.version).toBe('IPv4');

    const v6 = collect(fakeRequest({ 'cf-connecting-ip': '2001:db8::1' }, {}));
    expect(v6.addressV6).toBe('2001:db8::1');
    expect(v6.addressV4).toBeNull();
    expect(v6.version).toBe('IPv6');
  });

  it('formats the ASN', () => {
    expect(collect(fakeRequest({}, { asn: 13335 })).asn).toBe('AS13335');
  });

  it('survives a request with no cf object at all', () => {
    // Local dev and any non-Cloudflare origin fetch land here. It must not
    // throw — the page is indexed, so a 500 is the worst possible outcome.
    const values = collect(fakeRequest({}));
    expect(values.addressV4).toBeNull();
    expect(values.addressV6).toBeNull();
    expect(values.version).toBeNull();
    expect(values.country).toBeNull();
  });

  it('never invents a value it was not given', () => {
    const values = collect(fakeRequest({ 'cf-connecting-ip': '1.1.1.1' }, { country: 'AU' }));
    expect(values.city).toBeNull();
    expect(values.org).toBeNull();
    expect(values.tls).toBeNull();
    expect(values.country).toBe('Australia (AU)');
  });
});
