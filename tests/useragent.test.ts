import { describe, expect, it } from 'vitest';
import { describeUserAgent, parseUserAgent, SAMPLE_USER_AGENTS } from '~/lib/useragent';

/** Real strings, copied verbatim from the browsers that send them. */
const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1',
  firefoxWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
  firefoxMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:130.0) Gecko/20100101 Firefox/130.0',
  firefoxAndroid:
    'Mozilla/5.0 (Android 14; Mobile; rv:129.0) Gecko/129.0 Firefox/129.0',
  firefoxIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  safariIpad:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  safariIpadLegacy:
    'Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.42',
  edgeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.2651.86',
  edgeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 EdgA/128.0.2739.33',
  edgeLegacy:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134',
  opera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  ie11:
    'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
  googlebot:
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  curl: 'curl/8.7.1',
} as const;

describe('Chrome', () => {
  it('parses Chrome on Windows without mistaking it for Safari', () => {
    const info = parseUserAgent(UA.chromeWindows);
    expect(info.browser.name).toBe('Chrome');
    expect(info.browser.major).toBe(128);
    expect(info.engine.name).toBe('Blink');
    expect(info.os.name).toBe('Windows');
    expect(info.os.version).toBe('10');
    expect(info.device.type).toBe('desktop');
    expect(info.bot.isBot).toBe(false);
  });

  it('parses Chrome on macOS', () => {
    const info = parseUserAgent(UA.chromeMac);
    expect(info.browser.name).toBe('Chrome');
    expect(info.os.name).toBe('macOS');
    expect(info.os.version).toBe('10.15.7');
    expect(info.device.type).toBe('desktop');
  });

  it('parses Chrome on Android, with the device model', () => {
    const info = parseUserAgent(UA.chromeAndroid);
    expect(info.browser.name).toBe('Chrome');
    expect(info.os).toEqual({ name: 'Android', version: '14' });
    expect(info.device.type).toBe('mobile');
    expect(info.device.model).toBe('SM-S911B');
    expect(info.device.vendor).toBe('Samsung');
  });

  it('knows Chrome on iOS is WebKit, not Blink', () => {
    const info = parseUserAgent(UA.chromeIos);
    expect(info.browser.name).toBe('Chrome');
    expect(info.browser.major).toBe(126);
    expect(info.engine.name).toBe('WebKit');
    expect(info.os.name).toBe('iOS');
    expect(info.os.version).toBe('17.5.1');
    expect(info.device.type).toBe('mobile');
  });
});

describe('Firefox', () => {
  it('parses Firefox on Windows', () => {
    const info = parseUserAgent(UA.firefoxWindows);
    expect(info.browser.name).toBe('Firefox');
    expect(info.browser.major).toBe(129);
    expect(info.engine.name).toBe('Gecko');
    expect(info.engine.version).toBe('129.0');
    expect(info.os.name).toBe('Windows');
  });

  it('parses Firefox on macOS', () => {
    const info = parseUserAgent(UA.firefoxMac);
    expect(info.browser.name).toBe('Firefox');
    expect(info.os).toEqual({ name: 'macOS', version: '14.6' });
  });

  it('parses Firefox on Android', () => {
    const info = parseUserAgent(UA.firefoxAndroid);
    expect(info.browser.name).toBe('Firefox');
    expect(info.os.name).toBe('Android');
    expect(info.device.type).toBe('mobile');
  });

  it('knows Firefox on iOS is WebKit', () => {
    const info = parseUserAgent(UA.firefoxIos);
    expect(info.browser.name).toBe('Firefox');
    expect(info.browser.major).toBe(127);
    expect(info.engine.name).toBe('WebKit');
    expect(info.os.name).toBe('iOS');
  });
});

describe('Safari', () => {
  it('parses Safari on macOS and reads the Version token, not Safari/', () => {
    const info = parseUserAgent(UA.safariMac);
    expect(info.browser.name).toBe('Safari');
    expect(info.browser.version).toBe('17.6');
    expect(info.engine.name).toBe('WebKit');
    expect(info.os.name).toBe('macOS');
    expect(info.device.type).toBe('desktop');
  });

  it('parses Safari on iPhone', () => {
    const info = parseUserAgent(UA.safariIphone);
    expect(info.browser.name).toBe('Safari');
    expect(info.os.name).toBe('iOS');
    expect(info.os.version).toBe('17.6.1');
    expect(info.device.type).toBe('mobile');
    expect(info.device.model).toBe('iPhone');
  });

  it('sees through modern iPadOS Safari claiming to be a Mac', () => {
    const info = parseUserAgent(UA.safariIpad);
    expect(info.os.name).toBe('iPadOS');
    expect(info.device.type).toBe('tablet');
    expect(info.device.model).toBe('iPad');
    expect(info.notes.join(' ')).toMatch(/iPad, not a Mac/);
  });

  it('still parses the older iPad string that says iPad outright', () => {
    const info = parseUserAgent(UA.safariIpadLegacy);
    expect(info.os).toEqual({ name: 'iPadOS', version: '12.5.7' });
    expect(info.device.type).toBe('tablet');
  });

  it('does not mistake a Mac for an iPad', () => {
    const info = parseUserAgent(UA.safariMac);
    expect(info.os.name).toBe('macOS');
    expect(info.device.type).toBe('desktop');
  });
});

