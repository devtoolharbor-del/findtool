import type { FaqMap } from './index';

/**
 * FAQ content for the Web & Dev tools. See ./index.ts for the rules that
 * govern what belongs here.
 */
export const webFaqs: FaqMap = {
  'regex-tester': [
    {
      q: 'What is catastrophic backtracking?',
      a: 'Certain patterns — typically nested quantifiers like <code>(a+)+$</code> — can take exponential time on inputs that nearly match. On a server this is a denial-of-service vector known as ReDoS. This tester runs your pattern in a worker and aborts it after 1.5 seconds so the tab stays responsive.',
    },
    {
      q: 'Do these patterns work in other languages?',
      a: 'This tester uses the JavaScript engine. Core syntax is portable, but lookbehind, named groups and Unicode property escapes differ between JavaScript, PCRE, Python and Go. Always re-test in your target language.',
    },
  ],
  'http-status-codes': [
    {
      q: 'Should I return 401 or 403?',
      a: '401 says the request carried no usable credentials and that repeating it with them may succeed — RFC 9110 §15.5.2 requires the response to include a <code>WWW-Authenticate</code> header naming the scheme, and a 401 without one is malformed. 403 says the server worked out who is calling and is refusing anyway, so re-authenticating changes nothing. A signed-in user reaching into another tenant’s record gets 403.',
    },
    {
      q: 'What is the difference between 301 and 308, or 302 and 307?',
      a: 'Only the guarantee about the method. Clients have always been permitted to turn a POST into a GET when following 301 or 302, and in practice browsers do. 307 and 308, defined in RFC 9110 §15.4.8 and §15.4.9, forbid that: the method and body are replayed unchanged. A moved HTML page can stay on 301, but an API endpoint that accepts POST must move with 308 or the body silently disappears.',
    },
    {
      q: 'Is 404 or 410 better for a page I deleted?',
      a: '410 asserts that the removal is deliberate and expected to be permanent (RFC 9110 §15.5.11); 404 says only that nothing was found at this address right now. Google documents treating the two almost identically, with a 410 leaving the crawl schedule a little sooner, so the distinction pays off mainly on a bulk removal of thousands of URLs. If the content might return, 404 is the honest answer.',
    },
    {
      q: 'What is a 499 and why does it only appear in nginx logs?',
      a: 'It is nginx’s own invention — <em>client closed request</em> — and it never travels over the wire, because the caller already hung up before the response existed. A cluster of them means clients are timing out ahead of your upstream: a mobile app with a 10-second deadline in front of a 12-second query. It appears in no registry, so nothing else sends or interprets it.',
    },
  ],
  'user-agent-parser': [
    {
      q: 'Why does Chrome on an iPhone say it is Safari?',
      a: 'Because underneath it is: browsers on iOS render through the system WebKit, so the string is Safari’s with one token added. Chrome writes <code>CriOS/</code> where Safari puts <code>Version/</code>, Firefox uses <code>FxiOS/</code> and Edge uses <code>EdgiOS/</code>. Test for those before you test for <code>Safari</code>, or your analytics will hand Safari every iOS visit on the site.',
    },
    {
      q: 'How do I tell an in-app browser from the real one?',
      a: 'By what is added, or missing. An Android WebView adds <code>; wv</code> to the platform section, and the Facebook and Instagram apps append tokens such as <code>FBAN/</code>, <code>FBAV/</code> or <code>Instagram</code>. On iOS the signal is an absence: a <code>WKWebView</code> sends <code>Mobile/15E148</code> but no <code>Version/</code> and no <code>Safari/</code> token at all. Worth detecting, because in-app browsers routinely break OAuth pop-ups and file downloads.',
    },
    {
      q: 'Can I trust a user agent that claims to be Googlebot?',
      a: 'No — the string is free to type, and scrapers use it constantly to slip past rules that whitelist it. Google’s documented check is a reverse DNS lookup on the requesting IP, which must resolve to a host under <code>googlebot.com</code> or <code>google.com</code>, followed by a forward lookup back to the same address; Google also publishes its crawler ranges as JSON. Verify before serving anything a normal visitor would not see.',
    },
  ],
  'color-converter': [
    {
      q: 'What contrast ratio does my text actually need?',
      a: 'WCAG 2.2 success criterion 1.4.3 sets AA at 4.5:1 for body text and 3:1 for large text, where large means 18pt (24px) or 14pt bold (18.66px bold). Criterion 1.4.6 raises AAA to 7:1 and 4.5:1 respectively. Icons, focus rings and input borders are covered by 1.4.11 at 3:1. Disabled controls and pure decoration are exempt from all of them.',
    },
    {
      q: 'What are the extra digits in an eight-digit hex colour?',
      a: 'Alpha, as the final pair: <code>#RRGGBBAA</code> from CSS Color 4, with <code>#RGBA</code> as the four-digit shorthand. It is hexadecimal out of 255 rather than a percentage, so half opacity is <code>80</code> and not <code>50</code>. The trap is Android, which orders the same four channels as <code>#AARRGGBB</code> — paste one of those into a stylesheet and you get the wrong hue and the wrong transparency together.',
    },
    {
      q: 'How do I decide between black and white text over a colour?',
      a: 'Measure the ratio against both and keep the larger; the panel above shows the pair for exactly this. The crossover sits at a relative luminance of about 0.179, well below the halfway point, so a mid-grey already wants black text. The familiar shortcut of thresholding <code>(r*299 + g*587 + b*114)/1000</code> at 128 is an old NTSC brightness formula applied to gamma-encoded values, and it picks white for greys from roughly 118 to 128 where black scores higher.',
    },
  ],
  'css-minifier': [
    {
      q: 'Why can’t a minifier drop the unit from every zero?',
      a: 'Because only lengths may lose it. CSS allows <code>0px</code> to shrink to <code>0</code>, but a time, angle, frequency or resolution value requires its unit, so <code>transition-duration: 0s</code> is valid where a bare <code>0</code> is not. Inside <code>calc()</code> the rule tightens again: a unitless zero is a plain number rather than a length, which makes <code>calc(100% - 0)</code> invalid while <code>calc(100% - 0px)</code> parses.',
    },
    {
      q: 'Why did my @import stop working after I inlined the minified CSS?',
      a: 'Position, not minification. An <code>@import</code> is honoured only when it precedes every rule except <code>@charset</code> and <code>@layer</code>, so pasting a stylesheet below existing declarations in a style element makes the browser drop the import — silently, with nothing in the console. Move imports to the top of the combined file, or resolve them at build time; each one costs an extra round trip on the critical path regardless.',
    },
    {
      q: 'Why is my stylesheet still huge after minifying?',
      a: 'Minification removes characters, never rules. A framework build ships every selector it defines whether a page uses eight of them or eight hundred, and that dead weight is usually most of the file. Chrome DevTools’ Coverage panel reports the unused share against a real page load, and content-aware tooling such as Tailwind’s build step or PurgeCSS is what actually deletes those rules — a far larger win than whitespace.',
    },
  ],
  'subnet-calculator': [
    {
      q: 'How many hosts fit in a /26?',
      a: 'Sixty-two. A /26 leaves six host bits, so the block holds 2<sup>6</sup> = 64 addresses, and the all-zeros and all-ones addresses are reserved for the network identifier and the directed broadcast. The general form is 2<sup>(32 − prefix)</sup> − 2. The subtraction stops applying at the two ends: a /31 carries two usable addresses under RFC 3021 because a point-to-point link needs no broadcast, and a /32 is one host.',
    },
    {
      q: 'What is a wildcard mask and why is it inverted?',
      a: 'It is the bitwise complement of the subnet mask, so a /24 whose mask is <code>255.255.255.0</code> has the wildcard <code>0.0.0.255</code>. Cisco IOS access lists and OSPF <code>network</code> statements take this form: a 0 bit means the bit must match and a 1 bit means ignore it. Because the bits are only ever tested individually, a wildcard mask is allowed to be non-contiguous — <code>0.0.0.254</code> matches every even final octet — which is something no subnet mask can do.',
    },
    {
      q: 'Can a /24 start on any address?',
      a: 'No. A prefix has to begin on a multiple of its own size, so a /24 starts on a whole final octet, a /26 on 0, 64, 128 or 192, and a /20 on a multiple of 16 in the third octet. <code>192.168.1.130/24</code> is a perfectly valid way to describe a host and its mask, but the range it names is <code>192.168.1.0/24</code> — this tool masks the host bits off and shows both, because writing the interface address and reading it back as the network is a common source of an off-by-one subnet.',
    },
    {
      q: 'Should an IPv6 subnet ever be smaller than a /64?',
      a: 'Rarely, and never on a LAN. SLAAC — the mechanism by which hosts configure their own addresses under RFC 4862 — requires exactly 64 interface identifier bits, so a /65 or longer breaks autoconfiguration outright. The usual practice is a /64 per link no matter how few hosts are on it, a /56 or /48 delegated to a site, and longer prefixes reserved for point-to-point links and loopbacks where nothing autoconfigures. Address exhaustion is not a concern: a single /64 holds more addresses than the entire IPv4 internet, squared.',
    },
  ],
  'what-is-my-ip': [
    {
      q: 'Why does the city shown not match where I am?',
      a: 'Because it was never measured. The location comes from a registry mapping address blocks to the network operator that holds them, and the coordinates attached to a block describe where the operator registered it — often a regional exchange or a head office rather than your street. Country accuracy is high; city accuracy is commonly quoted around 50–80% within 50 km and is far worse on mobile networks, where a single block can cover a whole country. Nothing on this page reads your device’s location, and no site can without a permission prompt.',
    },
    {
      q: 'Why is my IP different on my phone and my laptop on the same wifi?',
      a: 'On IPv4 it should not be — everything behind one router shares its public address through NAT, and the difference usually means the phone dropped to mobile data. On IPv6 it is expected: each device holds its own globally routable address from the same prefix, and privacy extensions (RFC 8981) rotate the second half of it, typically once a day, so even one device sees its address change. A site reachable over both protocols will also show you a different address depending on which your browser chose.',
    },
    {
      q: 'Can I find someone’s physical address from their IP?',
      a: 'No. The best a public database gives is a city-level guess that is often wrong, and the operator’s own records — which do link an address to a subscriber — are disclosed only to a legal request. Carrier-grade NAT makes it worse still: a mobile operator may put thousands of subscribers behind one address, so even the operator needs the exact timestamp and source port to identify which. Services claiming to locate a person from an IP are selling the same registry guess you can see here.',
    },
    {
      q: 'Does hiding my IP with a VPN make me anonymous?',
      a: 'It moves the problem rather than removing it. Sites then see the VPN’s exit address instead of yours, and your provider sees the destination instead. But an IP is only one of many ways to recognise a browser: cookies, logins, and fingerprinting from fonts, canvas rendering and screen metrics all survive a change of address. A VPN is useful for hiding your traffic from the local network and your address from a site — it is not anonymity, and a provider that keeps logs simply relocates the record.',
    },
  ],
};
