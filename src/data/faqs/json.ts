import type { FaqMap } from './index';

/**
 * FAQ content for the JSON & Data tools. See ./index.ts for the rules that
 * govern what belongs here.
 */
export const jsonFaqs: FaqMap = {
  'json-formatter': [
    {
      q: 'Why does my JSON fail to parse when it looks correct?',
      a: 'The three most common causes are trailing commas after the last element, single quotes instead of double quotes around keys and strings, and unescaped newlines inside string values. JSON is stricter than JavaScript object literals — none of those are legal.',
    },
    {
      q: 'Does formatting change my data?',
      a: 'No. Formatting only changes whitespace. Key order is preserved, and numeric values are re-serialised exactly as parsed, so nothing is rounded or reordered.',
    },
    {
      q: 'Is there a size limit?',
      a: 'Documents up to roughly 2 MB format instantly. Larger inputs still work but syntax highlighting is disabled above 300 KB to keep the page responsive.',
    },
  ],

  'json-validator': [
    {
      q: 'Does JSON allow comments?',
      a: 'No. The grammar in RFC 8259 has no comment production at all, so <code>//</code> and <code>/* */</code> are syntax errors here and in every conforming parser. Files such as <code>tsconfig.json</code> and VS Code’s <code>settings.json</code> are JSONC, a separate dialect their own editors understand. Strip the comments before validating, or keep the file with a parser that documents JSONC or JSON5 support.',
    },
    {
      q: 'Why are NaN and Infinity rejected?',
      a: 'RFC 8259 §6 allows a number to be only an optional minus sign, digits, a fraction and an exponent — there is no literal for a non-finite value. Python’s <code>json.dumps</code> writes <code>NaN</code> and <code>Infinity</code> anyway unless you pass <code>allow_nan=False</code>, which is why a file produced by Python fails here with an unexpected token. Emit <code>null</code> or a string instead.',
    },
    {
      q: 'My log file has one object per line and it will not validate. Is it broken?',
      a: 'No — that is JSON Lines, sometimes called NDJSON, and only each individual line is a JSON document. The file as a whole never was one. Check a single line here, or fold the lines into an array first with <code>jq -s . file.jsonl</code>. Docker, BigQuery and most structured loggers emit this shape, and <code>jq</code> reads it natively with no flag.',
    },
  ],

  'json-minifier': [
    {
      q: 'Will minifying break a webhook signature or a JWT?',
      a: 'Yes. GitHub, Stripe and Shopify compute their HMAC over the exact request body, and a JWS signature covers the exact Base64url text of the payload, so re-serialising a document — even with identical data — yields a different digest and the check fails. Verify against the bytes you received, then minify a copy for storage. For tokens, use <a href="/tools/jwt-decoder">the JWT decoder</a> rather than reshaping them.',
    },
    {
      q: 'How much JSON can I safely put in a URL?',
      a: 'Less than the minified size suggests. Percent-encoding turns each <code>{</code>, <code>"</code> and <code>:</code> into three characters, and the whole request line must fit the server’s buffer: nginx allows 8 KB by default through <code>large_client_header_buffers</code>, and Apache’s <code>LimitRequestLine</code> is 8190 bytes. Past roughly 2 KB of raw JSON, move the payload into a POST body.',
    },
    {
      q: 'Should I commit minified JSON to Git?',
      a: 'Usually not. Git compares line by line, so a single-line document reports every edit as a rewrite of the whole file and a merge conflict swallows the entire payload. Keep the readable copy in the repository and minify at build time. Where you are stuck with one, <code>git diff --word-diff</code> at least isolates the changed tokens, and <a href="/tools/json-formatter">re-formatting it</a> makes review possible.',
    },
  ],

  'json-viewer': [
    {
      q: 'Why are my numeric keys shown in a different order from the file?',
      a: 'The tree is built from the parsed value, and JavaScript enumerates any key that is a canonical array index — <code>0</code>, <code>2</code>, <code>10</code> — in ascending numeric order ahead of the string keys, whatever order the text used. So <code>{"b":1,"10":2,"2":3}</code> lists 2, then 10, then b. A key like <code>007</code> is not an index, so it stays where you wrote it.',
    },
    {
      q: 'One of my repeated keys is missing from the tree. Where did it go?',
      a: '<code>JSON.parse</code> keeps only the last value for a repeated name, so the earlier occurrence never reaches the tree — the parsed object genuinely holds one member, even though the text holds two. <a href="/tools/json-validator">The JSON validator</a> scans the raw document instead of the parsed result and reports the line number of each repeat.',
    },
    {
      q: 'The file contains \\u00e9 but the tree shows é. Has something been rewritten?',
      a: 'No. That escape is JSON string syntax for a single character, so the parsed value is the letter itself and any consumer receives the same string either way. It does affect searching: the filter matches the character, not the six-character escape, so type the accented letter. <a href="/tools/unicode-converter">The Unicode converter</a> shows the code points behind either spelling.',
    },
  ],

  'json-to-csv': [
    {
      q: 'Why does Excel turn my IDs into 1.05E+18 and drop leading zeros?',
      a: 'Excel types every cell as it opens a <code>.csv</code>, holds numbers as doubles with 15 significant digits and discards the rest, so a 19-digit order ID is rounded and <code>00123</code> arrives as 123. Re-formatting the column afterwards cannot restore the digits. Import through <strong>Data &gt; From Text/CSV</strong> and mark those columns as Text, or open the file somewhere that does not guess.',
    },
    {
      q: 'A field containing a line break splits into two rows. Is the export wrong?',
      a: 'No — RFC 4180 §2 permits CR LF inside a quoted field, and such values are quoted here. The reader is at fault: anything that breaks the input into lines before it handles quoting, including a quick split on newlines, <code>cut</code> or <code>awk</code>, will tear the record apart. PostgreSQL’s <code>COPY … CSV</code> and Python’s <code>csv</code> module both cope.',
    },
    {
      q: 'How many rows and columns can a spreadsheet actually take?',
      a: 'Excel stops at 1,048,576 rows and 16,384 columns, and a wide flattened export can hit the column ceiling long before the row one, because the header is the union of every key that appears. Google Sheets caps a document at 10 million cells across all its tabs. Beyond those, load the file into a database or read it with <code>pandas</code>.',
    },
  ],

  'csv-to-json': [
    {
      q: 'Why do accented characters arrive broken when the file came from Excel?',
      a: 'Excel’s plain <em>Save as CSV</em> on Windows writes the machine’s legacy ANSI code page rather than UTF-8, so <code>José</code> leaves the spreadsheet as bytes that no UTF-8 reader can interpret. Pick <strong>CSV UTF-8 (Comma delimited)</strong> in the save dialog, offered since Excel 2016, and the text survives. Re-exporting is the only reliable repair — the damaged characters cannot be guessed back afterwards.',
    },
    {
      q: 'What happens when two columns share the same header?',
      a: 'An object cannot hold the same key twice, so the second one is renamed with a numeric suffix: two <code>id</code> columns become <code>id</code> and <code>id_2</code>, and the rename appears in the warnings rather than happening silently. A blank header cell becomes <code>column_4</code>, numbered by position. Fix the names in the source if you need stable keys, since the suffix follows column order.',
    },
    {
      q: 'Can I paste a TSV or cells copied straight out of a spreadsheet?',
      a: 'Yes. Copying a selection from Excel or Sheets puts tab-separated text on the clipboard, and tab is one of the delimiters probed during detection. Worth knowing: the IANA <code>text/tab-separated-values</code> format has no quoting rules whatsoever, so a genuine TSV cannot represent a cell containing a tab — what a spreadsheet copies is really CSV with tabs, which quotes those cells properly.',
    },
  ],

  'json-to-yaml': [
    {
      q: 'My workflow converted with an unquoted on key. Is that safe?',
      a: 'GitHub’s own parser copes, but the output follows YAML 1.2, where <code>on</code>, <code>off</code>, <code>yes</code> and <code>no</code> are ordinary strings and are therefore left bare. A YAML 1.1 reader — PyYAML, Go’s <code>yaml.v2</code>, several linters — takes that key as the boolean <code>true</code>, so a script looking up <code>on</code> finds nothing. Quote it by hand when a 1.1 tool consumes the file.',
    },
    {
      q: 'How is a string containing newlines written out?',
      a: 'As a literal block scalar, which keeps it readable instead of filling the line with escapes. A value that ends in a newline is emitted as <code>|</code>, and one that does not as <code>|-</code>, where the dash is a chomping indicator telling the parser not to add the final break back. That single character decides whether an embedded script or a PEM body round-trips byte for byte.',
    },
    {
      q: 'Should list items be indented under their key?',
      a: 'Both forms are legal — a sequence may begin at its parent key’s column or one level in — and <code>kubectl</code>, Helm and Docker Compose accept either. The output here indents them, as most emitters do. If your repository runs yamllint, the <code>indent-sequences</code> setting of its <code>indentation</code> rule is what decides which form it demands; <code>consistent</code> accepts whichever the file already uses.',
    },
  ],

  'yaml-to-json': [
    {
      q: 'Why does a Helm chart fail with a strange indentation error?',
      a: 'Because <code>{{</code> opens a flow mapping in YAML. A line such as <code>name: {{ .Release.Name }}</code> is read as a nested mapping and reports <em>bad indentation of a mapping entry</em> at a column that looks perfectly fine, which sends people hunting for spaces that were never wrong. Render the chart first with <code>helm template</code>, or quote the expression in the chart — good practice there in any case.',
    },
    {
      q: 'What does an empty value convert to?',
      a: 'The null node. A key with nothing after the colon, a <code>~</code>, and <code>null</code> in any capitalisation all become JSON <code>null</code>, whereas <code>""</code> is an empty string and <code>None</code> stays the three-letter text — Python habits do not carry over. Write the quotes explicitly when a field must be empty rather than absent, since a truthiness check treats the two identically but a schema will not.',
    },
    {
      q: 'Are merge keys expanded?',
      a: 'Yes. <code>&lt;&lt;: *defaults</code> pulls the keys of the aliased mapping into the current one and the JSON shows the merged result with no trace of the marker; keys written alongside the merge win over the ones it brings in. It is a YAML 1.1 feature that the 1.2 specification dropped, so a strict 1.2 parser may hand you a literal <code>&lt;&lt;</code> key instead — do not rely on it in files that unfamiliar tooling reads.',
    },
  ],

  'xml-formatter': [
    {
      q: 'What does the error content is not allowed in prolog mean?',
      a: 'Something sits in front of the opening angle bracket: most often a UTF-8 byte order mark (<code>EF BB BF</code>), a stray blank line, or an HTML error page returned where XML was expected — check whether the document actually starts <code>&lt;!DOCTYPE html&gt;</code>. Java’s SAX parser reports the position as line 1, column 1 regardless of where the junk is. Delete the prefix rather than editing the markup.',
    },
    {
      q: 'The declaration says ISO-8859-1 but the file is UTF-8. Does that matter?',
      a: 'Yes, and it fails at the first accented character rather than at the top of the file, which makes it look like a content problem. A parser trusts the declaration, so a two-byte sequence read as Latin-1 becomes two characters and libxml2 answers <em>Input is not proper UTF-8, indicate encoding</em>. Either re-save in the declared encoding or correct the declaration; <a href="/tools/text-to-hex">the hex view</a> shows which bytes you really have.',
    },
    {
      q: 'Can I use this on HTML?',
      a: 'Only on XHTML-shaped markup. HTML allows <code>&lt;br&gt;</code> with no closing slash, unquoted attribute values and bare attributes such as <code>disabled</code>, none of which are well-formed XML. It also defines more than two thousand named entities, while XML predefines exactly five — <code>&amp;amp;</code>, <code>&amp;lt;</code>, <code>&amp;gt;</code>, <code>&amp;quot;</code> and <code>&amp;apos;</code> — so one <code>&amp;nbsp;</code> is an undefined-entity error.',
    },
  ],

  'xml-to-json': [
    {
      q: 'Why is every number a string in the output?',
      a: 'Because XML carries no types. <code>&lt;qty&gt;3&lt;/qty&gt;</code> is one character of text; whether it is an integer lives in the XSD, which this converter does not read. Guessing would do damage — a document reference of <code>1E5</code> would silently become 100000. Cast the few fields you genuinely treat as numbers on your side, where you know which ones they are.',
    },
    {
      q: 'SOAP responses sometimes use soap and sometimes S for the same thing. How do I write code against that?',
      a: 'A prefix is chosen by whoever generated the document and means nothing on its own — only the URI it binds to is fixed, <code>http://schemas.xmlsoap.org/soap/envelope/</code> for SOAP 1.1 and <code>http://www.w3.org/2003/05/soap-envelope</code> for 1.2. Because keys keep the prefix verbatim, code hardcoding <code>soap:Body</code> breaks against a server that writes <code>S:Body</code>. Match on the part after the colon, or rewrite prefixes before converting.',
    },
    {
      q: 'Where did my CDATA section go?',
      a: 'Into the text key, unwrapped. A CDATA block is only an escaping device, so the parser hands back the characters inside it and markup stored in a feed’s <code>content:encoded</code> element arrives as a string full of real HTML tags. That string is not safe to drop into a page — escape it at output with <a href="/tools/html-entity-encoder">the HTML entity encoder</a>, or render it through something that sanitises.',
    },
  ],
};
