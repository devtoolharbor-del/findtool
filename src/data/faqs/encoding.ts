import type { FaqMap } from './index';

/**
 * FAQ content for the Encoding & Decoding tools. See ./index.ts for the rules
 * that govern what belongs here.
 */
export const encodingFaqs: FaqMap = {
  'jwt-decoder': [
    {
      q: 'Is decoding a JWT the same as verifying it?',
      a: 'No. The header and payload are only Base64url-encoded, not encrypted, so anyone holding the token can read them. Verification is a separate cryptographic check against a secret or public key, which this tool performs only when you supply that key.',
    },
    {
      q: 'Can I trust a token just because it decodes cleanly?',
      a: 'Never. An attacker can craft a token with any claims they like. Only a successful signature verification — plus checks on the issuer, audience and expiry — tells you a token is genuine.',
    },
  ],

  'base64-encoder': [
    {
      q: 'Why does my terminal produce a different string from this page?',
      a: 'Two reasons, and only one of them is harmless. <code>echo secret | base64</code> encodes the newline that <code>echo</code> appends, so seven bytes go in rather than six — use <code>printf %s</code> or <code>echo -n</code>. Line wrapping also differs: GNU coreutils breaks at 76 characters unless you pass <code>-w 0</code>, while <code>openssl base64</code> breaks at 64. Wrapping changes nothing after decoding; the extra byte does.',
    },
    {
      q: 'Why does Basic authentication fail with a colon or an accent in the password?',
      a: 'RFC 7617 §2 splits the credential at the first colon, so a colon inside the user-id is simply unrepresentable — one in the password is fine. Accents are murkier: the specification offers a <code>charset="UTF-8"</code> parameter, but servers written before it decode the bytes as ISO-8859-1, so a UTF-8 <code>ä</code> arrives as two wrong characters. Test with an ASCII password to tell the two failures apart.',
    },
    {
      q: 'Is Base64 the best way to inline an SVG in CSS?',
      a: 'Rarely. SVG is text, so percent-encoding it typically costs around a tenth of its size against Base64’s fixed third, and the markup stays readable in the stylesheet. Encode it with <a href="/tools/url-encoder">the URL encoder</a>, remembering that <code>#</code> must become <code>%23</code> or every <code>fill="#fff"</code> truncates the image at the colour. Reach for Base64 when the asset is already binary, such as a PNG or a WOFF font.',
    },
  ],

  'base64-decoder': [
    {
      q: 'How can I tell what a blob is before I decode it?',
      a: 'The opening characters give it away, because the leading bytes of each format are fixed. <code>iVBORw0KGgo</code> is a PNG, <code>/9j/</code> a JPEG, <code>JVBERi0</code> a PDF, <code>H4sI</code> gzip, and <code>UEsDB</code> a ZIP — which also means a <code>.docx</code>, <code>.xlsx</code> or <code>.jar</code>, since those are ZIP containers. <code>eyJ</code> decodes to an opening brace and quote, so it is JSON.',
    },
    {
      q: 'Why does my Kubernetes secret decode with an invisible newline on the end?',
      a: 'Because it was built with <code>echo</code> instead of <code>echo -n</code>, so a trailing <code>0a</code> byte was encoded with the value and the application receives a password one character longer than the one you set. The symptom is authentication that fails everywhere while the secret looks correct in the manifest. Using <code>kubectl create secret generic --from-literal</code> keeps the shell out of it entirely.',
    },
    {
      q: 'Can I decode a whole JWT here?',
      a: 'One segment at a time. A JWT is three Base64url strings joined by dots, so the value as a whole is not valid Base64 — paste the middle segment to read the claims. The third segment is a raw signature and decodes to binary rather than text. <a href="/tools/jwt-decoder">The JWT decoder</a> splits and labels all three, and checks the signature when you give it the key.',
    },
  ],

  'url-encoder': [
    {
      q: 'Which characters never need encoding at all?',
      a: 'RFC 3986 §2.3 defines a single unreserved set: <code>A–Z</code>, <code>a–z</code>, <code>0–9</code> and the four marks <code>-</code> <code>.</code> <code>_</code> <code>~</code>. Everything else is either reserved with a structural job or has to be escaped. Escaping an unreserved character anyway is legal but not free: <code>%7E</code> and <code>~</code> are equivalent only to code that normalises before comparing, and signature schemes compare byte for byte.',
    },
    {
      q: 'Can I put an encoded slash inside a path segment?',
      a: 'Often not. Apache answers 404 to a path containing <code>%2F</code> unless <code>AllowEncodedSlashes</code> is switched on, Tomcat blocks it by default too, and a proxy that decodes the path before routing splits the segment in two regardless of what the origin allows. When a value may contain a slash — a branch name, a file path — carry it in a query parameter rather than the path.',
    },
    {
      q: 'How do I encode a domain name with non-ASCII characters?',
      a: 'Not with percent-escapes. A host is converted to Punycode instead, so <code>münchen.de</code> resolves as <code>xn--mnchen-3ya.de</code>, and percent-encoding only applies from the path onwards. Browsers perform that conversion quietly, which is why a link can look different in the address bar from the text you pasted, and why domains built out of lookalike letters are a phishing problem.',
    },
  ],

  'url-decoder': [
    {
      q: 'Why does a plus sign sometimes become a space and sometimes not?',
      a: 'It depends which decoder runs. <code>decodeURIComponent("a+b")</code> hands back <code>a+b</code> untouched, while a form decoder — <code>URLSearchParams</code>, PHP’s <code>$_GET</code>, most framework query parsers — returns <code>a b</code>, because a plus means a space in <code>application/x-www-form-urlencoded</code>. That is what quietly destroys Base64 signatures passed in query strings, where the plus was literal and should have been sent as <code>%2B</code>.',
    },
    {
      q: 'Should I decode a query string before or after splitting it?',
      a: 'After, always. Split on <code>&amp;</code>, then on the first <code>=</code>, and decode each name and value only at the end. Decode first and an escaped <code>%26</code> inside a value becomes a real separator, so <code>note=a%26b=c</code> turns into two parameters and part of the text vanishes. That ordering mistake is the basis of most parameter-smuggling reports.',
    },
    {
      q: 'Where does everything after the hash go?',
      a: 'Nowhere — a fragment is never transmitted. RFC 3986 §3.5 makes it purely client-side, so the server, the access log and any WAF in between see the URL up to but not including the <code>#</code>. That is why OAuth implicit-flow tokens placed in a fragment stay out of server logs, and why a redirect target hidden after a hash cannot be validated on the server.',
    },
  ],

  'html-entity-encoder': [
    {
      q: 'Do I still need to escape if I use React or a template engine?',
      a: 'No, and doing it twice shows up on the page as a literal <code>&amp;amp;</code>. React escapes every string it renders, and Jinja, Django and ERB autoescape by default, so text escaped beforehand gets escaped again. Reach for manual escaping only where the framework hands control back — <code>dangerouslySetInnerHTML</code>, Vue’s <code>v-html</code>, a <code>|safe</code> filter — and at those points escaping alone is often not sufficient.',
    },
    {
      q: 'Which characters actually have to be escaped in body text?',
      a: 'Between tags, only an ampersand and a less-than sign can change how the document parses. A greater-than sign matters only where it would complete <code>]]&gt;</code>, and the quote characters matter inside an attribute value rather than outside one. Escaping all five anyway is the correct default, because text moves: a string that is safe in a paragraph today ends up in a <code>title</code> attribute tomorrow.',
    },
  ],

  'html-entity-decoder': [
    {
      q: 'Why does my text show â€™ instead of an apostrophe?',
      a: 'That is a byte-level mix-up rather than an entity problem, so decoding will not touch it: the UTF-8 sequence <code>E2 80 99</code> for a right single quote has been read as Windows-1252, which spells it out as three characters. Repair the pipeline that produced it — the connection charset, the <code>Content-Type</code> header, or a column still declared <code>latin1</code> — since find-and-replace only patches the sequences you have already noticed.',
    },
    {
      q: 'The decoded text still does not match my search. What is left in it?',
      a: 'Almost certainly an invisible character that an entity resolved to. A non-breaking space becomes U+00A0 rather than an ordinary space, <code>&amp;shy;</code> becomes a soft hyphen that renders as nothing at all, and <code>&amp;zwj;</code> and <code>&amp;#8203;</code> are zero-width. None of them are removed by <code>trim()</code>. Paste the result into <a href="/tools/unicode-converter">the Unicode converter</a> to see exactly which code points survived.',
    },
    {
      q: 'An emoji decoded here but my database rejects it. Why?',
      a: 'MySQL’s <code>utf8</code> is really <code>utf8mb3</code>: three bytes per character at most, which cannot hold anything above U+FFFF. A decoded <code>&amp;#128512;</code> needs four, so the insert fails with error 1366, <em>Incorrect string value</em>, or the column is truncated at that point. Converting the column, the table and the connection to <code>utf8mb4</code> is the only thing that lifts the limit.',
    },
  ],

  'unicode-converter': [
    {
      q: 'What is the black diamond question mark, and can I get the original character back?',
      a: 'It is U+FFFD, the replacement character a decoder substitutes when bytes are not valid in the encoding it was told to expect. The original is unrecoverable by then — the information was discarded before the string reached you, so no later conversion or normalisation brings it back. Fetch the source bytes again and decode them correctly; <a href="/tools/hex-to-text">the hex viewer</a> shows what they really are.',
    },
    {
      q: 'Why does my regular expression miss emoji?',
      a: 'Without the <code>u</code> flag, JavaScript matches UTF-16 code units, so <code>.</code> matches half of a surrogate pair and a character class can slice one emoji into two meaningless halves. <code>/./u</code> matches a whole code point, and property escapes such as <code>\\p{Letter}</code> are a syntax error unless that flag is set. Even then a flag or a family is several code points — try it in <a href="/tools/regex-tester">the regex tester</a>.',
    },
    {
      q: 'How do I strip accents from text?',
      a: 'Normalise to NFD so each accent becomes a separate combining mark, then delete the marks: <code>text.normalize("NFD").replace(/\\p{Diacritic}/gu, "")</code>. That handles é, ü and ñ, and quietly does nothing for letters with no decomposition — ø, ł, đ and ß come through unchanged, so a transliteration table is still needed. <a href="/tools/slug-generator">The slug generator</a> applies the table first and the fold second, in that order.',
    },
  ],

  'hex-to-text': [
    {
      q: 'The hex from my C program looks byte-swapped. Why?',
      a: 'Because integers in memory are little-endian on x86 and ARM: the 32-bit value <code>0x0000002A</code> sits in memory as <code>2a 00 00 00</code>. This tool reads bytes left to right, the way a file or a captured packet is laid out, and protocol fields are big-endian — the order RFC 1700 calls network byte order. Reverse each multi-byte field before pasting, or you are reading the number backwards.',
    },
    {
      q: 'Why does my SHA-256 hash decode to gibberish?',
      a: 'Because a digest is not encoded text. Those 64 hex characters are 32 bytes engineered to look random, and reading them as UTF-8 can only produce noise — there is no input hidden inside, which is precisely the point of a hash. Compare instead of decoding: recompute the digest of the candidate string with <a href="/tools/sha256-generator">the SHA-256 generator</a> and check the two strings match.',
    },
    {
      q: 'Why does xxd -r give me something different?',
      a: '<code>xxd -r</code> expects a full dump, offsets and ASCII gutter included, and treats the left-hand column as an address to seek to — hand it plain hex and it writes your bytes at wild offsets, padding the gaps with zeros. The flag you want is <code>xxd -r -p</code>, which reads a continuous run of hex digits, and <code>xxd -p</code> is what produces that form in the first place.',
    },
  ],

  'text-to-hex': [
    {
      q: 'What do the columns and the dots in a hexdump mean?',
      a: 'The left column is the offset in hexadecimal, sixteen bytes to a line, so <code>00000010</code> begins at byte 16. The panel on the right shows those bytes as ASCII, with a dot standing in for anything outside the printable range 0x20–0x7E. A dot is therefore not the character <code>.</code> — a tab, a null byte and the second half of an accented letter all look identical there, which is why the hex column is the one to trust.',
    },
    {
      q: 'How many bytes will this string take in a database column?',
      a: 'The byte count here is what byte-limited things measure: an HTTP header, a Kafka key, an index entry. Column limits differ by engine — Postgres <code>varchar(n)</code> counts characters, MySQL <code>VARCHAR(n)</code> counts characters too but the 65,535-byte row limit is in bytes, and the old 767-byte InnoDB index prefix is exactly where the familiar <code>VARCHAR(191)</code> for <code>utf8mb4</code> comes from.',
    },
    {
      q: 'Why does code copied from a web page fail to compile?',
      a: 'The bytes show it at once. A straight double quote is <code>22</code>, while the curly pair a CMS substitutes are <code>e2 80 9c</code> and <code>e2 80 9d</code>; a hyphen turned into an en dash is <code>e2 80 93</code>; and a space taken from rendered HTML is often <code>c2 a0</code>, a no-break space indistinguishable on screen from <code>20</code>. Compilers and shells accept none of the substitutes.',
    },
  ],
};
