import type { Tool } from '~/types';
import { LAUNCH_DATE } from '~/consts';

/**
 * The FindTool tool registry.
 *
 * This array is the single source of truth. Routing, navigation, search,
 * category pages, related-tool blocks, the sitemap and all metadata are
 * derived from it — nothing about a tool is hard-coded anywhere else.
 *
 * To add tool #51:
 *   1. Create src/tools/<Component>.astro
 *   2. Append one entry below
 *   3. Done — the route, nav, search index and sitemap update themselves.
 *
 * See README.md → "Adding a new tool" for the full contract.
 */
export const TOOLS: Tool[] = [
  // ─── JSON & Data ────────────────────────────────────────────────────────
  {
    slug: 'json-formatter',
    name: 'JSON Formatter',
    category: 'json',
    description:
      'Pretty-print, validate and minify JSON with syntax highlighting and precise error locations.',
    seoTitle: 'JSON Formatter — Format, Validate and Beautify JSON Online',
    seoDescription:
      'Format messy JSON into readable, indented output with syntax highlighting. Jump to the exact line of any syntax error, then minify, copy or download.',
    keywords: ['json formatter', 'json beautifier', 'pretty print json', 'format json', 'json indent'],
    aliases: ['beautify', 'pretty', 'prettify', 'indent', 'json pretty print'],
    related: ['json-validator', 'json-minifier', 'json-viewer', 'json-to-yaml', 'json-to-csv'],
    component: 'JsonFormatter',
    icon: 'braces',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'json-validator',
    name: 'JSON Validator',
    category: 'json',
    description:
      'Check whether JSON is valid and get the exact line, column and cause of any syntax error.',
    seoTitle: 'JSON Validator — Check JSON Syntax and Find Errors Online',
    seoDescription:
      'Validate JSON against the specification and see exactly where it breaks, with line and column numbers, the offending character, and a plain-English explanation of the problem.',
    keywords: ['json validator', 'validate json', 'json syntax checker', 'json lint', 'is my json valid'],
    aliases: ['lint', 'check', 'verify', 'jsonlint', 'syntax error'],
    related: ['json-formatter', 'json-viewer', 'json-minifier', 'yaml-to-json'],
    component: 'JsonValidator',
    icon: 'check-circle',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'json-minifier',
    name: 'JSON Minifier',
    category: 'json',
    description:
      'Strip whitespace from JSON to shrink payloads, with a live byte-size saving comparison.',
    seoTitle: 'JSON Minifier — Compress and Minify JSON Online',
    seoDescription:
      'Remove every unnecessary space and newline from JSON to reduce payload size. Shows original size, minified size and the exact percentage saved.',
    keywords: ['json minifier', 'minify json', 'compress json', 'json compactor', 'reduce json size'],
    aliases: ['compact', 'shrink', 'compress', 'uglify', 'strip whitespace'],
    related: ['json-formatter', 'json-validator', 'css-minifier', 'json-viewer'],
    component: 'JsonMinifier',
    icon: 'minimize',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'json-viewer',
    name: 'JSON Viewer',
    category: 'json',
    description:
      'Explore large JSON as a collapsible tree, with search, type badges and copyable paths.',
    seoTitle: 'JSON Viewer — Interactive JSON Tree Explorer Online',
    seoDescription:
      'Browse deeply nested JSON as an expandable tree. Collapse noisy branches, search keys and values, see the type of every node, and copy the dot-notation path to any field.',
    keywords: ['json viewer', 'json tree viewer', 'json explorer', 'browse json', 'nested json'],
    aliases: ['tree', 'explorer', 'navigate', 'inspect', 'visualize'],
    related: ['json-formatter', 'json-validator', 'json-to-yaml', 'xml-to-json'],
    component: 'JsonViewer',
    icon: 'tree',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'json-to-csv',
    name: 'JSON to CSV',
    category: 'json',
    description:
      'Convert a JSON array into CSV, flattening nested objects into dotted column headers.',
    seoTitle: 'JSON to CSV Converter — Export JSON as CSV',
    seoDescription:
      'Convert an array of JSON objects into CSV ready for Excel, Google Sheets or a database import. Nested objects flatten to dotted columns and the delimiter is configurable.',
    keywords: ['json to csv', 'convert json to csv', 'json array to spreadsheet', 'export json'],
    aliases: ['spreadsheet', 'excel', 'sheets', 'tabular', 'flatten'],
    related: ['csv-to-json', 'json-formatter', 'json-to-yaml', 'json-viewer'],
    component: 'JsonToCsv',
    icon: 'table',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'csv-to-json',
    name: 'CSV to JSON',
    category: 'json',
    description:
      'Turn CSV or TSV into a JSON array, with header detection and automatic type inference.',
    seoTitle: 'CSV to JSON Converter — Convert CSV Data to JSON Online',
    seoDescription:
      'Paste or upload CSV and get a clean JSON array. Handles quoted fields, embedded commas and newlines per RFC 4180, with optional numeric and boolean type inference.',
    keywords: ['csv to json', 'convert csv', 'tsv to json', 'parse csv', 'csv parser'],
    aliases: ['tsv', 'spreadsheet', 'excel', 'import', 'delimited'],
    related: ['json-to-csv', 'json-formatter', 'json-viewer', 'yaml-to-json'],
    component: 'CsvToJson',
    icon: 'arrow-right-left',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'json-to-yaml',
    name: 'JSON to YAML',
    category: 'json',
    description: 'Convert JSON into readable YAML for Kubernetes manifests, CI files and config.',
    seoTitle: 'JSON to YAML Converter — Convert JSON into YAML Online',
    seoDescription:
      'Convert JSON to clean, correctly indented YAML for Kubernetes, Docker Compose, GitHub Actions and application config. Indentation width and key sorting are configurable.',
    keywords: ['json to yaml', 'convert json to yaml', 'yaml generator', 'kubernetes yaml'],
    aliases: ['yml', 'k8s', 'kubernetes', 'manifest', 'config'],
    related: ['yaml-to-json', 'json-formatter', 'json-to-csv', 'json-viewer'],
    component: 'JsonToYaml',
    icon: 'file-code',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'yaml-to-json',
    name: 'YAML to JSON',
    category: 'json',
    description: 'Convert YAML into JSON and surface indentation or syntax errors with line numbers.',
    seoTitle: 'YAML to JSON Converter — Convert YAML into JSON Online',
    seoDescription:
      'Convert YAML config into JSON, with anchors and multi-document files supported. Invalid indentation and syntax problems are reported with the exact line number.',
    keywords: ['yaml to json', 'convert yaml', 'yml to json', 'yaml parser', 'yaml validator'],
    aliases: ['yml', 'parse yaml', 'k8s', 'config', 'validate yaml'],
    related: ['json-to-yaml', 'json-formatter', 'json-validator', 'csv-to-json'],
    component: 'YamlToJson',
    icon: 'arrow-right-left',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'xml-formatter',
    name: 'XML Formatter',
    category: 'json',
    description: 'Indent and validate XML, including SOAP envelopes, RSS feeds and SVG markup.',
    seoTitle: 'XML Formatter — Format, Beautify and Validate XML Online',
    seoDescription:
      'Pretty-print XML with consistent indentation and validate that it is well-formed. Works with SOAP responses, RSS and Atom feeds, SVG files and application config.',
    keywords: ['xml formatter', 'format xml', 'beautify xml', 'xml validator', 'pretty print xml'],
    aliases: ['soap', 'rss', 'svg', 'indent', 'beautify'],
    related: ['xml-to-json', 'json-formatter', 'html-entity-decoder', 'json-viewer'],
    component: 'XmlFormatter',
    icon: 'file-code',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'xml-to-json',
    name: 'XML to JSON',
    category: 'json',
    description: 'Convert XML documents to JSON, with clear handling of attributes and text nodes.',
    seoTitle: 'XML to JSON Converter — Convert XML Documents into JSON',
    seoDescription:
      'Convert XML into JSON using the browser’s own parser. Attributes, text content and repeated elements map to a predictable structure you can configure before converting.',
    keywords: ['xml to json', 'convert xml', 'xml parser', 'soap to json', 'rss to json'],
    aliases: ['soap', 'rss', 'atom', 'parse xml', 'transform'],
    related: ['xml-formatter', 'json-formatter', 'json-viewer', 'csv-to-json'],
    component: 'XmlToJson',
    icon: 'arrow-right-left',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },

  // ─── Encoding & Decoding ────────────────────────────────────────────────
  {
    slug: 'base64-encoder',
    name: 'Base64 Encoder',
    category: 'encoding',
    description: 'Encode text or files to Base64, with URL-safe output and data URI generation.',
    seoTitle: 'Base64 Encoder — Encode Text and Files to Base64 Online',
    seoDescription:
      'Convert text or any file into Base64. Supports full Unicode, the URL-safe alphabet (RFC 4648 §5), optional line wrapping, and one-click data URI output for images.',
    keywords: ['base64 encoder', 'encode base64', 'base64 converter', 'file to base64', 'data uri'],
    aliases: ['b64', 'encode', 'btoa', 'data url', 'image to base64'],
    related: ['base64-decoder', 'url-encoder', 'text-to-hex', 'jwt-decoder'],
    component: 'Base64Encoder',
    icon: 'binary',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'base64-decoder',
    name: 'Base64 Decoder',
    category: 'encoding',
    description: 'Decode Base64 back to text or download it as the original file.',
    seoTitle: 'Base64 Decoder — Decode Base64 to Text or File Online',
    seoDescription:
      'Decode standard or URL-safe Base64 back into readable UTF-8 text, or recover the original binary file and download it. Padding problems are detected and explained.',
    keywords: ['base64 decoder', 'decode base64', 'base64 to text', 'base64 to file', 'atob'],
    aliases: ['b64', 'decode', 'atob', 'unbase64', 'base64 to image'],
    related: ['base64-encoder', 'url-decoder', 'hex-to-text', 'jwt-decoder'],
    component: 'Base64Decoder',
    icon: 'binary',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'url-encoder',
    name: 'URL Encoder',
    category: 'encoding',
    description: 'Percent-encode text for safe use in URLs, query strings and form bodies.',
    seoTitle: 'URL Encoder — Percent-Encode Text for URLs Online',
    seoDescription:
      'Percent-encode strings for query parameters, path segments and form data. Choose between encodeURIComponent and encodeURI semantics and see exactly which characters changed.',
    keywords: ['url encoder', 'percent encoding', 'encodeuricomponent', 'escape url', 'query string'],
    aliases: ['percent', 'escape', 'uri', 'querystring', 'encodeuri'],
    related: ['url-decoder', 'base64-encoder', 'html-entity-encoder', 'slug-generator'],
    component: 'UrlEncoder',
    icon: 'link',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'url-decoder',
    name: 'URL Decoder',
    category: 'encoding',
    description: 'Decode percent-encoded URLs and break query strings into a readable table.',
    seoTitle: 'URL Decoder — Decode Percent-Encoded URLs Online',
    seoDescription:
      'Turn percent-encoded URLs back into readable text, including double-encoded values. Paste a full URL to see its query parameters parsed into a sortable key/value table.',
    keywords: ['url decoder', 'decode url', 'decodeuricomponent', 'unescape url', 'parse query string'],
    aliases: ['percent', 'unescape', 'uri', 'querystring', 'decodeuri'],
    related: ['url-encoder', 'base64-decoder', 'html-entity-decoder', 'jwt-decoder'],
    component: 'UrlDecoder',
    icon: 'link',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'html-entity-encoder',
    name: 'HTML Entity Encoder',
    category: 'encoding',
    description: 'Escape HTML special characters to prevent markup injection and rendering bugs.',
    seoTitle: 'HTML Entity Encoder — Escape HTML Characters',
    seoDescription:
      'Convert &lt;, &gt;, &amp; and quotes into HTML entities so user content renders as text, not markup. Choose named or numeric entities.',
    keywords: ['html entity encoder', 'escape html', 'html encode', 'htmlspecialchars', 'xss escaping'],
    aliases: ['escape', 'entities', 'htmlspecialchars', 'sanitize', 'ampersand'],
    related: ['html-entity-decoder', 'url-encoder', 'unicode-converter', 'xml-formatter'],
    component: 'HtmlEntityEncoder',
    icon: 'code',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'html-entity-decoder',
    name: 'HTML Entity Decoder',
    category: 'encoding',
    description: 'Convert HTML entities back into the characters they represent.',
    seoTitle: 'HTML Entity Decoder — Decode HTML Entities to Text Online',
    seoDescription:
      'Decode named entities like &amp;amp; and numeric references like &amp;#8212; back into plain characters. Ideal for scraped or double-escaped content.',
    keywords: ['html entity decoder', 'decode html entities', 'html decode', 'unescape html'],
    aliases: ['unescape', 'entities', 'decode', 'nbsp', 'scraped'],
    related: ['html-entity-encoder', 'url-decoder', 'unicode-converter', 'remove-extra-spaces'],
    component: 'HtmlEntityDecoder',
    icon: 'code',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'unicode-converter',
    name: 'Unicode Converter',
    category: 'encoding',
    description:
      'Inspect and convert between characters, code points, escape sequences and UTF-8 bytes.',
    seoTitle: 'Unicode Converter — Characters, Code Points and Escapes',
    seoDescription:
      'Convert text to and from Unicode code points, \\u escapes, HTML numeric references and raw UTF-8 bytes. Includes NFC, NFD, NFKC and NFKD normalisation.',
    keywords: ['unicode converter', 'code point', 'utf-8 bytes', 'unicode escape', 'normalization'],
    aliases: ['utf8', 'codepoint', 'emoji', 'nfc', 'nfd', 'escape sequence'],
    related: ['text-to-hex', 'html-entity-encoder', 'character-counter', 'hex-to-text'],
    component: 'UnicodeConverter',
    icon: 'type',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'hex-to-text',
    name: 'Hex to Text',
    category: 'encoding',
    description: 'Decode hexadecimal byte sequences into readable UTF-8 text.',
    seoTitle: 'Hex to Text — Decode Hexadecimal to String',
    seoDescription:
      'Convert hexadecimal into text. Accepts spaced, comma-separated, 0x-prefixed and continuous formats, and decodes the resulting bytes as UTF-8 or Latin-1.',
    keywords: ['hex to text', 'hex decoder', 'hexadecimal to string', 'hex to ascii', 'decode hex'],
    aliases: ['hexadecimal', 'ascii', 'bytes', 'decode', '0x'],
    related: ['text-to-hex', 'base64-decoder', 'unicode-converter', 'url-decoder'],
    component: 'HexToText',
    icon: 'binary',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'text-to-hex',
    name: 'Text to Hex',
    category: 'encoding',
    description: 'Encode text as hexadecimal bytes in the format your tooling expects.',
    seoTitle: 'Text to Hex — Encode Text as Hexadecimal',
    seoDescription:
      'Convert text into hexadecimal UTF-8 bytes with configurable separators, casing and 0x prefixes. Also shows binary and decimal representations of each byte.',
    keywords: ['text to hex', 'hex encoder', 'string to hexadecimal', 'ascii to hex', 'encode hex'],
    aliases: ['hexadecimal', 'ascii', 'bytes', 'encode', '0x'],
    related: ['hex-to-text', 'base64-encoder', 'unicode-converter', 'color-converter'],
    component: 'TextToHex',
    icon: 'binary',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'jwt-decoder',
    name: 'JWT Decoder',
    category: 'encoding',
    description:
      'Decode JWT header and payload, read claim timestamps in plain English, and optionally verify the signature.',
    seoTitle: 'JWT Decoder — Decode and Verify JSON Web Tokens Online',
    seoDescription:
      'Decode a JWT to inspect its header and payload, see exp, iat and nbf as readable dates with expiry status, and optionally verify HS256, RS256 or ES256 signatures locally.',
    keywords: ['jwt decoder', 'decode jwt', 'json web token', 'jwt parser', 'jwt verify'],
    aliases: ['token', 'bearer', 'jws', 'oauth', 'claims', 'auth'],
    related: ['base64-decoder', 'hmac-generator', 'unix-timestamp-converter', 'sha256-generator'],
    component: 'JwtDecoder',
    icon: 'key',
    serverProcessing: false,
    popular: true,
    privacyNote:
      'Tokens often grant access to real accounts. Decoding and signature verification both happen entirely in this tab — the token and any key you paste are never sent anywhere.',
    addedAt: LAUNCH_DATE,
  },

  // ─── Generators ─────────────────────────────────────────────────────────
  {
    slug: 'uuid-generator',
    name: 'UUID Generator',
    category: 'generators',
    description: 'Generate v4 and v7 UUIDs in bulk, with formatting options and one-click copy.',
    seoTitle: 'UUID Generator — Create v4 and v7 UUIDs Online',
    seoDescription:
      'Generate cryptographically random UUIDs, one at a time or thousands at once. Supports version 4 and time-ordered version 7, uppercase, braces, and no-hyphen formats.',
    keywords: ['uuid generator', 'guid generator', 'uuid v4', 'uuid v7', 'random uuid'],
    aliases: ['guid', 'unique id', 'identifier', 'v4', 'v7'],
    related: ['nano-id-generator', 'random-string-generator', 'password-generator', 'random-number-generator'],
    component: 'UuidGenerator',
    icon: 'fingerprint',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'random-string-generator',
    name: 'Random String Generator',
    category: 'generators',
    description: 'Build random strings from exactly the character set and length you specify.',
    seoTitle: 'Random String Generator — Custom Alphabets',
    seoDescription:
      'Generate random strings using any combination of letters, digits, symbols or a custom alphabet. Optionally exclude look-alike characters and generate many at once.',
    keywords: ['random string generator', 'random text', 'api key generator', 'token generator'],
    aliases: ['token', 'api key', 'secret', 'nonce', 'salt'],
    related: ['password-generator', 'uuid-generator', 'nano-id-generator', 'random-number-generator'],
    component: 'RandomStringGenerator',
    icon: 'dice',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'password-generator',
    name: 'Password Generator',
    category: 'generators',
    description:
      'Create strong random passwords or passphrases, with a real entropy estimate in bits.',
    seoTitle: 'Password Generator — Strong Random Passwords',
    seoDescription:
      'Generate strong passwords using the browser’s cryptographic random source, or word-based passphrases that are easier to type. Shows true entropy in bits, never transmitted.',
    keywords: ['password generator', 'strong password', 'random password', 'passphrase generator'],
    aliases: ['passphrase', 'secure', 'diceware', 'credentials', 'entropy'],
    related: ['random-string-generator', 'uuid-generator', 'sha256-generator', 'hmac-generator'],
    component: 'PasswordGenerator',
    icon: 'lock',
    serverProcessing: false,
    popular: true,
    privacyNote:
      'Passwords are generated with crypto.getRandomValues() inside your browser. They are never sent over the network, never logged, and are not stored after you close the page.',
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'lorem-ipsum-generator',
    name: 'Lorem Ipsum Generator',
    category: 'generators',
    description: 'Generate placeholder paragraphs, sentences, words or list items for mockups.',
    seoTitle: 'Lorem Ipsum Generator — Placeholder Text',
    seoDescription:
      'Generate classic Lorem Ipsum or modern filler text by paragraph, sentence, word or list item. Output as plain text or ready-to-paste HTML with wrapping tags.',
    keywords: ['lorem ipsum generator', 'placeholder text', 'dummy text', 'filler text', 'mockup text'],
    aliases: ['dummy', 'placeholder', 'filler', 'sample text', 'mock'],
    related: ['random-string-generator', 'word-counter', 'slug-generator', 'text-case-converter'],
    component: 'LoremIpsumGenerator',
    icon: 'text',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'random-number-generator',
    name: 'Random Number Generator',
    category: 'generators',
    description: 'Draw random integers or decimals in a range, with optional uniqueness and sorting.',
    seoTitle: 'Random Number Generator — Pick Numbers in Any Range',
    seoDescription:
      'Generate random integers or decimals between any minimum and maximum. Draw many at once, enforce uniqueness for lottery-style picks, and sort the results.',
    keywords: ['random number generator', 'random integer', 'number picker', 'rng', 'dice roller'],
    aliases: ['rng', 'dice', 'lottery', 'pick', 'shuffle', 'integer'],
    related: ['random-string-generator', 'uuid-generator', 'password-generator', 'nano-id-generator'],
    component: 'RandomNumberGenerator',
    icon: 'dice',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'nano-id-generator',
    name: 'Nano ID Generator',
    category: 'generators',
    description: 'Generate compact URL-safe Nano IDs with a live collision-probability estimate.',
    seoTitle: 'Nano ID Generator — Short URL-Safe Unique IDs Online',
    seoDescription:
      'Generate Nano IDs: compact, URL-safe unique identifiers that are shorter than UUIDs. Adjust alphabet and length, and see how long it would take to reach a 1% collision risk.',
    keywords: ['nano id generator', 'nanoid', 'short id', 'url safe id', 'unique identifier'],
    aliases: ['nanoid', 'short id', 'shortid', 'slug id', 'cuid'],
    related: ['uuid-generator', 'random-string-generator', 'password-generator', 'slug-generator'],
    component: 'NanoIdGenerator',
    icon: 'fingerprint',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },

  // ─── Hashing & Security ─────────────────────────────────────────────────
  {
    slug: 'sha256-generator',
    name: 'SHA-256 Generator',
    category: 'security',
    description: 'Compute SHA-256 digests of text or files using the Web Crypto API.',
    seoTitle: 'SHA-256 Hash Generator — Hash Text and Files Online',
    seoDescription:
      'Generate SHA-256 hashes from text or any file, entirely in your browser via the Web Crypto API. Output as hex or Base64, and compare against an expected checksum.',
    keywords: ['sha256 generator', 'sha-256 hash', 'hash generator', 'checksum', 'file hash'],
    aliases: ['sha2', 'digest', 'checksum', 'fingerprint', 'sha-256'],
    related: ['sha1-generator', 'md5-generator', 'hmac-generator', 'base64-encoder'],
    component: 'Sha256Generator',
    icon: 'hash',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'sha1-generator',
    name: 'SHA-1 Generator',
    category: 'security',
    description:
      'Compute SHA-1 digests for legacy compatibility — no longer collision-resistant.',
    seoTitle: 'SHA-1 Hash Generator — Compute SHA-1 Digests Online',
    seoDescription:
      'Generate SHA-1 hashes from text or files for legacy systems, Git object IDs and old checksums. SHA-1 is broken for security use and this tool says so clearly.',
    keywords: ['sha1 generator', 'sha-1 hash', 'legacy hash', 'git hash', 'checksum'],
    aliases: ['sha-1', 'digest', 'legacy', 'git', 'checksum'],
    related: ['sha256-generator', 'md5-generator', 'hmac-generator', 'text-to-hex'],
    component: 'Sha1Generator',
    icon: 'hash',
    serverProcessing: false,
    privacyNote:
      'SHA-1 has been practically broken since 2017 and must not be used for signatures, certificates or any new security control. It remains useful only for compatibility with existing systems.',
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'md5-generator',
    name: 'MD5 Generator',
    category: 'security',
    description: 'Compute MD5 checksums for legacy file verification — not a security function.',
    seoTitle: 'MD5 Hash Generator — Compute MD5 Checksums Online',
    seoDescription:
      'Generate MD5 hashes from text or files to verify downloads against a published checksum. MD5 is cryptographically broken and unsuitable for passwords or signatures.',
    keywords: ['md5 generator', 'md5 hash', 'md5 checksum', 'file checksum', 'verify download'],
    aliases: ['checksum', 'digest', 'legacy', 'verify', 'md-5'],
    related: ['sha256-generator', 'sha1-generator', 'hmac-generator', 'text-to-hex'],
    component: 'Md5Generator',
    icon: 'hash',
    serverProcessing: false,
    privacyNote:
      'MD5 collisions can be produced in seconds on ordinary hardware. Use it only to detect accidental corruption — never for passwords, signatures or deduplicating untrusted content.',
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'hmac-generator',
    name: 'HMAC Generator',
    category: 'security',
    description: 'Generate HMAC signatures with a secret key for webhooks and API authentication.',
    seoTitle: 'HMAC Generator — Create HMAC-SHA256 Signatures Online',
    seoDescription:
      'Compute HMAC-SHA256, SHA-1, SHA-384 and SHA-512 signatures from a message and secret key. Verify webhook signatures from Stripe, GitHub and Shopify without leaking the key.',
    keywords: ['hmac generator', 'hmac sha256', 'webhook signature', 'api signature', 'message authentication'],
    aliases: ['signature', 'webhook', 'sign', 'stripe', 'verify', 'mac'],
    related: ['sha256-generator', 'jwt-decoder', 'sha1-generator', 'password-generator'],
    component: 'HmacGenerator',
    icon: 'shield',
    serverProcessing: false,
    privacyNote:
      'Your secret key is used only inside this tab via the Web Crypto API. It is never transmitted to FindTool, stored, or written to analytics.',
    addedAt: LAUNCH_DATE,
  },

  // ─── Date & Time ────────────────────────────────────────────────────────
  {
    slug: 'unix-timestamp-converter',
    name: 'Unix Timestamp Converter',
    category: 'time',
    description:
      'Convert Unix timestamps to human dates and back, in seconds or milliseconds, UTC and local.',
    seoTitle: 'Unix Timestamp Converter — Epoch to Date and Date to Epoch',
    seoDescription:
      'Convert Unix epoch timestamps to readable dates and back again. Auto-detects seconds versus milliseconds and always shows both UTC and your local time side by side.',
    keywords: ['unix timestamp converter', 'epoch converter', 'timestamp to date', 'date to timestamp'],
    aliases: ['epoch', 'unixtime', 'posix time', 'seconds', 'milliseconds', 'ms'],
    related: ['current-unix-timestamp', 'iso-date-converter', 'timezone-converter', 'date-difference-calculator'],
    component: 'UnixTimestampConverter',
    icon: 'clock',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'current-unix-timestamp',
    name: 'Current Unix Timestamp',
    category: 'time',
    description: 'The live Unix timestamp right now, in seconds and milliseconds, ready to copy.',
    seoTitle: 'Current Unix Timestamp — Live Epoch Time Right Now',
    seoDescription:
      'See the current Unix epoch timestamp updating live, in both seconds and milliseconds, alongside the matching UTC, ISO 8601 and local time. One click to copy any of them.',
    keywords: ['current unix timestamp', 'epoch time now', 'what time is it in epoch', 'unix time now'],
    aliases: ['now', 'epoch now', 'current time', 'live timestamp', 'today'],
    related: ['unix-timestamp-converter', 'iso-date-converter', 'timezone-converter', 'date-difference-calculator'],
    component: 'CurrentUnixTimestamp',
    icon: 'timer',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'date-difference-calculator',
    name: 'Date Difference Calculator',
    category: 'time',
    description: 'Measure the span between two dates in years, months, weeks, days, hours and seconds.',
    seoTitle: 'Date Difference Calculator — Days Between Two Dates',
    seoDescription:
      'Calculate exactly how much time separates two dates or datetimes, broken down into calendar units and totals. Optionally count business days only, excluding weekends.',
    keywords: ['date difference calculator', 'days between dates', 'date duration', 'time between dates'],
    aliases: ['duration', 'days between', 'age', 'elapsed', 'business days', 'countdown'],
    related: ['unix-timestamp-converter', 'current-unix-timestamp', 'timezone-converter', 'iso-date-converter'],
    component: 'DateDifferenceCalculator',
    icon: 'calendar',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'iso-date-converter',
    name: 'ISO Date Converter',
    category: 'time',
    description: 'Parse and build ISO 8601 / RFC 3339 dates and convert between common formats.',
    seoTitle: 'ISO 8601 Date Converter — Parse and Format RFC 3339 Dates',
    seoDescription:
      'Convert between ISO 8601, RFC 2822, Unix epoch and human-readable dates. Understand offsets, the Z suffix and week dates, and build a correctly formatted string.',
    keywords: ['iso 8601 converter', 'rfc 3339', 'date format converter', 'iso date parser'],
    aliases: ['iso8601', 'rfc3339', 'rfc2822', 'datetime', 'utc', 'offset'],
    related: ['unix-timestamp-converter', 'timezone-converter', 'current-unix-timestamp', 'date-difference-calculator'],
    component: 'IsoDateConverter',
    icon: 'calendar',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'timezone-converter',
    name: 'Timezone Converter',
    category: 'time',
    description: 'Compare one moment across multiple timezones, with DST handled correctly.',
    seoTitle: 'Timezone Converter — Compare Times Across Time Zones',
    seoDescription:
      'Convert a date and time between any IANA timezones and view several zones side by side. Daylight saving transitions are applied using the browser’s own timezone database.',
    keywords: ['timezone converter', 'time zone calculator', 'utc offset', 'dst', 'world clock'],
    aliases: ['tz', 'utc', 'gmt', 'dst', 'world clock', 'meeting time'],
    related: ['unix-timestamp-converter', 'iso-date-converter', 'current-unix-timestamp', 'cron-expression-generator'],
    component: 'TimezoneConverter',
    icon: 'globe',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'cron-expression-generator',
    name: 'Cron Expression Generator',
    category: 'time',
    description: 'Build a cron expression from plain controls and preview the next run times.',
    seoTitle: 'Cron Expression Generator — Build Cron Schedules Visually',
    seoDescription:
      'Create crontab expressions without memorising field order. Pick a schedule, read the plain-English description, and preview the next ten times it will actually fire.',
    keywords: ['cron generator', 'crontab generator', 'cron schedule builder', 'cron expression'],
    aliases: ['crontab', 'schedule', 'job', 'kubernetes cronjob', 'quartz'],
    related: ['cron-expression-parser', 'unix-timestamp-converter', 'timezone-converter', 'current-unix-timestamp'],
    component: 'CronExpressionGenerator',
    icon: 'timer',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'cron-expression-parser',
    name: 'Cron Expression Parser',
    category: 'time',
    description: 'Explain any cron expression in plain English and list its upcoming run times.',
    seoTitle: 'Cron Expression Parser — Explain Any Crontab',
    seoDescription:
      'Paste a cron expression to get a readable description, a field-by-field breakdown and the next ten scheduled runs. Catches the classic day-of-month/day-of-week OR trap.',
    keywords: ['cron parser', 'explain cron', 'crontab decoder', 'cron expression meaning'],
    aliases: ['crontab', 'decode cron', 'explain', 'schedule', 'next run'],
    related: ['cron-expression-generator', 'timezone-converter', 'unix-timestamp-converter', 'date-difference-calculator'],
    component: 'CronExpressionParser',
    icon: 'timer',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },

  // ─── Text Tools ─────────────────────────────────────────────────────────
  {
    slug: 'word-counter',
    name: 'Word Counter',
    category: 'text',
    description: 'Count words, sentences, paragraphs and reading time as you type.',
    seoTitle: 'Word Counter — Count Words, Sentences and Reading Time',
    seoDescription:
      'Count words, sentences, paragraphs and estimated reading time live as you type or paste. Includes a keyword frequency breakdown and average sentence length.',
    keywords: ['word counter', 'count words', 'word count tool', 'reading time calculator'],
    aliases: ['wordcount', 'essay', 'reading time', 'frequency', 'paragraphs'],
    related: ['character-counter', 'text-case-converter', 'remove-extra-spaces', 'sort-lines'],
    component: 'WordCounter',
    icon: 'text',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'character-counter',
    name: 'Character Counter',
    category: 'text',
    description:
      'Count characters, bytes and graphemes against platform limits like Twitter and SMS.',
    seoTitle: 'Character Counter — Characters, Bytes, Emoji',
    seoDescription:
      'Count characters with and without spaces, UTF-8 byte length, and true grapheme count so emoji count as one. Shows remaining budget for common platform limits.',
    keywords: ['character counter', 'count characters', 'string length', 'byte counter', 'sms counter'],
    aliases: ['char count', 'length', 'bytes', 'twitter', 'sms', 'meta description'],
    related: ['word-counter', 'unicode-converter', 'text-case-converter', 'remove-extra-spaces'],
    component: 'CharacterCounter',
    icon: 'type',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'text-case-converter',
    name: 'Text Case Converter',
    category: 'text',
    description:
      'Convert between camelCase, snake_case, kebab-case, Title Case and eight more styles.',
    seoTitle: 'Text Case Converter — camelCase, snake_case',
    seoDescription:
      'Convert text between camelCase, PascalCase, snake_case, SCREAMING_SNAKE, kebab-case, Title Case, sentence case and more. Handles acronyms and existing delimiters sensibly.',
    keywords: ['case converter', 'camelcase converter', 'snake case', 'kebab case', 'title case'],
    aliases: ['camel', 'snake', 'kebab', 'pascal', 'uppercase', 'lowercase', 'slugify'],
    related: ['slug-generator', 'word-counter', 'remove-extra-spaces', 'character-counter'],
    component: 'TextCaseConverter',
    icon: 'type',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'remove-duplicate-lines',
    name: 'Remove Duplicate Lines',
    category: 'text',
    description: 'Strip repeated lines from a list, with case and whitespace options.',
    seoTitle: 'Remove Duplicate Lines — Deduplicate Any List Online',
    seoDescription:
      'Remove duplicate lines from a list while preserving order, or keep only the lines that appeared more than once. Case-insensitive and trim-before-compare modes included.',
    keywords: ['remove duplicate lines', 'deduplicate list', 'unique lines', 'dedupe text'],
    aliases: ['dedupe', 'unique', 'distinct', 'duplicates', 'uniq'],
    related: ['sort-lines', 'remove-extra-spaces', 'text-diff', 'word-counter'],
    component: 'RemoveDuplicateLines',
    icon: 'list',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'sort-lines',
    name: 'Sort Lines',
    category: 'text',
    description: 'Sort lines alphabetically, numerically, by length, or shuffle them randomly.',
    seoTitle: 'Sort Lines — Alphabetical, Numeric, Natural',
    seoDescription:
      'Sort a list of lines alphabetically, numerically, by length or in natural order where file2 comes before file10. Reverse, shuffle, and ignore case or leading whitespace.',
    keywords: ['sort lines', 'alphabetize list', 'sort text', 'natural sort', 'shuffle lines'],
    aliases: ['alphabetize', 'order', 'shuffle', 'randomize', 'natural sort', 'sort'],
    related: ['remove-duplicate-lines', 'text-diff', 'remove-extra-spaces', 'word-counter'],
    component: 'SortLines',
    icon: 'sort',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'text-diff',
    name: 'Text Diff',
    category: 'text',
    description: 'Compare two blocks of text and highlight every added, removed and changed line.',
    seoTitle: 'Text Diff — Compare Two Texts, See Changes',
    seoDescription:
      'Compare two blocks of text side by side or unified, with added, removed and modified lines highlighted. Optionally ignore whitespace and case when comparing.',
    keywords: ['text diff', 'compare text', 'diff checker', 'file comparison', 'find differences'],
    aliases: ['compare', 'difference', 'changes', 'merge', 'git diff'],
    related: ['sort-lines', 'remove-duplicate-lines', 'json-formatter', 'remove-extra-spaces'],
    component: 'TextDiff',
    icon: 'diff',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'remove-extra-spaces',
    name: 'Remove Extra Spaces',
    category: 'text',
    description: 'Collapse repeated spaces, trim lines and strip blank lines or invisible characters.',
    seoTitle: 'Remove Extra Spaces — Clean Up Whitespace in Text Online',
    seoDescription:
      'Collapse runs of spaces, trim leading and trailing whitespace, delete empty lines, convert tabs, and strip zero-width and non-breaking characters that break comparisons.',
    keywords: ['remove extra spaces', 'trim whitespace', 'clean text', 'remove blank lines'],
    aliases: ['trim', 'whitespace', 'tabs', 'blank lines', 'zero width', 'nbsp'],
    related: ['remove-duplicate-lines', 'text-case-converter', 'sort-lines', 'word-counter'],
    component: 'RemoveExtraSpaces',
    icon: 'eraser',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'slug-generator',
    name: 'Slug Generator',
    category: 'text',
    description: 'Turn any title into a clean URL slug, with accent folding and transliteration.',
    seoTitle: 'Slug Generator — Convert Titles into Clean URL Slugs',
    seoDescription:
      'Convert titles into SEO-friendly URL slugs. Folds accented characters to ASCII, transliterates common scripts, strips punctuation, and enforces a maximum length.',
    keywords: ['slug generator', 'url slug', 'slugify', 'permalink generator', 'seo url'],
    aliases: ['slugify', 'permalink', 'url', 'seo', 'kebab'],
    related: ['text-case-converter', 'url-encoder', 'remove-extra-spaces', 'nano-id-generator'],
    component: 'SlugGenerator',
    icon: 'slug',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },

  // ─── Web & Dev ──────────────────────────────────────────────────────────
  {
    slug: 'regex-tester',
    name: 'Regex Tester',
    category: 'web',
    description:
      'Test regular expressions with highlighted matches, capture groups and a safety timeout.',
    seoTitle: 'Regex Tester — Test Regular Expressions Live',
    seoDescription:
      'Test JavaScript regular expressions against sample text with live match highlighting, numbered and named capture groups, match counts, and a replace preview.',
    keywords: ['regex tester', 'regular expression tester', 'regex online', 'test regex', 'regex101'],
    aliases: ['regexp', 'pattern', 'match', 'capture group', 'replace', 'preg'],
    related: ['text-diff', 'sort-lines', 'remove-extra-spaces', 'slug-generator'],
    component: 'RegexTester',
    icon: 'regex',
    serverProcessing: false,
    popular: true,
    privacyNote:
      'Patterns run inside a Web Worker with a hard timeout, so a catastrophically backtracking expression cannot freeze this page. Your pattern and test text stay in the browser.',
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'http-status-codes',
    name: 'HTTP Status Code Lookup',
    category: 'web',
    description: 'Search every HTTP status code with its meaning, typical cause and correct usage.',
    seoTitle: 'HTTP Status Codes — Complete Searchable Reference',
    seoDescription:
      'Look up any HTTP status code from 100 to 511. Each entry explains what the code means, when a server should send it, and the mistake it is most often confused with.',
    keywords: ['http status codes', 'http error codes', '404 meaning', '500 error', 'status code list'],
    aliases: ['404', '500', '301', '302', '403', '418', 'error code', 'response code'],
    related: ['user-agent-parser', 'url-decoder', 'regex-tester', 'jwt-decoder'],
    component: 'HttpStatusCodes',
    icon: 'server',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'user-agent-parser',
    name: 'User Agent Parser',
    category: 'web',
    description: 'Break a user agent string into browser, engine, operating system and device.',
    seoTitle: 'User Agent Parser — Decode Browser and Device Strings',
    seoDescription:
      'Parse any User-Agent header into browser name and version, rendering engine, operating system, device type and bot detection. Includes your own browser’s string.',
    keywords: ['user agent parser', 'ua parser', 'browser detection', 'user agent string', 'what is my user agent'],
    aliases: ['ua', 'browser', 'useragent', 'device', 'bot', 'my user agent'],
    related: ['http-status-codes', 'regex-tester', 'url-decoder', 'color-converter'],
    component: 'UserAgentParser',
    icon: 'monitor',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'color-converter',
    name: 'Color Converter',
    category: 'web',
    description:
      'Convert colors between HEX, RGB, HSL, HWB, OKLCH and CMYK with a live contrast check.',
    seoTitle: 'Color Converter — HEX, RGB, HSL, OKLCH and CMYK',
    seoDescription:
      'Convert a color between HEX, RGB, HSL, HWB, OKLCH and CMYK, with alpha support. Includes a live preview and WCAG contrast ratios against white and black.',
    keywords: ['color converter', 'hex to rgb', 'rgb to hex', 'hsl converter', 'oklch converter'],
    aliases: ['hex', 'rgb', 'hsl', 'oklch', 'cmyk', 'contrast', 'wcag', 'picker'],
    related: ['css-minifier', 'text-to-hex', 'user-agent-parser', 'regex-tester'],
    component: 'ColorConverter',
    icon: 'palette',
    serverProcessing: false,
    popular: true,
    addedAt: LAUNCH_DATE,
  },
  {
    slug: 'css-minifier',
    name: 'CSS Minifier',
    category: 'web',
    description: 'Minify CSS safely, preserving strings, custom properties and licence comments.',
    seoTitle: 'CSS Minifier — Compress and Minify CSS Online',
    seoDescription:
      'Minify CSS by removing comments and unnecessary whitespace while preserving strings, url() values, custom properties and /*! licence banners. Shows bytes saved.',
    keywords: ['css minifier', 'minify css', 'compress css', 'css compressor', 'reduce css size'],
    aliases: ['compress', 'compact', 'optimize', 'stylesheet', 'uglify'],
    related: ['json-minifier', 'color-converter', 'html-entity-encoder', 'regex-tester'],
    component: 'CssMinifier',
    icon: 'minimize',
    serverProcessing: false,
    addedAt: LAUNCH_DATE,
  },
];

