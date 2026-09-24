---
title: Your online JSON formatter might be logging your API keys
published: false
tags: webdev, javascript, security, showdev
---

You have a 4,000-character JSON blob from a production API. It's one line. You
need to read it.

So you search "json formatter", click the first result, paste it in, and get
your answer in two seconds.

That blob had a bearer token in it. You just posted it to a server you know
nothing about, run by someone you've never heard of, with a privacy policy you
didn't read. It's in their access log now, and their logs are probably
retained, and you have no way to find out.

Nearly everyone does this. I did it for years.

## The problem isn't the tools, it's the architecture

Most online developer tools work like this:

1. You paste data into a form
2. The browser POSTs it to a server
3. The server formats it and sends it back

Step 2 is the problem. Once your data reaches someone else's server, what
happens to it is entirely a matter of trust. A privacy policy is a promise,
not a mechanism — and promises don't survive an acquisition, a breach, or a
sufficiently curious engineer with log access.

The frustrating part is that **none of these tools need a server at all.**
Formatting JSON, decoding Base64, computing a SHA-256, testing a regex — all
of it has been possible in the browser for over a decade. `JSON.parse` is
right there. `crypto.subtle` has been shipping since 2014.

## So I built the version I wanted

[FindTool](https://findtool.dev) is 50 developer tools where every one runs as
JavaScript in your own tab. There is no backend. Not "we don't log it" — there
is no server to log it.

You can verify this rather than trust it:

- Open the network tab and use any tool. Nothing is sent.
- Or load a page, turn off your wifi, and keep working.

That's the whole pitch. But building it this way had some consequences worth
writing about.

## What client-side actually forces you to get right

### Catastrophic backtracking can freeze the user's tab

On a server, a pathological regex is a denial-of-service vector called ReDoS
and it takes down your service. In the browser it takes down the user's tab —
which they experience as *your site crashed my browser*.

The pattern `(a+)+$` against a long string of `a` followed by `b` takes
exponential time. So the regex tester runs patterns in a Web Worker with a
hard deadline:

```js
const worker = new Worker(
  new URL('../workers/regex-worker.ts', import.meta.url),
  { type: 'module' },
);

const timer = setTimeout(() => {
  worker.terminate();   // the only way to stop a runaway regex
  worker = null;        // respawned on the next run
  showTimeoutError();
}, LIMITS.regexTimeoutMs); // 1500
```

You cannot interrupt a running regex any other way. `terminate()` on a worker
is the only tool, which is precisely why the work has to happen in one.

A surprising number of online regex testers still don't do this. Try
`(a+)+$` against forty `a`s and a `b` on your favourite one.

### "Verified" has to mean verified

A JWT is three base64url-encoded segments. Decoding one is trivial and proves
nothing — anyone can craft a token with any claims they like.

Plenty of decoders show you a green tick that means "this parsed". That is
actively dangerous, because it looks like the thing that matters.

So: with no key, the tool says the signature was **not** verified and implies
nothing else. Paste a secret or a public key and it performs a real
`crypto.subtle.verify` — HS256/384/512 against a shared secret, RS/PS/ES
against a PEM or JWK public key. Only then does it say verified.

### You have to be honest about broken algorithms

MD5 and SHA-1 are on the site because people genuinely need them — verifying
an old checksum, matching a Git object ID, talking to a legacy system.

They're labelled as broken, with specifics: MD5 collisions are generatable in
seconds on ordinary hardware; SHA-1 has been practically broken since the 2017
SHAttered attack. And SHA-256 has a section stating plainly that it is **not**
a password hashing function, because it's fast, and naming Argon2id, scrypt
and bcrypt instead.

It's tempting to just ship the hash and let people work it out. But a tool
that hands you MD5 with no context is how MD5 ends up in a password column.

## No framework, and the numbers that bought

Each tool is an independent island of plain DOM code. React would have added
around 45 KB gzipped to every page to manage a handful of text inputs.

The result:

| | |
|---|---|
| Homepage, compressed | **6.2 KB** |
| Tool pages | 10–15 KB including their JavaScript |
| Shared runtime | ~2 KB gzipped |
| LCP, throttled Slow 4G + 4× CPU | **~780 ms** |
| CLS | 0.001 |

The shared runtime is one small module — copy, download, upload, error
display, input size guards — so fifty tools behave identically without
fifty implementations.

## The thing that actually caught bugs

I wrote a script that serves the built site and drives a real browser over
every page: checking for JS errors, running axe-core, exercising each tool,
and **failing the build on any outbound network request**. That last check is
what keeps the privacy claim true rather than aspirational — if a tool ever
starts phoning home, CI goes red.

It found things static analysis could not:

- Muted text measured **4.40:1** against our own surface colour, just under
  the 4.5:1 AA threshold. It was used at 12–13px for every stat label.
- Escape didn't close the search dialog once you'd typed — `<input
  type="search">` consumes Escape to clear itself, so the dialog's native
  close never fired. One press cleared the field, a second was needed to
  leave.
- Three mobile layout breaks caused by `<select>` elements sized by their
  longest option. A timezone picker holds every IANA zone name, and a flex
  item won't shrink below its content width unless you clear `min-width`.

None of those are visible in a code review. All of them are obvious the
moment a browser is actually driving.

## Try it

[findtool.dev](https://findtool.dev) — free, no signup, no cookies.

If you find something broken I'd genuinely like to know. The interesting
feedback is always the harsh kind.
