import type { FaqMap } from './index';

/**
 * FAQ content for the Hashing & Security tools. See ./index.ts for the rules
 * that govern what belongs here.
 */
export const securityFaqs: FaqMap = {
  'sha256-generator': [
    {
      q: 'Can I use SHA-256 to store passwords?',
      a: 'No. SHA-256 is designed to be fast, which is exactly wrong for password storage — commodity hardware can test billions of guesses per second. Use a deliberately slow, salted algorithm such as Argon2id, scrypt or bcrypt.',
    },
    {
      q: 'Does hashing a large file upload it?',
      a: 'No. The file is read with the FileReader API and hashed in this tab. Nothing is sent to FindTool, which is also why hashing a multi-gigabyte file depends on your own machine’s speed.',
    },
  ],
  'sha1-generator': [
    {
      q: 'If SHA-1 is broken, why does Git still use it?',
      a: 'Git hardened the hash rather than switching overnight. From version 2.13 it computes digests with sha1dc, Marc Stevens’ collision-detecting variant, which recognises the disturbance vectors a SHAttered-style attack needs and refuses the object instead of storing it. The SHA-256 repository format has existed since 2.29, but the two object formats do not interoperate, so converting a repository invalidates every commit ID anyone has ever written down.',
    },
    {
      q: 'Is it safe to shorten a hash to 8 or 12 characters?',
      a: 'Only once you know how many values you are naming. Truncation obeys the birthday bound: an <em>n</em>-bit prefix reaches a 50% chance of a duplicate after roughly 2 to the power <em>n</em>/2 values, so a seven-character hex prefix carries 28 bits and is even money at about 16,000 objects. That is why Git no longer hard-codes seven digits but scales the abbreviation with repository size — the Linux kernel needs twelve.',
    },
    {
      q: 'Is SHA-1 banned outright?',
      a: 'Not yet, but the retirement date is published. NIST SP 800-131A disallowed it for generating digital signatures from 2014, and NIST announced in December 2022 that SHA-1 will be withdrawn from all approved uses by 31 December 2030. It remains acceptable inside constructions that do not lean on collision resistance: HMAC, key derivation, and the one-time codes of RFC 4226 and RFC 6238, which is why authenticator apps still use it.',
    },
  ],
  'md5-generator': [
    {
      q: 'Why does an S3 ETag not match the file’s MD5?',
      a: 'Because the object arrived as a multipart upload. That ETag is the MD5 of the concatenated binary digests of each part, followed by a hyphen and the part count — a trailing <code>-14</code> gives it away — so reproducing it means knowing the exact chunk size, which the AWS CLI defaults to 8 MB. Objects encrypted with SSE-KMS or SSE-C carry an ETag that is not an MD5 at all.',
    },
    {
      q: 'How do I get an MD5 from the command line?',
      a: 'The command differs by platform, which is what breaks a shared runbook: <code>md5sum file</code> on Linux, <code>md5 -q file</code> on macOS and the BSDs, <code>certutil -hashfile file MD5</code> on Windows. Only the GNU form prints the two-column <em>digest, space, filename</em> layout that <code>md5sum -c sums.txt</code> expects, so produce that manifest on Linux or reshape the BSD output before trying to verify against it.',
    },
    {
      q: 'Is MD5 acceptable for cache keys or sharding?',
      a: 'Yes, wherever no attacker chooses the input — bucketing rows across shards, keying a cache entry, grouping files you already trust. None of those depend on collision resistance. Worth knowing that MD5 is not even fast by current standards: xxHash and BLAKE3 were designed for exactly this job and run several times quicker on the same hardware, and BLAKE3 keeps cryptographic strength while doing it.',
    },
  ],
  'hmac-generator': [
    {
      q: 'Why not just hash the secret and the message together?',
      a: 'Because <code>SHA-256(secret + message)</code> can be forged without the secret. SHA-1 and the SHA-2 family are Merkle–Damgård constructions, so the digest <em>is</em> the internal state at the end of the input: an attacker who has it and knows the input length can continue hashing, appending bytes and producing a valid digest for the longer message. Flickr’s API fell to this in 2009. The nested passes defined in RFC 2104 close the hole.',
    },
    {
      q: 'How long should the signing key be?',
      a: 'RFC 2104 §3 sets the floor at the digest length — 32 bytes for HMAC-SHA-256 — and there is a ceiling as well: a key longer than the hash’s 64-byte block (128 bytes for SHA-512) is itself hashed down to 32 bytes before use, so the surplus characters contribute nothing. A 200-character passphrase is no stronger than 32 bytes from the <a href="/tools/random-string-generator">random string generator</a>.',
    },
    {
      q: 'Why does my code produce a different HMAC from the library’s?',
      a: 'Nearly always because the key is being read as the wrong bytes. A secret published as 64 hex characters is 32 bytes of key material; signing with those 64 characters as UTF-8 text yields a completely different and completely wrong value, and the same trap catches Base64-encoded secrets. Some schemes never sign with the secret directly either: AWS Signature v4 chains four HMACs over <code>AWS4</code> plus the secret, the date, the region and the service.',
    },
  ],
};