// ─── Derived lookups ──────────────────────────────────────────────────────

export const TOOL_MAP: Record<string, Tool> = Object.fromEntries(
  TOOLS.map((t) => [t.slug, t]),
);

export function getTool(slug: string): Tool | undefined {
  return TOOL_MAP[slug];
}

export function toolsInCategory(categoryId: string): Tool[] {
  return TOOLS.filter((t) => t.category === categoryId).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function popularTools(limit = 8): Tool[] {
  return TOOLS.filter((t) => t.popular).slice(0, limit);
}

export function allToolsSorted(): Tool[] {
  return [...TOOLS].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Related tools for a given tool.
 *
 * Explicit `related` slugs come first, in the order the author chose. If that
 * leaves fewer than `limit` entries, the gap is filled with other tools from
 * the same category so no tool ever renders an empty or stubby block.
 */
export function relatedTools(tool: Tool, limit = 4): Tool[] {
  const seen = new Set<string>([tool.slug]);
  const out: Tool[] = [];

  for (const slug of tool.related) {
    const candidate = TOOL_MAP[slug];
    if (candidate && !seen.has(slug)) {
      seen.add(slug);
      out.push(candidate);
    }
    if (out.length >= limit) return out;
  }

  for (const candidate of toolsInCategory(tool.category)) {
    if (out.length >= limit) break;
    if (!seen.has(candidate.slug)) {
      seen.add(candidate.slug);
      out.push(candidate);
    }
  }

  return out;
}

/**
 * Tools added within the last `days`. Used by the homepage, which only renders
 * the section when the result is a genuine subset — at launch every tool shares
 * one date, so the section stays hidden rather than showing all 50 as "new".
 */
export function recentlyAdded(days = 45, limit = 6): Tool[] {
  const cutoff = Date.now() - days * 86_400_000;
  const recent = TOOLS.filter((t) => new Date(t.addedAt).getTime() >= cutoff).sort(
    (a, b) => b.addedAt.localeCompare(a.addedAt) || a.name.localeCompare(b.name),
  );
  return recent.length === TOOLS.length ? [] : recent.slice(0, limit);
}
