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
};
