import { describe, it, expect } from 'vitest';
import {
  parseIPv4,
  ipv4ToString,
  parseIPv6,
  ipv6ToString,
  ipv6ToFullString,
  parseCidr,
  maskToPrefix,
  prefixToMask,
  subnetInfo,
  describeScope,
  cidrContains,
  splitSubnet,
  representations,
  formatCount,
  IpError,
} from '~/lib/ip';

describe('parseIPv4', () => {
  it('parses a dotted quad', () => {
    expect(parseIPv4('192.168.1.1')).toBe(3232235777);
  });

  it('parses the boundaries', () => {
    expect(parseIPv4('0.0.0.0')).toBe(0);
    expect(parseIPv4('255.255.255.255')).toBe(4294967295);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseIPv4('  10.0.0.1  ')).toBe(parseIPv4('10.0.0.1'));
  });

  it('rejects the wrong number of parts', () => {
    expect(() => parseIPv4('1.2.3')).toThrow(IpError);
    expect(() => parseIPv4('1.2.3.4.5')).toThrow(/four parts/);
  });

  it('rejects an octet above 255', () => {
    expect(() => parseIPv4('192.168.1.256')).toThrow(/above 255/);
  });

  it('rejects leading zeros rather than guessing octal', () => {
    expect(() => parseIPv4('192.168.01.1')).toThrow(/leading zero/);
    // A bare zero is still fine.
    expect(parseIPv4('0.0.0.0')).toBe(0);
  });

  it('rejects non-numeric parts', () => {
    expect(() => parseIPv4('a.b.c.d')).toThrow(IpError);
    expect(() => parseIPv4('1.2.3.-4')).toThrow(IpError);
    expect(() => parseIPv4('1.2.3.')).toThrow(IpError);
  });

  it('round-trips', () => {
    for (const ip of ['0.0.0.0', '8.8.8.8', '127.0.0.1', '255.255.255.255']) {
      expect(ipv4ToString(parseIPv4(ip))).toBe(ip);
    }
  });
});

describe('parseIPv6', () => {
  it('parses a full address', () => {
    expect(ipv6ToFullString(parseIPv6('2001:0db8:0000:0000:0000:ff00:0042:8329'))).toBe(
      '2001:0db8:0000:0000:0000:ff00:0042:8329',
    );
  });

  it('expands ::', () => {
    expect(ipv6ToFullString(parseIPv6('2001:db8::ff00:42:8329'))).toBe(
      '2001:0db8:0000:0000:0000:ff00:0042:8329',
    );
  });

  it('parses :: alone as all zeros', () => {
    expect(parseIPv6('::')).toBe(0n);
  });

  it('parses loopback', () => {
    expect(parseIPv6('::1')).toBe(1n);
  });

  it('parses a leading ::', () => {
    expect(ipv6ToFullString(parseIPv6('::ffff:1'))).toBe('0000:0000:0000:0000:0000:0000:ffff:0001');
  });

  it('parses a trailing ::', () => {
    expect(ipv6ToFullString(parseIPv6('fe80::'))).toBe('fe80:0000:0000:0000:0000:0000:0000:0000');
  });

  it('parses an embedded IPv4', () => {
    expect(ipv6ToString(parseIPv6('::ffff:192.0.2.128'))).toBe('::ffff:c000:280');
  });

  it('strips brackets from a URL-style address', () => {
    expect(parseIPv6('[::1]')).toBe(1n);
  });

  it('rejects two :: runs', () => {
    expect(() => parseIPv6('2001::db8::1')).toThrow(/only once/);
  });

  it('rejects the wrong group count without ::', () => {
    expect(() => parseIPv6('2001:db8:1:2:3:4:5')).toThrow(/eight groups/);
    expect(() => parseIPv6('1:2:3:4:5:6:7:8:9')).toThrow(/eight groups/);
  });

  it('rejects :: that stands in for nothing', () => {
    expect(() => parseIPv6('1:2:3:4::5:6:7:8')).toThrow(/at least one group/);
  });

  it('rejects an oversized group', () => {
    expect(() => parseIPv6('2001:db8::12345')).toThrow(/valid group/);
  });

  it('rejects an empty string', () => {
    expect(() => parseIPv6('')).toThrow(IpError);
  });
});

