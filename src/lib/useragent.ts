/**
 * A hand-written User-Agent parser.
 *
 * No dependencies, and no attempt to be a general-purpose device database:
 * the goal is to be right about the strings people actually paste, and honest
 * about the places where a UA string cannot be trusted at all.
 *
 * Order is the whole game here, because every modern UA string contains the
 * names of its ancestors:
 *
 *   Edge says   Edg/… Chrome/… Safari/… Mozilla/5.0
 *   Chrome says Chrome/… Safari/… Mozilla/5.0
 *   Safari says Safari/… Mozilla/5.0
 *
 * So the tests run most-specific first: Edge before Chrome, Chrome before
 * Safari, and every Chromium fork before Chrome. Get the order wrong and every
 * browser on earth is reported as Safari.
 *
 * The other trap is iPadOS. Since iPadOS 13, Safari on an iPad sends a string
 * that is byte-for-byte a Mac's, except that it keeps the `Mobile/15E148`
 * token that desktop Safari never sends. That token is the only tell, and it
 * is what `detectOs` and `detectDevice` key off.
 */

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'tv' | 'console' | 'bot' | 'unknown';

export type BotKind = 'search' | 'ai' | 'social' | 'tool' | 'monitor' | 'other';

export interface NameVersion {
  name: string;
  /** Dotted version as reported, or null when the string does not carry one. */
  version: string | null;
}

export interface UserAgentInfo {
  raw: string;
  browser: NameVersion & { major: number | null };
  engine: NameVersion;
  os: NameVersion;
  device: {
    type: DeviceType;
    vendor: string | null;
    model: string | null;
  };
  bot: {
    isBot: boolean;
    name: string | null;
    kind: BotKind | null;
  };
  /**
   * Things worth telling the reader about this particular string — a frozen
   * version number, an ambiguous OS, a legacy token that means nothing.
   */
  notes: string[];
}

interface Rule {
  name: string;
  re: RegExp;
  /** Which capture group holds the version. Default 1; 0 means "no version". */
  group?: number;
}

// ─── Bots ─────────────────────────────────────────────────────────────────

/**
 * Checked before anything else. Most crawlers impersonate a browser, so a
 * bot hit does not stop browser detection — a Googlebot string really is
 * Chrome, and saying so is more useful than blanking the fields.
 */
