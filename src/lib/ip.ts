/**
 * IP address and subnet maths.
 *
 * Pure and DOM-free. IPv4 is handled as a 32-bit number and IPv6 as a BigInt,
 * because a /64 holds 18.4 quintillion addresses and Number loses integer
 * precision above 2^53 — a subnet calculator that silently rounds host counts
 * is worse than no calculator.
 */

export type IpVersion = 4 | 6;

export class IpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IpError';
  }
}

// ─── IPv4 ─────────────────────────────────────────────────────────────────

/** Parse dotted-quad into a 32-bit unsigned number. */
export function parseIPv4(input: string): number {
  const text = input.trim();
  const parts = text.split('.');
  if (parts.length !== 4) {
    throw new IpError(
      `An IPv4 address needs four parts separated by dots — this has ${parts.length}.`,
    );
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      throw new IpError(`"${part}" is not a number between 0 and 255.`);
    }
    // 010 is 10 here, but leading zeros are how the ping-vs-inet_aton octal
    // confusion starts, so they are rejected rather than guessed at.
    if (part.length > 1 && part.startsWith('0')) {
      throw new IpError(
        `"${part}" has a leading zero. Some tools read that as octal, so it is ambiguous — write it as ${Number(part)}.`,
      );
    }
    const n = Number(part);
    if (n > 255) throw new IpError(`${n} is above 255, the largest value one part can hold.`);
    value = value * 256 + n;
  }
  return value >>> 0;
}

export function ipv4ToString(value: number): string {
  const v = value >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.');
}

// ─── IPv6 ─────────────────────────────────────────────────────────────────

/** Parse an IPv6 address, including `::` compression and embedded IPv4. */
export function parseIPv6(input: string): bigint {
  let text = input.trim().replace(/^\[|\]$/g, '');
  if (text === '') throw new IpError('There is no address to parse.');

  // A trailing IPv4 form (::ffff:192.0.2.1) becomes two hex groups.
  const v4 = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const n = parseIPv4(v4[1]!);
    const high = ((n >>> 16) & 0xffff).toString(16);
    const low = (n & 0xffff).toString(16);
    text = text.slice(0, v4.index) + `${high}:${low}`;
  }

  const doubleColon = text.split('::');
  if (doubleColon.length > 2) {
    throw new IpError('"::" may appear only once — it already means "all the missing zeros".');
  }

  const expand = (side: string): string[] => (side === '' ? [] : side.split(':'));
  const head = expand(doubleColon[0]!);
  const tail = doubleColon.length === 2 ? expand(doubleColon[1]!) : [];

  let groups: string[];
  if (doubleColon.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) {
      throw new IpError('"::" must stand in for at least one group of zeros.');
    }
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }

  if (groups.length !== 8) {
    throw new IpError(
      `An IPv6 address has eight groups — this has ${groups.length}. Use "::" to stand in for consecutive zero groups.`,
    );
  }

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      throw new IpError(`"${group}" is not a valid group — each is one to four hex digits.`);
    }
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

/** Full, uncompressed form: every group four digits. */
export function ipv6ToFullString(value: bigint): string {
  const groups: string[] = [];
  for (let i = 7; i >= 0; i--) {
    groups.push((((value >> BigInt(i * 16)) & 0xffffn).toString(16)).padStart(4, '0'));
  }
  return groups.join(':');
}

/**
 * Canonical compressed form per RFC 5952: lowercase, leading zeros dropped,
 * and `::` applied to the *longest* run of zero groups — ties going to the
 * leftmost. Implementations that compress the first run they find produce
 * valid but non-canonical output, which breaks string comparison.
 */
export function ipv6ToString(value: bigint): string {
  const groups: number[] = [];
  for (let i = 7; i >= 0; i--) groups.push(Number((value >> BigInt(i * 16)) & 0xffffn));

  let bestStart = -1;
  let bestLen = 0;
  let start = -1;
  let len = 0;
  for (let i = 0; i < 8; i++) {
    if (groups[i] === 0) {
      if (start === -1) start = i;
      len++;
      if (len > bestLen) {
        bestLen = len;
        bestStart = start;
      }
    } else {
      start = -1;
      len = 0;
    }
  }

  const hex = groups.map((g) => g.toString(16));
  // A single zero group is written "0", not "::" — RFC 5952 §4.2.2.
  if (bestLen < 2) return hex.join(':');

  const head = hex.slice(0, bestStart).join(':');
  const tail = hex.slice(bestStart + bestLen).join(':');
  return `${head}::${tail}`;
}

// ─── CIDR ─────────────────────────────────────────────────────────────────

export interface Cidr {
  version: IpVersion;
  /** Address exactly as supplied, before masking. */
  address: bigint;
  prefix: number;
}

/**
 * Parse `10.0.0.0/8`, `10.0.0.0 255.0.0.0`, `2001:db8::/32`, or a bare
 * address (treated as a single host).
 */