describe('ipv6ToString (RFC 5952 canonical form)', () => {
  it('drops leading zeros', () => {
    expect(ipv6ToString(parseIPv6('2001:0db8:0000:0000:0000:ff00:0042:8329'))).toBe(
      '2001:db8::ff00:42:8329',
    );
  });

  it('compresses the longest zero run, not the first', () => {
    // Two runs: one group then three groups. The longer must win.
    expect(ipv6ToString(parseIPv6('2001:0:1:0:0:0:0:1'))).toBe('2001:0:1::1');
  });

  it('prefers the leftmost run when two are equally long', () => {
    expect(ipv6ToString(parseIPv6('2001:0:0:1:0:0:2:1'))).toBe('2001::1:0:0:2:1');
  });

  it('writes a lone zero group as 0, not ::', () => {
    expect(ipv6ToString(parseIPv6('2001:db8:1:2:3:4:0:1'))).toBe('2001:db8:1:2:3:4:0:1');
  });

  it('renders all zeros as ::', () => {
    expect(ipv6ToString(0n)).toBe('::');
  });

  it('renders loopback as ::1', () => {
    expect(ipv6ToString(1n)).toBe('::1');
  });
});

describe('maskToPrefix / prefixToMask', () => {
  it('converts common masks', () => {
    expect(maskToPrefix(parseIPv4('255.255.255.0'))).toBe(24);
    expect(maskToPrefix(parseIPv4('255.255.0.0'))).toBe(16);
    expect(maskToPrefix(parseIPv4('0.0.0.0'))).toBe(0);
    expect(maskToPrefix(parseIPv4('255.255.255.255'))).toBe(32);
    expect(maskToPrefix(parseIPv4('255.255.255.252'))).toBe(30);
  });

  it('rejects a non-contiguous mask', () => {
    expect(() => maskToPrefix(parseIPv4('255.0.255.0'))).toThrow(/contiguous/);
    expect(() => maskToPrefix(parseIPv4('255.255.255.1'))).toThrow(/contiguous/);
  });

  it('round-trips every prefix length', () => {
    for (let p = 0; p <= 32; p++) {
      expect(maskToPrefix(prefixToMask(p))).toBe(p);
    }
  });
});

describe('parseCidr', () => {
  it('parses IPv4 CIDR', () => {
    expect(parseCidr('10.0.0.0/8')).toEqual({ version: 4, address: 167772160n, prefix: 8 });
  });

  it('treats a bare IPv4 address as /32', () => {
    expect(parseCidr('8.8.8.8').prefix).toBe(32);
  });

  it('treats a bare IPv6 address as /128', () => {
    expect(parseCidr('2001:db8::1').prefix).toBe(128);
  });

  it('parses a space-separated dotted mask', () => {
    const c = parseCidr('192.168.1.0 255.255.255.0');
    expect(c.prefix).toBe(24);
    expect(c.version).toBe(4);
  });

  it('parses IPv6 CIDR', () => {
    const c = parseCidr('2001:db8::/32');
    expect(c.version).toBe(6);
    expect(c.prefix).toBe(32);
  });

  it('rejects a prefix beyond the address size', () => {
    expect(() => parseCidr('10.0.0.0/33')).toThrow(/too long/);
    expect(() => parseCidr('2001:db8::/129')).toThrow(/too long/);
  });

  it('rejects a non-numeric prefix', () => {
    expect(() => parseCidr('10.0.0.0/eight')).toThrow(/not a prefix/);
  });

  it('rejects empty input', () => {
    expect(() => parseCidr('   ')).toThrow(IpError);
  });
});

describe('subnetInfo — IPv4', () => {
  it('computes a /24', () => {
    const info = subnetInfo(parseCidr('192.168.1.130/24'));
    expect(info.network).toBe('192.168.1.0');
    expect(info.broadcast).toBe('192.168.1.255');
    expect(info.firstHost).toBe('192.168.1.1');
    expect(info.lastHost).toBe('192.168.1.254');
    expect(info.totalAddresses).toBe(256n);
    expect(info.usableHosts).toBe(254n);
    expect(info.mask).toBe('255.255.255.0');
    expect(info.wildcard).toBe('0.0.0.255');
    expect(info.cidr).toBe('192.168.1.0/24');
  });

  it('masks the host bits off the supplied address', () => {
    expect(subnetInfo(parseCidr('10.11.12.13/8')).network).toBe('10.0.0.0');
  });

  it('computes a /30', () => {
    const info = subnetInfo(parseCidr('10.0.0.0/30'));
    expect(info.usableHosts).toBe(2n);
    expect(info.firstHost).toBe('10.0.0.1');
    expect(info.lastHost).toBe('10.0.0.2');
    expect(info.broadcast).toBe('10.0.0.3');
  });

  it('treats a /31 as a point-to-point link with two usable addresses', () => {
    const info = subnetInfo(parseCidr('10.0.0.0/31'));
    expect(info.isPointToPoint).toBe(true);
    expect(info.usableHosts).toBe(2n);
    expect(info.firstHost).toBe('10.0.0.0');
    expect(info.lastHost).toBe('10.0.0.1');
  });

  it('treats a /32 as a single host with no broadcast', () => {
    const info = subnetInfo(parseCidr('10.0.0.5/32'));
    expect(info.isSingleHost).toBe(true);
    expect(info.usableHosts).toBe(1n);
    expect(info.broadcast).toBeNull();
    expect(info.firstHost).toBe('10.0.0.5');
  });

  it('computes a /0', () => {
    const info = subnetInfo(parseCidr('0.0.0.0/0'));
    expect(info.totalAddresses).toBe(4294967296n);
    expect(info.usableHosts).toBe(4294967294n);
    expect(info.broadcast).toBe('255.255.255.255');
  });
});