describe('Edge and other Chromium forks', () => {
  it('matches Edge before Chrome on Windows', () => {
    const info = parseUserAgent(UA.edgeWindows);
    expect(info.browser.name).toBe('Microsoft Edge');
    expect(info.browser.version).toBe('128.0.2739.42');
    expect(info.engine.name).toBe('Blink');
    expect(info.os.name).toBe('Windows');
  });

  it('matches Edge on macOS', () => {
    const info = parseUserAgent(UA.edgeMac);
    expect(info.browser.name).toBe('Microsoft Edge');
    expect(info.os.name).toBe('macOS');
  });

  it('matches Edge on Android through the EdgA token', () => {
    const info = parseUserAgent(UA.edgeAndroid);
    expect(info.browser.name).toBe('Microsoft Edge');
    expect(info.device.type).toBe('mobile');
    expect(info.device.model).toBeNull(); // "K" is Chrome's redacted model
  });

  it('separates legacy EdgeHTML from Chromium Edge', () => {
    const info = parseUserAgent(UA.edgeLegacy);
    expect(info.browser.name).toBe('Microsoft Edge Legacy');
    expect(info.engine.name).toBe('EdgeHTML');
  });

  it('matches Opera before Chrome', () => {
    const info = parseUserAgent(UA.opera);
    expect(info.browser.name).toBe('Opera');
    expect(info.browser.major).toBe(112);
    expect(info.engine.name).toBe('Blink');
  });

  it('matches Samsung Internet before Chrome', () => {
    const info = parseUserAgent(UA.samsung);
    expect(info.browser.name).toBe('Samsung Internet');
    expect(info.browser.version).toBe('23.0');
    expect(info.device.type).toBe('mobile');
  });

  it('treats an Android device with no Mobile token as a tablet', () => {
    const info = parseUserAgent(UA.androidTablet);
    expect(info.device.type).toBe('tablet');
    expect(info.os.name).toBe('Android');
  });
});

describe('Internet Explorer', () => {
  it('reads IE 11 from Trident and rv, since it never says MSIE', () => {
    const info = parseUserAgent(UA.ie11);
    expect(info.browser.name).toBe('Internet Explorer');
    expect(info.browser.version).toBe('11.0');
    expect(info.engine.name).toBe('Trident');
    expect(info.os.version).toBe('7');
  });
});

describe('bots', () => {
  it('identifies Googlebot even though it presents as Chrome on Android', () => {
    const info = parseUserAgent(UA.googlebot);
    expect(info.bot.isBot).toBe(true);
    expect(info.bot.name).toMatch(/^Googlebot/);
    expect(info.bot.kind).toBe('search');
    expect(info.device.type).toBe('bot');
    // The underlying browser is still reported, because it is still true.
    expect(info.browser.name).toBe('Chrome');
    expect(info.notes.join(' ')).toMatch(/reverse DNS/);
  });

  it('identifies bingbot', () => {
    const info = parseUserAgent(UA.bingbot);
    expect(info.bot.isBot).toBe(true);
    expect(info.bot.name).toMatch(/^Bingbot/);
  });

  it('identifies curl as a tool, not a browser', () => {
    const info = parseUserAgent(UA.curl);
    expect(info.bot.isBot).toBe(true);
    expect(info.bot.kind).toBe('tool');
    expect(info.bot.name).toBe('curl 8.7.1');
  });

  it('does not flag an ordinary browser as a bot', () => {
    for (const ua of [UA.chromeWindows, UA.safariMac, UA.firefoxWindows, UA.edgeWindows]) {
      expect(parseUserAgent(ua).bot.isBot, ua).toBe(false);
    }
  });
});

describe('notes about strings that lie', () => {
  it('flags the frozen Safari token in every Chromium string', () => {
    expect(parseUserAgent(UA.chromeWindows).notes.join(' ')).toMatch(/Safari\/537\.36/);
  });

  it('flags the Windows 10 / 11 ambiguity', () => {
    expect(parseUserAgent(UA.chromeWindows).notes.join(' ')).toMatch(/Windows 11/);
  });

  it('flags the frozen macOS 10.15.7 version', () => {
    expect(parseUserAgent(UA.safariMac).notes.join(' ')).toMatch(/10_15_7|10\.15\.7/);
  });

  it('flags Chromium UA reduction when the version ends in .0.0.0', () => {
    expect(parseUserAgent(UA.chromeWindows).notes.join(' ')).toMatch(/reduces/);
  });
});

describe('robustness', () => {
  it('never throws, whatever it is given', () => {
    for (const input of ['', '   ', 'x', '((((', 'Mozilla/5.0', '🙂', 'Mozilla/5.0 (Unknown)']) {
      expect(() => parseUserAgent(input)).not.toThrow();
    }
  });

  it('reports Unknown rather than guessing, for empty input', () => {
    const info = parseUserAgent('');
    expect(info.browser.name).toBe('Unknown');
    expect(info.device.type).toBe('unknown');
    expect(info.notes).toEqual([]);
  });

  it('summarises in one line', () => {
    expect(describeUserAgent(parseUserAgent(UA.chromeWindows))).toBe(
      'Chrome 128 on Windows 10 (desktop)',
    );
    expect(describeUserAgent(parseUserAgent(UA.googlebot))).toMatch(/Googlebot/);
  });

  it('parses every bundled example without falling back to Unknown', () => {
    for (const { label, ua } of SAMPLE_USER_AGENTS) {
      const info = parseUserAgent(ua);
      expect(info.browser.name, label).not.toBe('Unknown');
      expect(info.os.name, label).not.toBe('Unknown');
    }
  });
});