export function parseCidr(input: string): Cidr {
  const text = input.trim();
  if (!text) throw new IpError('Enter an address or a CIDR range.');

  // Dotted-decimal mask: "192.168.1.0 255.255.255.0"
  const spaced = text.split(/[\s]+/);
  if (spaced.length === 2 && spaced[1]!.includes('.') && !spaced[1]!.includes('/')) {
    const addr = BigInt(parseIPv4(spaced[0]!));
    const prefix = maskToPrefix(parseIPv4(spaced[1]!));
    return { version: 4, address: addr, prefix };
  }

  const [addrPart, prefixPart] = text.split('/');
  const isV6 = addrPart!.includes(':');
  const version: IpVersion = isV6 ? 6 : 4;
  const bits = isV6 ? 128 : 32;
  const address = isV6 ? parseIPv6(addrPart!) : BigInt(parseIPv4(addrPart!));

  if (prefixPart === undefined) return { version, address, prefix: bits };

  if (!/^\d{1,3}$/.test(prefixPart)) {
    throw new IpError(`"${prefixPart}" is not a prefix length. Use a number after the slash.`);
  }
  const prefix = Number(prefixPart);
  if (prefix > bits) {
    throw new IpError(`/${prefix} is too long for IPv${version} — the maximum is /${bits}.`);
  }
  return { version, address, prefix };
}

/** Convert a dotted-decimal mask to a prefix length, rejecting non-contiguous masks. */
export function maskToPrefix(mask: number): number {
  const m = mask >>> 0;
  // A valid mask is ones followed by zeros. Inverting gives a value where
  // adding one must overflow to zero if the zeros were contiguous.
  const inverted = ~m >>> 0;
  if (((inverted + 1) & inverted) !== 0) {
    throw new IpError(
      `${ipv4ToString(m)} is not a valid subnet mask — the 1 bits must be contiguous.`,
    );
  }
  let count = 0;
  for (let i = 31; i >= 0; i--) {
    if ((m >>> i) & 1) count++;
    else break;
  }
  return count;
}