const BOT_RULES: Array<{ name: string; re: RegExp; kind: BotKind }> = [
  { name: 'Googlebot', re: /Googlebot(?:-(?:Image|News|Video))?\/?([\d.]+)?/i, kind: 'search' },
  { name: 'Google-InspectionTool', re: /Google-InspectionTool\/?([\d.]+)?/i, kind: 'search' },
  { name: 'Google AdsBot', re: /AdsBot-Google(?:-Mobile)?/i, kind: 'search' },
  { name: 'Bingbot', re: /bingbot\/?([\d.]+)?/i, kind: 'search' },
  { name: 'DuckDuckBot', re: /DuckDuckBot(?:-Https)?\/?([\d.]+)?/i, kind: 'search' },
  { name: 'Yandex Bot', re: /YandexBot\/?([\d.]+)?/i, kind: 'search' },
  { name: 'Baiduspider', re: /Baiduspider(?:-\w+)?\/?([\d.]+)?/i, kind: 'search' },
  { name: 'Applebot', re: /Applebot(?:-Extended)?\/?([\d.]+)?/i, kind: 'search' },
  { name: 'Yahoo! Slurp', re: /Slurp/i, kind: 'search' },
  { name: 'PetalBot', re: /PetalBot/i, kind: 'search' },
  { name: 'GPTBot', re: /GPTBot\/?([\d.]+)?/i, kind: 'ai' },
  { name: 'OAI-SearchBot', re: /OAI-SearchBot\/?([\d.]+)?/i, kind: 'ai' },
  { name: 'ChatGPT-User', re: /ChatGPT-User\/?([\d.]+)?/i, kind: 'ai' },
  { name: 'ClaudeBot', re: /ClaudeBot\/?([\d.]+)?/i, kind: 'ai' },
  { name: 'PerplexityBot', re: /PerplexityBot\/?([\d.]+)?/i, kind: 'ai' },
  { name: 'CCBot', re: /CCBot\/?([\d.]+)?/i, kind: 'ai' },
  { name: 'Bytespider', re: /Bytespider/i, kind: 'ai' },
  { name: 'Facebook crawler', re: /facebookexternalhit\/?([\d.]+)?/i, kind: 'social' },
  { name: 'Meta external agent', re: /meta-externalagent\/?([\d.]+)?/i, kind: 'social' },
  { name: 'Twitterbot', re: /Twitterbot\/?([\d.]+)?/i, kind: 'social' },
  { name: 'LinkedInBot', re: /LinkedInBot\/?([\d.]+)?/i, kind: 'social' },
  { name: 'Slackbot', re: /Slackbot(?:-LinkExpanding)?\/?([\d.]+)?/i, kind: 'social' },
  { name: 'Discordbot', re: /Discordbot\/?([\d.]+)?/i, kind: 'social' },
  { name: 'WhatsApp', re: /WhatsApp\/?([\d.]+)?/i, kind: 'social' },
  { name: 'TelegramBot', re: /TelegramBot/i, kind: 'social' },
  { name: 'AhrefsBot', re: /AhrefsBot\/?([\d.]+)?/i, kind: 'monitor' },
  { name: 'SemrushBot', re: /SemrushBot\/?([\d.]+)?/i, kind: 'monitor' },
  { name: 'MJ12bot', re: /MJ12bot\/?v?([\d.]+)?/i, kind: 'monitor' },
  { name: 'UptimeRobot', re: /UptimeRobot\/?([\d.]+)?/i, kind: 'monitor' },
  { name: 'Pingdom', re: /Pingdom(?:\.com_bot)?\/?([\d.]+)?/i, kind: 'monitor' },
  { name: 'Lighthouse', re: /(?:Chrome-)?Lighthouse\/?([\d.]+)?/i, kind: 'monitor' },
  { name: 'Headless Chrome', re: /HeadlessChrome\/?([\d.]+)?/i, kind: 'tool' },
  { name: 'curl', re: /^curl\/([\d.]+)/i, kind: 'tool' },
  { name: 'Wget', re: /^Wget\/([\d.]+)/i, kind: 'tool' },
  { name: 'Postman', re: /PostmanRuntime\/([\d.]+)/i, kind: 'tool' },
  { name: 'python-requests', re: /python-requests\/([\d.]+)/i, kind: 'tool' },
  { name: 'python-httpx', re: /python-httpx\/([\d.]+)/i, kind: 'tool' },
  { name: 'axios', re: /axios\/([\d.]+)/i, kind: 'tool' },
  { name: 'node-fetch', re: /node-fetch\/?([\d.]+)?/i, kind: 'tool' },
  { name: 'Go HTTP client', re: /Go-http-client\/([\d.]+)/i, kind: 'tool' },
  { name: 'Java', re: /^Java\/([\d._]+)/i, kind: 'tool' },
  { name: 'OkHttp', re: /okhttp\/([\d.]+)/i, kind: 'tool' },
  { name: 'libwww-perl', re: /libwww-perl\/([\d.]+)/i, kind: 'tool' },
  // Last resort: anything self-describing. Deliberately after the named list
  // so "Googlebot" is never reported as the generic "Bot".
  { name: 'Unidentified bot', re: /\b(?:bot|crawler|spider|crawl|slurp)\b/i, kind: 'other' },
];

// ─── Browsers ─────────────────────────────────────────────────────────────

