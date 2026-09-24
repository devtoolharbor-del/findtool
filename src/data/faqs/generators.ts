import type { FaqMap } from './index';

/**
 * FAQ content for the generators tools. See ./index.ts for the rules that govern
 * what belongs here.
 */
export const generatorFaqs: FaqMap = {
  'uuid-generator': [
    {
      q: 'Is it safe to put a UUID in a public URL?',
      a: 'A v4 value encodes nothing about its origin — it is randomness and a version marker, revealing no machine, sequence position or row count. Versions 1 and 6 do reveal something: RFC 9562 §5.1 keeps a 48-bit node field that is conventionally the generating host’s MAC address. Whatever the version, an unguessable identifier is not an authorisation check — confirm the caller owns the record, or you have an IDOR bug.',
    },
    {
      q: 'How should a UUID be stored in a database column?',
      a: 'As 16 bytes rather than 36 characters. PostgreSQL has a native <code>uuid</code> type; MySQL has none, so use <code>BINARY(16)</code> with <code>UUID_TO_BIN()</code> and <code>BIN_TO_UUID()</code>, available since MySQL 8.0. A <code>CHAR(36)</code> column more than doubles the width of the key and of every secondary index that carries a copy of it, which on a hundred-million-row table is measured in gigabytes.',
    },
    {
      q: 'Did RFC 9562 replace RFC 4122?',
      a: 'Yes. RFC 9562 was published in May 2024 and obsoletes RFC 4122 entirely. It leaves versions 1 to 5 as they were and adds three: v6, which is v1 with the timestamp bits reordered so values sort; v7; and v8 for vendor-defined layouts. It also settles the case argument — generators are to emit lowercase hex, parsers are to accept either.',
    },
  ],
  'random-string-generator': [
    {
      q: 'Why is Math.random not good enough for a token?',
      a: 'Because it is predictable by construction. V8 implements <code>Math.random()</code> with xorshift128+, and its 128-bit internal state can be reconstructed from a short run of observed outputs, after which every past and future value falls out of the arithmetic. It is a statistical generator, never a secret one. <code>crypto.getRandomValues()</code> draws from the operating system’s CSPRNG instead, which is the only source this page uses.',
    },
    {
      q: 'Should I store the API key I just generated?',
      a: 'Store a hash of it, never the key itself. Show the plaintext once, keep its <a href="/tools/sha256-generator">SHA-256</a> digest in the database, and hash each incoming key to compare. A single fast hash is the right call <em>here</em>, because a 128-bit random value has nothing to brute-force — unlike a human-chosen password, which needs Argon2id. Keep the first few characters in a separate column so the key stays recognisable in a UI.',
    },
  ],
  'password-generator': [
    {
      q: 'Why does a site reject a password this tool produced?',
      a: 'Usually an undisclosed cap. Plenty of banks still refuse anything past 16 or 20 characters, and some strip symbols silently instead of complaining. The failure worth knowing about is bcrypt, which truncates its input at 72 bytes — everything beyond is ignored rather than rejected, so two long passwords sharing a 72-byte prefix are the same password. If only long values fail at login, test that boundary first.',
    },
    {
      q: 'How do I check whether a password has appeared in a breach?',
      a: 'The Pwned Passwords range API answers without ever seeing it. You send the first five hex characters of the value’s SHA-1 — used purely as a bucket index, not as protection — and receive several hundred matching suffixes to compare locally. A hit means that exact string sits in a published dump. Generate a fresh value rather than editing the compromised one, since appending a digit is the first thing a cracking rule tries.',
    },
  ],
  'lorem-ipsum-generator': [
    {
      q: 'How much placeholder text should I generate for a layout?',
      a: 'Work backwards from the measure you are designing to. Typographic convention puts a comfortable line at 45 to 75 characters, about 66 being the usual ideal, which at an average English word of roughly five letters plus a space is 11 or 12 words per line. So a 60-word paragraph fills about five lines, and a card that previews three lines before clamping needs around 35 words to show the truncation.',
    },
    {
      q: 'Does placeholder text hurt SEO if it reaches production?',
      a: 'There is no penalty as such — the damage is what gets indexed. Google will happily crawl a live page whose <code>&lt;title&gt;</code> or meta description still reads <em>Lorem ipsum dolor sit amet</em> and print exactly that in the results, and a passage shared with thousands of other sites gives the page nothing of its own to rank for. Run <code>site:yourdomain.com lorem</code> after a launch; it reliably turns up forgotten staging pages.',
    },
    {
      q: 'Is there a shortcut for this inside my editor?',
      a: 'Emmet, which ships with VS Code, expands <code>lorem</code> to a 30-word sentence on Tab, <code>lorem100</code> to exactly 100 words, and <code>ul&gt;li*5&gt;lorem10</code> to a five-item list of ten words each. The same abbreviations work anywhere Emmet is supported, including WebStorm and Sublime Text. Come here instead when you want a specific paragraph count, HTML wrapping, or text you can hand to a non-developer.',
    },
  ],
  'random-number-generator': [
    {
      q: 'Is this fair enough to pick a competition winner?',
      a: 'The draw is unbiased, but nobody watching can verify that — you could have pressed the button until you liked the answer. A public draw needs verifiability rather than better entropy: publish a commitment to the entrant list first, then derive the winner from a value nobody controls, such as NIST’s randomness beacon, which signs and publishes a fresh 512-bit value every 60 seconds.',
    },
    {
      q: 'How do I do the same thing on the command line?',
      a: '<code>shuf -i 1-100 -n 6</code> gives six distinct numbers wherever GNU coreutils is installed. Avoid bash’s <code>$RANDOM</code> for anything that matters: it is 15-bit, so it never exceeds 32767, and it is seeded predictably. In Python, <code>random.randint()</code> is a Mersenne Twister whose entire state can be recovered from 624 consecutive outputs — reach for <code>secrets.randbelow()</code> when the number is meant to be a secret.',
    },
  ],
  'nano-id-generator': [
    {
      q: 'Is a Nano ID strong enough for a secret share link?',
      a: 'Guessing is not the weak point; the journey the URL takes is. A link leaks through <code>Referer</code> headers sent to third-party scripts, through browser history and shared proxy logs, and through the preview fetch a chat client fires the instant someone pastes it. Treat the identifier as a bearer credential: give it a short expiry, bind it to one recipient where the flow allows, and invalidate it after first use.',
    },
    {
      q: 'Is Nano ID specified anywhere, or is it just a library?',
      a: 'There is no RFC behind it, only a widely ported JavaScript implementation, so nothing authoritative settles a disagreement between two ports. The default size of 21 and the 64-symbol alphabet <code>A-Za-z0-9_-</code> are conventions each port chooses to honour. Record both in your schema and validate against them: a service that quietly defaults to 12 characters shifts your safe-volume figure by eight orders of magnitude.',
    },
  ],
};
