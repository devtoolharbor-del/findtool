import type { FaqMap } from './index';

/**
 * FAQ content for the text tools. See ./index.ts for the rules that govern
 * what belongs here.
 */
export const textFaqs: FaqMap = {
  'word-counter': [
    {
      q: 'Why does Microsoft Word report a different number?',
      a: 'Two settings explain most of the gap. Word’s Word Count dialog has an <em>Include textboxes, footnotes and endnotes</em> checkbox that is off by default, so anything in those is missing from the figure you are comparing against. And while tracked changes are shown as All Markup, deleted text is still counted — switch to Simple Markup, or accept the edits, before checking against a hard limit.',
    },
    {
      q: 'Why did my word count jump after pasting from a PDF?',
      a: 'PDF extraction preserves the page layout rather than the sentence. A word hyphenated across a line break arrives as <code>inter-</code> and <code>national</code> on separate lines and counts as two, soft hyphens sit invisibly inside others, and a figure written with a non-breaking space still separates into two tokens. Clean the text with the <a href="/tools/remove-extra-spaces">extra-space remover</a> first, then count it.',
    },
    {
      q: 'Why is the reading time shorter than my blog platform’s?',
      a: 'Different constants, applied to the same words. Medium’s estimate assumes 265 words per minute and adds a fixed allowance per image; many WordPress plugins use a round 200; this page uses 238. On a 1,500-word post that spread runs from 5.7 minutes to 7.5. All three are averages for silent reading of prose, and a page carrying code listings or tables takes far longer than any of them predicts.',
    },
  ],
  'character-counter': [
    {
      q: 'Why do two strings that look identical count differently?',
      a: 'Unicode can encode the same text more than one way. <code>é</code> is either <code>U+00E9</code> or a plain <code>e</code> followed by the combining acute accent <code>U+0301</code> — one code point or two, two UTF-8 bytes or three — and a direct <code>===</code> comparison of the two forms is <code>false</code>. Normalisation (Unicode Annex #15) settles it: call <code>.normalize(\'NFC\')</code> on both sides before comparing, hashing or storing. The grapheme figure is 1 either way.',
    },
    {
      q: 'Why is my 200-character bio rejected by a varchar(255) column?',
      a: 'Because the column may not be counting characters at all. PostgreSQL and MySQL size <code>varchar(255)</code> in characters, but SQL Server’s <code>varchar(255)</code> is 255 <em>bytes</em>, and Oracle’s <code>VARCHAR2(255)</code> defaults to byte semantics unless it is declared with <code>CHAR</code>. An accented or emoji-heavy 200-character bio can be over 400 bytes. Against those systems, read the UTF-8 byte figure above rather than the grapheme one.',
    },
    {
      q: 'Is it safe to truncate text with slice(0, 100)?',
      a: 'Not for arbitrary input. <code>String.prototype.slice</code> cuts by UTF-16 code unit, so it can land between the two halves of a surrogate pair and leave an unpaired surrogate behind. That value renders as a replacement character, has no valid UTF-8 encoding, and makes <code>encodeURIComponent</code> throw <code>URIError: URI malformed</code>. Use <code>Array.from</code> to slice by code point, or <code>Intl.Segmenter</code> when the limit is meant to match what a reader sees.',
    },
  ],
  'text-case-converter': [
    {
      q: 'Are HTTP header names case-sensitive?',
      a: 'No. RFC 9110 §5.1 defines field names as case-insensitive, so <code>Content-Type</code> and <code>content-type</code> address the same field. HTTP/2 goes further: RFC 9113 §8.2.1 requires field names on the wire to be lowercase and says a message containing an uppercase one must be treated as malformed. Train-Case is a readability convention for docs and HTTP/1.1 dumps, which is why a test asserting exact header casing breaks the moment the connection is upgraded.',
    },
    {
      q: 'Why do my camelCase Postgres columns need quotes forever?',
      a: 'PostgreSQL folds every unquoted identifier to lower case, so <code>CREATE TABLE t (userId int)</code> really creates <code>userid</code>. The SQL standard folds to upper case instead, which is what Oracle does — neither preserves what you typed. Once a column exists as a quoted <code>"userId"</code>, every query touching it must quote it identically. The common escape is snake_case in the database, camelCase in application code, converted at the boundary.',
    },
    {
      q: 'Which case should a JSON API use?',
      a: 'camelCase is the safe default: Google’s JSON Style Guide specifies it, and protobuf’s canonical JSON mapping rewrites a <code>user_account_id</code> field to <code>userAccountId</code> automatically, so a gRPC service exposed over JSON emits camelCase whether that was the plan or not. Consistency matters more than the choice itself — a payload mixing <code>created_at</code> with <code>updatedAt</code> guarantees someone writes the wrong accessor.',
    },
  ],
  'remove-duplicate-lines': [
    {
      q: 'Why does uniq leave duplicates in my file?',
      a: '<code>uniq</code> collapses only runs of <em>adjacent</em> identical lines, so any repeat that is not sitting next to its twin survives — which is why it is nearly always written as <code>sort | uniq</code>, or replaced by <code>sort -u</code>. The order-preserving equivalent of this page is <code>awk \'!seen[$0]++\' file</code>: it keeps the first occurrence of every line and streams the rest through untouched.',
    },
    {
      q: 'Why do identical-looking lines survive when the file came from Windows?',
      a: 'Windows ends each line with a carriage return plus a line feed. Mix that file with Unix-formatted text and every line from it secretly carries a trailing <code>U+000D</code>, so <code>value</code> and the carriage-returned <code>value</code> are genuinely different strings and both are kept. Switching on <em>trim before comparing</em> removes it, because a carriage return is whitespace; normalising line endings first does the same job permanently.',
    },
    {
      q: 'How do I drop rows duplicated by one column rather than the whole line?',
      a: 'This page compares complete lines, so a CSV export where only the email column repeats looks entirely unique — the timestamps differ. Paste just that column, or key on a field directly with <code>awk -F, \'!seen[$2]++\' file.csv</code>. If the copy you want to keep is the newest, order the rows by date in the <a href="/tools/sort-lines">line sorter</a> first and set this tool to keep the last copy.',
    },
  ],
  'sort-lines': [
    {
      q: 'Why does the sort command give a different order than this page?',
      a: 'Locale. Under a UTF-8 locale, GNU <code>sort</code> uses locale collation, which ignores punctuation and case at the first comparison level, so <code>a-b</code>, <code>ab</code> and <code>Ab</code> interleave in ways byte order never produces. <code>LC_ALL=C sort</code> switches to plain byte comparison and matches the alphabetical mode here with <em>case sensitive</em> enabled. Pinning that variable is what stops a generated file from reshuffling itself on a colleague’s machine.',
    },
    {
      q: 'Can I sort a JSON, YAML or CSV file this way?',
      a: 'Only if it is a flat list. Sorting the lines of a JSON document moves closing braces and commas away from the structures they close, and the result will not parse — nested data is not a set of interchangeable rows. Sort the keys with the <a href="/tools/json-formatter">JSON formatter</a> instead. A CSV is safe only once the header row is removed, or it will be sorted into the middle of the data.',
    },
    {
      q: 'Is it safe to alphabetise a .env file or a block of imports?',
      a: 'Some files are order-dependent. Dotenv-style expansion resolves top to bottom, so <code>BASE_URL=${HOST}/api</code> breaks as soon as it sorts above <code>HOST</code>. In CSS, <code>@import</code> must stay ahead of every ordinary rule, and the last declaration of equal specificity is the one that wins. Language import blocks are usually safe to reorder — that is what isort and ESLint’s sort-imports do — but configuration files often are not.',
    },
  ],
  'text-diff': [
    {
      q: 'Why does git show a different diff for the same two files?',
      a: 'Git defaults to the Myers algorithm plus an indent heuristic, on by default since Git 2.14, which shifts hunk boundaries to the more readable line; <code>--histogram</code> and <code>--patience</code> pick different but equally valid common subsequences. Any of them is correct provided applying the result reproduces the second file exactly. What varies is only which lines each one decides to call unchanged.',
    },
    {
      q: 'Why is every single line marked as changed?',
      a: 'Almost always line endings or a byte-order mark. If one file was saved with Windows CRLF endings and the other with LF, no line matches exactly, so the comparison is honest but useless. A stray <code>U+FEFF</code> at the start of one file spoils the first line only. Turn on <em>ignore whitespace</em> to confirm the diagnosis, then fix it properly in the <a href="/tools/remove-extra-spaces">extra-space remover</a>.',
    },
    {
      q: 'Why does a minified file show up as one huge change?',
      a: 'Because a line-based comparison has nothing to align on. A minified bundle or a single-line API response is one line, so any difference anywhere in it marks that line — the entire file — as one modified row. Format both sides first: the <a href="/tools/json-formatter">JSON formatter</a> for payloads, or any formatter that puts one declaration per line for stylesheets. The change then localises to a handful of rows.',
    },
  ],
  'remove-extra-spaces': [
    {
      q: 'Why doesn’t trim() or \\s remove these characters?',
      a: 'Coverage varies by language and by character. JavaScript’s <code>trim()</code> and <code>\\s</code> do match <code>U+00A0</code> and <code>U+FEFF</code>, but never <code>U+200B</code>, which Unicode 4.0.1 reclassified from a space to a format character. Java’s and Go’s <code>\\s</code> are ASCII-only, and PCRE’s is too unless Unicode property support is switched on. Check the behaviour you are counting on in the <a href="/tools/regex-tester">regex tester</a> before shipping it.',
    },
    {
      q: 'How do I find out which invisible character is in my string?',
      a: 'Dump the code points. In JavaScript, <code>[...s].map(c => c.codePointAt(0).toString(16))</code> prints them; on a file, <code>hexdump -C</code> does. VS Code flags them in the editor too — <code>editor.unicodeHighlight.invisibleCharacters</code> has been on by default since version 1.63, which is why a pasted string sometimes shows a yellow box around apparently nothing. The panel above names each one it finds in your text.',
    },
    {
      q: 'Why does a non-breaking space come back every time I edit the text?',
      a: 'Rich-text editors insert them on purpose. HTML collapses a run of whitespace to a single space, so a <code>contenteditable</code> field that has to preserve a double space writes <code>U+00A0</code> as the second one — Google Docs, Slack and most CMS editors all behave this way. French typographic rules add more, putting a space before <code>;</code> <code>:</code> <code>!</code> and <code>?</code>. Clean the text where it leaves the editor, not before.',
    },
  ],
  'slug-generator': [
    {
      q: 'Can a URL contain accented or non-Latin characters?',
      a: 'It can, but never literally. RFC 3986 restricts a path to ASCII, so <code>café</code> travels as <code>caf%C3%A9</code> — and that percent-encoded form is what a reader copies out of the address bar into a chat message, an email or a log line. Add that different scripts contain characters which render identically, and plain ASCII remains the right default for any URL shared by hand.',
    },
    {
      q: 'Hyphens or underscores in a slug?',
      a: 'Hyphens. Google’s URL structure guidance recommends them explicitly and treats an underscore as a word joiner rather than a separator, so <code>blue_widget</code> can be read as a single token where <code>blue-widget</code> is unambiguously two. An underscore also vanishes beneath the underline most browsers and chat clients draw under a link. A literal space is worse again: it becomes <code>%20</code> and breaks links pasted into plain text.',
    },
    {
      q: 'Are slugs case-sensitive?',
      a: 'The path is. RFC 3986 §6.2.2.1 makes only the scheme and host case-insensitive, so <code>/About-Us</code> and <code>/about-us</code> are two distinct URLs. IIS and a default macOS filesystem nevertheless serve both from the same file, so both resolve and a crawler sees duplicate content at two addresses. Keep slugs lowercase, and where mixed-case links already exist, send a <a href="/tools/http-status-codes">301</a> rather than answering at both.',
    },
  ],
};