/** Most specific first. See the note at the top of this file about ordering. */
const BROWSER_RULES: Rule[] = [
  { name: 'Microsoft Edge', re: /EdgiOS\/([\d.]+)/ },
  { name: 'Microsoft Edge', re: /EdgA\/([\d.]+)/ },
  { name: 'Microsoft Edge', re: /Edg\/([\d.]+)/ },
  { name: 'Microsoft Edge Legacy', re: /Edge\/([\d.]+)/ },
  { name: 'Opera', re: /OPiOS\/([\d.]+)/ },
  { name: 'Opera GX', re: /OPX\/([\d.]+)/ },
  { name: 'Opera', re: /OPR\/([\d.]+)/ },
  { name: 'Opera', re: /(?:^|\s)Opera[\s/]([\d.]+)/ },
  { name: 'Vivaldi', re: /Vivaldi\/([\d.]+)/ },
  { name: 'Brave', re: /Brave\/([\d.]+)/ },
  { name: 'Yandex Browser', re: /YaBrowser\/([\d.]+)/ },
  { name: 'Samsung Internet', re: /SamsungBrowser\/([\d.]+)/ },
  { name: 'UC Browser', re: /UCBrowser\/([\d.]+)/ },
  { name: 'DuckDuckGo', re: /DuckDuckGo\/([\d.]+)/ },
  { name: 'Silk', re: /Silk\/([\d.]+)/ },
  { name: 'Chrome', re: /CriOS\/([\d.]+)/ },
  { name: 'Firefox', re: /FxiOS\/([\d.]+)/ },
  { name: 'Firefox Focus', re: /Focus\/([\d.]+)/ },
  { name: 'Chromium', re: /Chromium\/([\d.]+)/ },
  { name: 'Chrome', re: /(?:HeadlessChrome|Chrome)\/([\d.]+)/ },
  { name: 'Firefox', re: /Firefox\/([\d.]+)/ },
  { name: 'SeaMonkey', re: /SeaMonkey\/([\d.]+)/ },
  { name: 'Internet Explorer', re: /Trident\/[\d.]+;.*\brv:([\d.]+)/ },
  { name: 'Internet Explorer', re: /MSIE ([\d.]+)/ },
  { name: 'Safari', re: /Version\/([\d.]+).*\bSafari\// },
  { name: 'Safari', re: /\bSafari\/([\d.]+)/ },
  { name: 'WebKit browser', re: /AppleWebKit\/([\d.]+)/ },
];

/** Forks that are Chromium underneath and therefore run Blink. */
const CHROMIUM_FORKS = new Set([
  'Chrome',
  'Chromium',
  'Microsoft Edge',
  'Opera',
  'Opera GX',
  'Vivaldi',
  'Brave',
  'Yandex Browser',
  'Samsung Internet',
  'UC Browser',
  'Silk',
]);

// ─── Operating systems ────────────────────────────────────────────────────

const WINDOWS_NT: Record<string, string> = {
  '10.0': '10',
  '6.3': '8.1',
  '6.2': '8',
  '6.1': '7',
  '6.0': 'Vista',
  '5.2': 'XP 64-bit',
  '5.1': 'XP',
  '5.0': '2000',
};

// ─── Parsing ──────────────────────────────────────────────────────────────

function firstMatch(ua: string, rules: Rule[]): { name: string; version: string | null } | null {
  for (const rule of rules) {
    const m = rule.re.exec(ua);
    if (m) return { name: rule.name, version: m[rule.group ?? 1] ?? null };
  }
  return null;
}

function majorOf(version: string | null): number | null {
  if (!version) return null;
  const n = Number.parseInt(version, 10);
  return Number.isNaN(n) ? null : n;
}

/** iPad and macOS both report `Mac OS X 10_15_7`; only the iPad adds `Mobile/`. */
function isIpadPretendingToBeAMac(ua: string): boolean {
  return /Macintosh/.test(ua) && /\bMobile\/\w+/.test(ua);
}

function detectBot(ua: string): UserAgentInfo['bot'] {
  for (const rule of BOT_RULES) {
    const m = rule.re.exec(ua);
    if (!m) continue;
    const version = m[1];
    return {
      isBot: true,
      name: version ? `${rule.name} ${version}` : rule.name,
      kind: rule.kind,
    };
  }
  return { isBot: false, name: null, kind: null };
}

function detectOs(ua: string): NameVersion {
  if (isIpadPretendingToBeAMac(ua)) return { name: 'iPadOS', version: null };

  let m: RegExpExecArray | null;

  if ((m = /Windows Phone(?: OS)? ([\d.]+)/.exec(ua))) {
    return { name: 'Windows Phone', version: m[1]! };
  }
  if ((m = /Windows NT ([\d.]+)/.exec(ua))) {
    return { name: 'Windows', version: WINDOWS_NT[m[1]!] ?? m[1]! };
  }
  if (/Windows/.test(ua) && !/Windows NT/.test(ua)) {
    return { name: 'Windows', version: null };
  }
  if ((m = /(?:iPhone OS|iPad; CPU OS|CPU iPhone OS|CPU OS) ([\d_]+)/.exec(ua))) {
    const version = m[1]!.replace(/_/g, '.');
    return { name: /iPad/.test(ua) ? 'iPadOS' : 'iOS', version };
  }
  if (/iPhone|iPod|iPad/.test(ua)) {
    return { name: /iPad/.test(ua) ? 'iPadOS' : 'iOS', version: null };
  }
  if ((m = /Mac OS X ([\d_.]+)/.exec(ua))) {
    return { name: 'macOS', version: m[1]!.replace(/_/g, '.') };
  }
  if (/Mac OS X|Macintosh/.test(ua)) return { name: 'macOS', version: null };
  if ((m = /Android[\s/]([\d.]+)/.exec(ua))) return { name: 'Android', version: m[1]! };
  if (/Android/.test(ua)) return { name: 'Android', version: null };
  if ((m = /CrOS \S+ ([\d.]+)/.exec(ua))) return { name: 'ChromeOS', version: m[1]! };
  if (/CrOS/.test(ua)) return { name: 'ChromeOS', version: null };
  if ((m = /Ubuntu(?:\/([\d.]+))?/.exec(ua))) return { name: 'Ubuntu', version: m[1] ?? null };
  if ((m = /Fedora(?:\/([\d.]+))?/.exec(ua))) return { name: 'Fedora', version: m[1] ?? null };
  if (/(?:Linux|X11)/.test(ua)) return { name: 'Linux', version: null };
  if ((m = /(FreeBSD|OpenBSD|NetBSD)/.exec(ua))) return { name: m[1]!, version: null };
  if (/PlayStation/.test(ua)) return { name: 'PlayStation OS', version: null };
  if (/Xbox/.test(ua)) return { name: 'Xbox OS', version: null };
  return { name: 'Unknown', version: null };
}

function detectEngine(ua: string, browserName: string): NameVersion {
  let m: RegExpExecArray | null;

  if (browserName === 'Internet Explorer') {
    m = /Trident\/([\d.]+)/.exec(ua);
    return { name: 'Trident', version: m?.[1] ?? null };
  }
  if (browserName === 'Microsoft Edge Legacy') {
    m = /Edge\/([\d.]+)/.exec(ua);
    return { name: 'EdgeHTML', version: m?.[1] ?? null };
  }
  if ((m = /Presto\/([\d.]+)/.exec(ua))) return { name: 'Presto', version: m[1]! };

  // Every browser on iOS is WebKit — the App Store requires it — so a
  // "Chrome" on an iPhone is Blink nowhere and WebKit everywhere.
  const onIos = /iPhone|iPad|iPod|CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) || isIpadPretendingToBeAMac(ua);
  if (!onIos && CHROMIUM_FORKS.has(browserName)) {
    m = /Chrome\/([\d.]+)/.exec(ua);
    return { name: 'Blink', version: m?.[1] ?? null };
  }
  // "like Gecko" is not Gecko. Only a real "Gecko/<build>" token, or Firefox
  // itself off iOS, counts — Firefox on iOS is WebKit like everything else.
  if (!onIos && (/Gecko\/\d/.test(ua) || browserName === 'Firefox' || browserName === 'SeaMonkey')) {
    m = /\brv:([\d.]+)/.exec(ua) ?? /Firefox\/([\d.]+)/.exec(ua);
    return { name: 'Gecko', version: m?.[1] ?? null };
  }
  if ((m = /AppleWebKit\/([\d.]+)/.exec(ua))) return { name: 'WebKit', version: m[1]! };
  return { name: 'Unknown', version: null };
}