describe('subnetInfo — IPv6', () => {
  it('has no broadcast and no reserved addresses', () => {
    const info = subnetInfo(parseCidr('2001:db8::/64'));
    expect(info.broadcast).toBeNull();
    expect(info.mask).toBeNull();
    expect(info.totalAddresses).toBe(18446744073709551616n);
    expect(info.usableHosts).toBe(18446744073709551616n);
    expect(info.firstHost).toBe('2001:db8::');
    expect(info.lastHost).toBe('2001:db8::ffff:ffff:ffff:ffff');
  });

  it('keeps precision well past Number.MAX_SAFE_INTEGER', () => {
    // A /0 is 2^128. Any implementation using Number here returns 3.4e38.
    expect(subnetInfo(parseCidr('::/0')).totalAddresses).toBe(
      340282366920938463463374607431768211456n,
    );
  });

  it('masks host bits off', () => {
    expect(subnetInfo(parseCidr('2001:db8:1:2:3:4:5:6/32')).network).toBe('2001:db8::');
  });

  it('computes a /128', () => {
    const info = subnetInfo(parseCidr('2001:db8::1/128'));
    expect(info.usableHosts).toBe(1n);
    expect(info.isSingleHost).toBe(true);
  });
});

describe('describeScope', () => {
  const scope4 = (ip: string) => describeScope(4, BigInt(parseIPv4(ip)));
  const scope6 = (ip: string) => describeScope(6, parseIPv6(ip));

  it('identifies RFC 1918 space', () => {
    expect(scope4('10.1.2.3')).toMatch(/Private/);
    expect(scope4('172.16.0.1')).toMatch(/Private/);
    expect(scope4('172.31.255.255')).toMatch(/Private/);
    expect(scope4('192.168.0.1')).toMatch(/Private/);
  });

  it('does not over-claim the 172 range', () => {
    // 172.15 and 172.32 are outside the /12.
    expect(scope4('172.15.0.1')).toBe('Public');
    expect(scope4('172.32.0.1')).toBe('Public');
  });

  it('identifies other reserved ranges', () => {
    expect(scope4('127.0.0.1')).toMatch(/Loopback/);
    expect(scope4('169.254.1.1')).toMatch(/Link-local/);
    expect(scope4('100.64.0.1')).toMatch(/Carrier-grade NAT/);
    expect(scope4('224.0.0.1')).toMatch(/Multicast/);
    expect(scope4('192.0.2.1')).toMatch(/Documentation/);
  });

  it('calls a routable address public', () => {
    expect(scope4('8.8.8.8')).toBe('Public');
    expect(scope4('1.1.1.1')).toBe('Public');
  });

  it('identifies IPv6 scopes', () => {
    expect(scope6('::1')).toMatch(/Loopback/);
    expect(scope6('::')).toMatch(/Unspecified/);
    expect(scope6('fd00::1')).toMatch(/Unique local/);
    expect(scope6('fe80::1')).toMatch(/Link-local/);
    expect(scope6('ff02::1')).toMatch(/Multicast/);
    expect(scope6('2001:db8::1')).toMatch(/Documentation/);
    expect(scope6('2606:4700::1')).toBe('Global unicast');
  });
});

