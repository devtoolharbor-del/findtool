import type { Category } from '~/types';

/**
 * The FindTool taxonomy. Seven top-level categories, each mounted at the
 * root (e.g. /json) to keep URLs short. Adding a category here automatically
 * creates its page, nav entry, sitemap entry and homepage card.
 *
 * Keep this list small. If it ever outgrows ~10 entries, introduce
 * sub-categories rather than flattening more top-level paths.
 */
export const CATEGORIES: Category[] = [
  {
    id: 'json',
    slug: 'json',
    name: 'JSON & Data',
    shortName: 'JSON',
    tagline: 'Format, validate and convert structured data',
    seoTitle: 'JSON Tools — Format, Validate and Convert',
    seoDescription:
      'Free browser-based JSON tools: format, validate and minify JSON, explore it as a tree, and convert between JSON, CSV, YAML and XML. Nothing is uploaded.',
    intro:
      'Structured data is the format developers read and debug most, and it is rarely delivered in a readable shape. These tools clean up JSON, explain exactly where a document is malformed, and convert between the interchange formats you actually encounter — CSV exports, YAML config, and legacy XML payloads. Every conversion runs in your browser, so API responses and config files never leave your machine.',
    icon: 'braces',
    order: 1,
  },
  {
    id: 'encoding',
    slug: 'encoding',
    name: 'Encoding & Decoding',
    shortName: 'Encoding',
    tagline: 'Base64, URL, HTML entities, hex and JWT',
    seoTitle: 'Encoding Tools — Base64, URL, Hex and JWT',
    seoDescription:
      'Encode and decode Base64, URL percent-encoding, HTML entities, hex and Unicode, and inspect JWT tokens. All decoding happens locally in your browser.',
    intro:
      'Text crosses a lot of boundaries on its way through a system — URLs, HTTP headers, HTML documents, binary payloads — and each boundary has its own escaping rules. These tools move data between those representations and show you exactly what changed. Because tokens and payloads are often sensitive, every encoder and decoder here runs entirely client-side.',
    icon: 'binary',
    order: 2,
  },
  {
    id: 'generators',
    slug: 'generators',
    name: 'Generators',
    shortName: 'Generators',
    tagline: 'IDs, passwords, random data and placeholder text',
    seoTitle: 'Generators — UUID, Passwords, Random Data',
    seoDescription:
      'Generate UUIDs, Nano IDs, secure passwords, random strings, random numbers and Lorem Ipsum placeholder text. Uses the browser cryptographic random source.',
    intro:
      'Test fixtures, seed data, primary keys and credentials all need values that are unpredictable and correctly formatted. Every generator here draws from the browser’s cryptographically secure random source rather than <code>Math.random()</code>, so the output is safe to use for identifiers and secrets — and because generation is local, a password you create is never transmitted anywhere.',
    icon: 'dice',
    order: 3,
  },
  {
    id: 'security',
    slug: 'security',
    name: 'Hashing & Security',
    shortName: 'Security',
    tagline: 'SHA-256, SHA-1, MD5 and HMAC signatures',
    seoTitle: 'Hash Tools — SHA-256, SHA-1, MD5 and HMAC',
    seoDescription:
      'Compute SHA-256, SHA-1, MD5 and HMAC digests from text or files in your browser using the Web Crypto API. Includes guidance on which algorithms remain safe.',
    intro:
      'Hashes verify that a file arrived intact, sign a webhook, or fingerprint a piece of content. These tools compute digests with the Web Crypto API wherever the browser provides it, and clearly label the algorithms that are no longer collision-resistant. None of them are password hashing functions — for storing passwords you want a deliberately slow algorithm such as Argon2id or bcrypt instead.',
    icon: 'shield',
    order: 4,
  },
  {
    id: 'time',
    slug: 'time',
    name: 'Date & Time',
    shortName: 'Time',
    tagline: 'Timestamps, timezones, durations and cron',
    seoTitle: 'Date & Time Tools — Timestamps and Cron',
    seoDescription:
      'Convert Unix timestamps, translate ISO 8601 dates, compare timezones, measure date differences and build or explain cron expressions. Runs locally.',
    intro:
      'Time is where most off-by-one bugs live: seconds versus milliseconds, UTC versus local, and cron fields that do not mean what they look like. These tools make the ambiguous parts explicit — always showing you both the UTC and local reading of a value, and spelling out in plain English when a schedule will actually fire.',
    icon: 'clock',
    order: 5,
  },
  {
    id: 'text',
    slug: 'text',
    name: 'Text Tools',
    shortName: 'Text',
    tagline: 'Count, convert, clean, sort and compare text',
    seoTitle: 'Text Tools — Counters, Case, Diff and Lines',
    seoDescription:
      'Count words and characters, change text case, remove duplicate lines, sort lines, strip extra whitespace, generate URL slugs and diff two blocks of text.',
    intro:
      'Everyday text wrangling that is tedious in an editor and trivial with a dedicated tool: counting against a character limit, normalising case for a data import, de-duplicating a list, or spotting the one line that differs between two config files. All of it is Unicode-aware, which matters more than it sounds — emoji and accented characters break naive character counts.',
    icon: 'text',
    order: 6,
  },
  {
    id: 'web',
    slug: 'web',
    name: 'Web & Dev',
    shortName: 'Web',
    tagline: 'Regex, HTTP status codes, colors, CSS and user agents',
    seoTitle: 'Web Dev Tools — Regex, HTTP Codes, Colors',
    seoDescription:
      'Test regular expressions safely, look up HTTP status codes, parse user agent strings, convert colors between HEX, RGB, HSL and OKLCH, and minify CSS.',
    intro:
      'The reference material and quick checks that come up while building for the web. The regex tester runs your pattern inside a worker with a hard timeout, so a catastrophically backtracking expression cannot freeze the tab — a failure mode most online testers still have.',
    icon: 'code',
    order: 7,
  },
];

export const CATEGORY_MAP: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

export function getCategory(id: string): Category | undefined {
  return CATEGORY_MAP[id];
}

export function sortedCategories(): Category[] {
  return [...CATEGORIES].sort((a, b) => a.order - b.order);
}