function detectDevice(ua: string, isBot: boolean): UserAgentInfo['device'] {
  if (isBot) return { type: 'bot', vendor: null, model: null };

  if (isIpadPretendingToBeAMac(ua)) return { type: 'tablet', vendor: 'Apple', model: 'iPad' };
  if (/iPad/.test(ua)) return { type: 'tablet', vendor: 'Apple', model: 'iPad' };
  if (/iPhone/.test(ua)) return { type: 'mobile', vendor: 'Apple', model: 'iPhone' };
  if (/iPod/.test(ua)) return { type: 'mobile', vendor: 'Apple', model: 'iPod touch' };
  if (/Apple ?TV/i.test(ua)) return { type: 'tv', vendor: 'Apple', model: 'Apple TV' };

  if (/PlayStation/.test(ua)) return { type: 'console', vendor: 'Sony', model: 'PlayStation' };
  if (/Xbox/.test(ua)) return { type: 'console', vendor: 'Microsoft', model: 'Xbox' };
  if (/Nintendo/.test(ua)) return { type: 'console', vendor: 'Nintendo', model: null };
  if (/SMART-TV|SmartTV|GoogleTV|HbbTV|Roku|Web0S|NetCast/i.test(ua)) {
    return { type: 'tv', vendor: null, model: null };
  }

  if (/Android/.test(ua)) {
    const model = androidModel(ua);
    // Google's own rule: an Android tablet omits the "Mobile" token.
    return {
      type: /\bMobile\b/.test(ua) ? 'mobile' : 'tablet',
      vendor: vendorFromModel(model),
      model,
    };
  }

  if (/Windows Phone|IEMobile/.test(ua)) return { type: 'mobile', vendor: null, model: null };
  if (/\bMobile\b/.test(ua)) return { type: 'mobile', vendor: null, model: null };
  if (/Macintosh|Windows|Linux|X11|CrOS|FreeBSD|OpenBSD/.test(ua)) {
    return { type: 'desktop', vendor: null, model: null };
  }
  return { type: 'unknown', vendor: null, model: null };
}