describe('cidrContains', () => {
  const inside = (range: string, ip: string) => {
    const r = parseCidr(range);
    const a = parseCidr(ip);
    return cidrContains(r, a.address, a.version);
  };

  it('matches an address inside the range', () => {
    expect(inside('10.0.0.0/8', '10.1.2.3')).toBe(true);
    expect(inside('192.168.1.0/24', '192.168.1.255')).toBe(true);
  });

  it('rejects an address outside the range', () => {
    expect(inside('10.0.0.0/8', '11.0.0.1')).toBe(false);
    expect(inside('192.168.1.0/24', '192.168.2.1')).toBe(false);
  });

  it('handles the boundaries exactly', () => {
    expect(inside('192.168.1.0/24', '192.168.0.255')).toBe(false);
    expect(inside('192.168.1.0/24', '192.168.1.0')).toBe(true);
    expect(inside('192.168.1.0/24', '192.168.2.0')).toBe(false);
  });

  it('treats /0 as containing everything', () => {
    expect(inside('0.0.0.0/0', '8.8.8.8')).toBe(true);
  });

  it('never matches across address families', () => {
    expect(inside('10.0.0.0/8', '::1')).toBe(false);
    expect(inside('2001:db8::/32', '10.0.0.1')).toBe(false);
  });

  it('works for IPv6', () => {
    expect(inside('2001:db8::/32', '2001:db8:dead:beef::1')).toBe(true);
    expect(inside('2001:db8::/32', '2001:db9::1')).toBe(false);
  });
});

describe('splitSubnet', () => {
  it('splits a /24 into four /26s', () => {
    const { subnets, total, truncated } = splitSubnet(parseCidr('192.168.1.0/24'), 26);
    expect(total).toBe(4n);
    expect(truncated).toBe(false);
    expect(subnets).toEqual([
      '192.168.1.0/26',
      '192.168.1.64/26',
      '192.168.1.128/26',
      '192.168.1.192/26',
    ]);
  });

  it('returns the range itself when the prefix is unchanged', () => {
    expect(splitSubnet(parseCidr('10.0.0.0/8'), 8).subnets).toEqual(['10.0.0.0/8']);
  });

  it('truncates a huge split and reports the true total', () => {
    const { subnets, total, truncated } = splitSubnet(parseCidr('10.0.0.0/8'), 24, 10);
    expect(subnets).toHaveLength(10);
    expect(total).toBe(65536n);
    expect(truncated).toBe(true);
  });

  it('rejects a shorter prefix', () => {
    expect(() => splitSubnet(parseCidr('10.0.0.0/24'), 16)).toThrow(/larger than/);
  });

  it('rejects a prefix beyond the address size', () => {
    expect(() => splitSubnet(parseCidr('10.0.0.0/24'), 33)).toThrow(/too long/);
  });

  it('splits IPv6 without losing precision', () => {
    const { subnets, total } = splitSubnet(parseCidr('2001:db8::/32'), 34);
    expect(total).toBe(4n);
    expect(subnets).toEqual([
      '2001:db8::/34',
      '2001:db8:4000::/34',
      '2001:db8:8000::/34',
      '2001:db8:c000::/34',
    ]);
  });
});

describe('representations', () => {
  it('renders IPv4 forms', () => {
    const r = representations(4, BigInt(parseIPv4('192.168.1.1')));
    expect(r.decimal).toBe('192.168.1.1');
    expect(r.hex).toBe('0xc0a80101');
    expect(r.binary).toBe('11000000.10101000.00000001.00000001');
    expect(r.integer).toBe('3232235777');
    expect(r.reverseDns).toBe('1.1.168.192.in-addr.arpa');
    expect(r.expanded).toBeNull();
  });

  it('renders 0.0.0.0 without dropping padding', () => {
    const r = representations(4, 0n);
    expect(r.hex).toBe('0x00000000');
    expect(r.binary).toBe('00000000.00000000.00000000.00000000');
  });

  it('renders IPv6 forms', () => {
    const r = representations(6, parseIPv6('2001:db8::1'));
    expect(r.decimal).toBe('2001:db8::1');
    expect(r.expanded).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(r.hex).toBe('0x20010db8000000000000000000000001');
    expect(r.reverseDns).toBe(
      '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa',
    );
  });

  it('produces a 32-nibble reverse name for every IPv6 address', () => {
    // 32 nibbles plus 32 dots plus "ip6.arpa".
    expect(representations(6, 0n).reverseDns.split('.')).toHaveLength(34);
  });
});

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(254n)).toBe('254');
    expect(formatCount(65536n)).toBe('65,536');
    expect(formatCount(18446744073709551616n)).toBe('18,446,744,073,709,551,616');
  });
});