export function prefixToMask(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export interface SubnetInfo {
  version: IpVersion;
  prefix: number;
  /** Canonical string forms. */
  network: string;
  broadcast: string | null;
  firstHost: string | null;
  lastHost: string | null;
  mask: string | null;
  wildcard: string | null;
  totalAddresses: bigint;
  usableHosts: bigint;
  /** True where the range is too small to have distinct host addresses. */
  isPointToPoint: boolean;
  isSingleHost: boolean;
  /** RFC 1918 / RFC 4193 and friends. */
  scope: string;
  cidr: string;
}

const format = (version: IpVersion, value: bigint): string =>
  version === 4 ? ipv4ToString(Number(value)) : ipv6ToString(value);

export function subnetInfo(cidr: Cidr): SubnetInfo {
  const bits = cidr.version === 4 ? 32 : 128;
  const hostBits = BigInt(bits - cidr.prefix);
  const size = 1n << hostBits;
  const maskValue = ((1n << BigInt(cidr.prefix)) - 1n) << hostBits;
  const network = cidr.address & maskValue;
  const last = network + size - 1n;

  // IPv6 has no broadcast address, and every address in a subnet is usable.
  // IPv4 reserves the network and broadcast addresses, except in a /31 point
  // to point link (RFC 3021) and a /32 single host.
  const isSingleHost = cidr.version === 4 ? cidr.prefix === 32 : cidr.prefix === 128;
  const isPointToPoint = cidr.version === 4 && cidr.prefix === 31;

  let usable: bigint;
  let firstHost: bigint | null;
  let lastHost: bigint | null;

  if (cidr.version === 6) {
    usable = size;
    firstHost = network;
    lastHost = last;
  } else if (isSingleHost) {
    usable = 1n;
    firstHost = network;
    lastHost = network;
  } else if (isPointToPoint) {
    usable = 2n;
    firstHost = network;
    lastHost = last;
  } else {
    usable = size - 2n;
    firstHost = network + 1n;
    lastHost = last - 1n;
  }

  return {
    version: cidr.version,
    prefix: cidr.prefix,
    network: format(cidr.version, network),
    broadcast: cidr.version === 4 && !isSingleHost ? ipv4ToString(Number(last)) : null,
    firstHost: firstHost === null ? null : format(cidr.version, firstHost),
    lastHost: lastHost === null ? null : format(cidr.version, lastHost),
    mask: cidr.version === 4 ? ipv4ToString(prefixToMask(cidr.prefix)) : null,
    wildcard: cidr.version === 4 ? ipv4ToString(~prefixToMask(cidr.prefix) >>> 0) : null,
    totalAddresses: size,
    usableHosts: usable,
    isPointToPoint,
    isSingleHost,
    scope: describeScope(cidr.version, network),
    cidr: `${format(cidr.version, network)}/${cidr.prefix}`,
  };
}

/** Which reserved range an address falls in, if any. */
export function describeScope(version: IpVersion, address: bigint): string {
  if (version === 4) {
    const a = Number(address);
    const inRange = (cidr: string) => {
      const { address: net, prefix } = parseCidr(cidr);
      const mask = prefixToMask(prefix);
      return (a & mask) >>> 0 === (Number(net) & mask) >>> 0;
    };
    if (inRange('10.0.0.0/8') || inRange('172.16.0.0/12') || inRange('192.168.0.0/16'))
      return 'Private (RFC 1918) — not routable on the public internet';
    if (inRange('127.0.0.0/8')) return 'Loopback (RFC 1122)';
    if (inRange('169.254.0.0/16')) return 'Link-local / APIPA (RFC 3927)';
    if (inRange('100.64.0.0/10')) return 'Carrier-grade NAT (RFC 6598)';
    if (inRange('224.0.0.0/4')) return 'Multicast (RFC 5771)';
    if (inRange('0.0.0.0/8')) return 'This network (RFC 1122)';
    if (inRange('192.0.2.0/24') || inRange('198.51.100.0/24') || inRange('203.0.113.0/24'))
      return 'Documentation only (RFC 5737)';
    if (inRange('240.0.0.0/4')) return 'Reserved (RFC 1112)';
    return 'Public';
  }

  const top16 = address >> 112n;
  if (address === 1n) return 'Loopback (::1)';
  if (address === 0n) return 'Unspecified (::)';
  if ((address >> 121n) === 0x7en) return 'Unique local (RFC 4193)'; // fc00::/7
  if (top16 === 0xfe80n) return 'Link-local (RFC 4291)';
  if ((address >> 120n) === 0xffn) return 'Multicast (RFC 4291)';
  if ((address >> 96n) === 0x20010db8n) return 'Documentation only (RFC 3849)';
  return 'Global unicast';
}

/** Is `address` inside `range`? */
export function cidrContains(range: Cidr, address: bigint, version: IpVersion): boolean {
  if (range.version !== version) return false;
  const bits = version === 4 ? 32 : 128;
  const hostBits = BigInt(bits - range.prefix);
  const mask = ((1n << BigInt(range.prefix)) - 1n) << hostBits;
  return (address & mask) === (range.address & mask);
}

/**
 * Divide a range into equal subnets of `newPrefix`.
 * Capped, because splitting a /8 into /30s is four million rows and nobody
 * wants the tab to die proving it.
 */
export function splitSubnet(cidr: Cidr, newPrefix: number, limit = 256): {
  subnets: string[];
  total: bigint;
  truncated: boolean;
} {
  const bits = cidr.version === 4 ? 32 : 128;
  if (newPrefix < cidr.prefix) {
    throw new IpError(
      `/${newPrefix} is larger than /${cidr.prefix}. To split a range, the new prefix must be longer.`,
    );
  }
  if (newPrefix > bits) {
    throw new IpError(`/${newPrefix} is too long for IPv${cidr.version} — the maximum is /${bits}.`);
  }

  const count = 1n << BigInt(newPrefix - cidr.prefix);
  const step = 1n << BigInt(bits - newPrefix);
  const hostBits = BigInt(bits - cidr.prefix);
  const network = cidr.address & (((1n << BigInt(cidr.prefix)) - 1n) << hostBits);

  const subnets: string[] = [];
  const take = count > BigInt(limit) ? BigInt(limit) : count;
  for (let i = 0n; i < take; i++) {
    subnets.push(`${format(cidr.version, network + i * step)}/${newPrefix}`);
  }
  return { subnets, total: count, truncated: count > BigInt(limit) };
}

// ─── Representations ──────────────────────────────────────────────────────

export interface IpRepresentations {
  decimal: string;
  hex: string;
  binary: string;
  /** IPv4 only: the form `ping 3232235777` accepts. */
  integer: string | null;
  /** IPv6 only. */
  expanded: string | null;
  /** The .arpa name used for reverse DNS. */
  reverseDns: string;
}

export function representations(version: IpVersion, address: bigint): IpRepresentations {
  if (version === 4) {
    const n = Number(address);
    return {
      decimal: ipv4ToString(n),
      hex: '0x' + n.toString(16).padStart(8, '0'),
      binary: [24, 16, 8, 0]
        .map((shift) => ((n >>> shift) & 255).toString(2).padStart(8, '0'))
        .join('.'),
      integer: String(n >>> 0),
      expanded: null,
      reverseDns:
        [0, 8, 16, 24].map((shift) => (n >>> shift) & 255).join('.') + '.in-addr.arpa',
    };
  }

  const full = ipv6ToFullString(address);
  const nibbles = full.replace(/:/g, '');
  return {
    decimal: ipv6ToString(address),
    hex: '0x' + address.toString(16).padStart(32, '0'),
    binary: full
      .split(':')
      .map((g) => parseInt(g, 16).toString(2).padStart(16, '0'))
      .join(':'),
    integer: address.toString(),
    expanded: full,
    reverseDns: [...nibbles].reverse().join('.') + '.ip6.arpa',
  };
}

/** Group a large count with thin spaces so 18446744073709551616 is readable. */
export function formatCount(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