function androidModel(ua: string): string | null {
  // "…(Linux; Android 14; SM-S911B Build/UP1A.231005.007) …" — the model sits
  // between the Android version and either "Build/" or the closing bracket.
  const m = /Android [\d.]+(?:;|\))\s*([^;)]*?)(?:\s+Build\/[^;)]*)?[;)]/.exec(ua);
  const model = m?.[1]?.trim();
  if (!model || /^(?:wv|K)$/.test(model)) return null; // "K" is Chrome's redacted model
  return model;
}

function vendorFromModel(model: string | null): string | null {
  if (!model) return null;
  if (/^SM-|^GT-|^SCH-|^SPH-/.test(model)) return 'Samsung';
  if (/^Pixel/.test(model)) return 'Google';
  if (/^Nexus/.test(model)) return 'Google';
  if (/^moto|^XT\d/i.test(model)) return 'Motorola';
  if (/^ONEPLUS|^IN\d{4}/i.test(model)) return 'OnePlus';
  if (/^Mi |^Redmi|^POCO|^M\d{4}/i.test(model)) return 'Xiaomi';
  return null;
}

/**
 * Collect the "this string is lying to you" notes. They are the point of the
 * tool: the fields above are a best guess, and these say where the guess is
 * structurally unreliable rather than merely incomplete.
 */
function buildNotes(ua: string, info: Omit<UserAgentInfo, 'notes'>): string[] {
  const notes: string[] = [];

  if (/^Mozilla\/5\.0/.test(ua) && info.browser.name !== 'Unknown') {
    notes.push(
      'Starts with "Mozilla/5.0", which every browser sends. It dates from 1994, when servers checked for "Mozilla" before serving frames — it identifies nothing today.',
    );
  }
  if (info.engine.name === 'Blink' && /Safari\/537\.36/.test(ua)) {
    notes.push(
      'Contains "Safari/537.36" even though this is not Safari. Chromium kept the token so that scripts sniffing for WebKit would keep working; 537.36 has been frozen since 2013.',
    );
  }
  if (/like Gecko/.test(ua) && info.engine.name !== 'Gecko') {
    notes.push('Claims to be "like Gecko" without using Gecko. This is decoration, not information.');
  }
  if (info.os.name === 'Windows' && info.os.version === '10') {
    notes.push(
      'Windows 11 also reports "Windows NT 10.0". The two are indistinguishable from the UA string — only the high-entropy Client Hint sec-ch-ua-platform-version can tell them apart.',
    );
  }
  if (info.os.name === 'macOS' && info.os.version === '10.15.7') {
    notes.push(
      'macOS has reported "10_15_7" since Big Sur regardless of the real version, to avoid breaking sites that compare version strings. The actual OS may be far newer.',
    );
  }
  if (info.os.name === 'iPadOS' && isIpadPretendingToBeAMac(ua)) {
    notes.push(
      'This is an iPad, not a Mac. Since iPadOS 13 Safari sends a desktop Mac string; the only surviving clue is the "Mobile/" token, which desktop Safari never sends.',
    );
  }
  if (/\bwv\b/.test(ua) && info.os.name === 'Android') {
    notes.push(
      'The "wv" token marks an Android WebView — an app rendering a page in-process, not the standalone Chrome browser.',
    );
  }
  if (info.browser.version && /^\d+\.0\.0\.0$/.test(info.browser.version)) {
    notes.push(
      'The version ends in ".0.0.0" because Chromium now reduces the UA string: the minor, build and patch numbers are permanently zero and only the major version is real.',
    );
  }
  if (info.bot.isBot) {
    notes.push(
      'This string identifies itself as automated. Any client can claim to be Googlebot, so treat it as a hint and verify by reverse DNS before granting privileges.',
    );
  }
  return notes;
}

/**
 * Parse a User-Agent string. Never throws: an unrecognised string comes back
 * with "Unknown" fields rather than an error, because a half-answer about an
 * obscure client is still useful.
 */
export function parseUserAgent(input: string): UserAgentInfo {
  const ua = input.trim();

  if (!ua) {
    return {
      raw: '',
      browser: { name: 'Unknown', version: null, major: null },
      engine: { name: 'Unknown', version: null },
      os: { name: 'Unknown', version: null },
      device: { type: 'unknown', vendor: null, model: null },
      bot: { isBot: false, name: null, kind: null },
      notes: [],
    };
  }

  const bot = detectBot(ua);
  const browserHit = firstMatch(ua, BROWSER_RULES);
  const browserName = browserHit?.name ?? 'Unknown';
  const browser = {
    name: browserName,
    version: browserHit?.version ?? null,
    major: majorOf(browserHit?.version ?? null),
  };
  const engine = detectEngine(ua, browserName);
  const os = detectOs(ua);
  const device = detectDevice(ua, bot.isBot);

  const partial = { raw: ua, browser, engine, os, device, bot };
  return { ...partial, notes: buildNotes(ua, partial) };
}

/** A one-line summary, e.g. "Chrome 120 on Windows 10 (desktop)". */
export function describeUserAgent(info: UserAgentInfo): string {
  if (!info.raw) return 'Nothing parsed yet.';
  const browser = info.browser.major
    ? `${info.browser.name} ${info.browser.major}`
    : info.browser.name;
  const os = info.os.version ? `${info.os.name} ${info.os.version}` : info.os.name;
  const tail = info.bot.isBot ? ` — automated client: ${info.bot.name}` : ` (${info.device.type})`;
  return `${browser} on ${os}${tail}`;
}

/** Real strings, used for the example buttons and as parser test fixtures. */
export const SAMPLE_USER_AGENTS: Array<{ label: string; ua: string }> = [
  {
    label: 'Chrome on Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  },
  {
    label: 'Safari on macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  },
  {
    label: 'Safari on iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  },
  {
    label: 'Safari on iPad (reports as a Mac)',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  },
  {
    label: 'Chrome on Android',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  },
  {
    label: 'Edge on Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.42',
  },
  {
    label: 'Firefox on Linux',
    ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  },
  {
    label: 'Googlebot',
    ua: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
];

export const SAMPLE_USER_AGENT = SAMPLE_USER_AGENTS[0]!.ua;
