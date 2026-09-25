# Building FindTool from nothing

This is the whole project written as instructions: what was decided, in what
order, and why. It is meant to be followed, not just read — someone starting
from an empty directory should be able to reach the same running site.

It records decisions and their reasons. It does not record the wrong turns,
except where a reason only makes sense as the scar of one — those are marked
**Why this way** and they are the most valuable part of the document.

- **Live site:** https://findtool.dev
- **Repo:** https://github.com/devtoolharbor-del/findtool
- **Stack:** Astro (static) · TypeScript · Tailwind v4 · Cloudflare Pages
- **Credentials:** never in the repo. See `~/findtool-credentials.md`.

---

## Contents

1. [The brief](#1-the-brief)
2. [Decisions made before any code](#2-decisions-made-before-any-code)
3. [Naming and the domain](#3-naming-and-the-domain)
4. [Project setup](#4-project-setup)
5. [Architecture](#5-architecture)
6. [Design system](#6-design-system)
7. [Building the tools](#7-building-the-tools)
8. [Search](#8-search)
9. [SEO](#9-seo)
10. [The verification stack](#10-the-verification-stack)
11. [Accounts and infrastructure](#11-accounts-and-infrastructure)
12. [Deployment](#12-deployment)
13. [DNS, SSL and email](#13-dns-ssl-and-email)
14. [Analytics](#14-analytics)
15. [Search Console and indexing](#15-search-console-and-indexing)
16. [The one piece of server-side code](#16-the-one-piece-of-server-side-code)
17. [Changing the catalogue later](#17-changing-the-catalogue-later)
18. [Launch](#18-launch)
19. [Operating it](#19-operating-it)
20. [Rules that were never broken](#20-rules-that-were-never-broken)

---

## 1. The brief

Roughly fifty high-quality developer tools, processed entirely in the browser,
with no backend unless one is genuinely unavoidable. Astro, TypeScript,
Tailwind, Cloudflare Pages, GitHub. A registry-driven architecture that still
works at 100, 500 or 1,000 tools, where adding a tool means one config entry
and one component. Clean URLs. Excellent technical SEO. Light and dark mode.
Fast client-side search with synonyms. A privacy statement only where it is
literally true. Designed for ads but with none enabled. Accessible, keyboard
usable, tested across browsers and devices and against empty, invalid and
oversized input. Deployed properly: DNS, SSL, canonical redirects, email
routing, analytics, Search Console.

Constraints that shaped everything after: **no secrets in the repository**, no
personal details published, no false identity information given to any
provider, no paid service enabled without approval, and no ads or AdSense
application without an explicit request.

---

## 2. Decisions made before any code

These five are load-bearing. Changing any one of them changes what the site is.

**Everything runs client-side.** Not a policy, an architecture: there is no
server to send data to. Every privacy claim on the site depends on this
staying true, which is why one automated check fails the build on *any*
outbound network request.

**Static first.** The whole site is pre-rendered HTML on a CDN. No SSR, no
runtime, no cold starts. Exactly one route later broke this rule, on purpose
and under protest — see [section 16](#16-the-one-piece-of-server-side-code).

**No UI framework.** React would add roughly 45 KB gzipped to every page in
order to manage a handful of text inputs. Each tool is an island of plain DOM
code, and a `mount()` helper scopes each tool's script to its own root
element, which is all the isolation these need.

**The registry is the source of truth.** Routing, navigation, search, the
sitemap and all metadata derive from one array. Nothing is hand-wired, so
nothing can drift out of sync.

**The tool is the page.** Explanatory prose supports the tool. It never pushes
it below the fold.

---

## 3. Naming and the domain

The first name was taken. So was the second.

**Check availability with RDAP, and prove the check works.** Registry
endpoints differ per TLD and a wrong one returns 404 for *every* domain, which
reads identically to "available". The check must include controls: a domain
that is certainly registered must come back **taken**, and a nonsense string
must come back **available**. If either control fails, the checker is broken
and its answers are worthless.

```sh
# rdap.org proxies to the correct registry per TLD
curl -s -o /dev/null -w "%{http_code}" https://rdap.org/domain/example.dev
# 200 = registered, 404 = available — but only once the controls pass
```

Register it yourself, with real identity details, and turn on WHOIS privacy —
that hides the details from public lookup without lying to the registrar.

Put the name in exactly one file so a rename is a three-line edit:

```js
// site.config.mjs — plain JS so astro.config.mjs and scripts/ can import it
export const SITE_NAME = 'FindTool';
export const SITE_DOMAIN = 'findtool.dev';
export const SITE_URL = `https://${SITE_DOMAIN}`;
```

**Why this way.** The site was renamed once, and the rename was missed three
separate times: in `public/site.webmanifest`, where a real phone showed the old
name on its home screen; in the README, which named a domain we do not own as
production; and in `package.json`. Each was found by a person, not by the
build. There is now a check in `verify-build.mjs` that fails on the old brand
name appearing anywhere in source or output, and a JSON file under `public/`
is now generated from the config instead of being a static asset nothing
imports.

---

## 4. Project setup

**Node 22.12 or newer is required.** Astro 7 builds with rolldown, which ships
a native binary.

```sh
npm create astro@latest findtool -- --template minimal --typescript strict
cd findtool
npm install -D @tailwindcss/vite tailwindcss @astrojs/check typescript
npm install -D vitest playwright @axe-core/playwright axe-core
npm install sharp            # OG image generation
```

If the build ever fails with **"Cannot find native binding"**, npm resolved the
platform-specific rolldown package against a different Node version. Delete
`node_modules` and `package-lock.json` and reinstall under Node 22. Switching
Node versions without reinstalling is the usual cause.

`astro.config.mjs`:

```js
export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },   // /tools/x.html served at /tools/x
  vite: { plugins: [tailwindcss()] },
});
```

`trailingSlash: 'never'` plus `format: 'file'` is what gives clean canonical
URLs with no redirect hop. Pick this at the start; changing it later invalidates
every indexed URL.

---

## 5. Architecture

```
site.config.mjs          Brand and origin. The only place either is written.
src/
  data/tools.ts          THE REGISTRY — one entry per tool.
  data/categories.ts     The seven categories.
  data/featured.ts       The curated "most useful" order, used by four surfaces.
  data/faqs/             Per-tool FAQ prose, one module per category.
  lib/                   Pure, DOM-free logic per topic. Unit-tested in Node.
  lib/toolkit.ts         Shared browser helpers used by every tool (~2 KB gz).
  tools/                 One .astro per tool.
  pages/tools/[slug].astro   The single tool route; resolves from the registry.
functions/               Cloudflare Pages Functions. One file. See section 16.
public/_headers          Security headers and cache policy.
public/_redirects        301s for URLs that moved. Append only.
scripts/                 Build verification and the browser-driven QA suites.
tests/                   Vitest.
```

One registry entry looks like this, and it is the entire contract:

```ts
{
  slug: 'base64-encoder',        // URL: /tools/base64-encoder
  name: 'Base64 Encoder',
  category: 'encoding',
  description: '…',              // one sentence: cards, search, page subtitle
  seoTitle: '…',                 // unique; ≤70 chars including " — FindTool"
  seoDescription: '…',           // unique; 80–175 chars, aim 140–160
  keywords: ['…'],               // topic terms
  aliases: ['…'],                // what a hurried developer actually types
  related: ['…'],                // 4–5 slugs, most relevant first
  component: 'Base64Encoder',    // src/tools/Base64Encoder.astro
  icon: 'binary',
  serverProcessing: false,       // true ⇒ the local-processing claim disappears
  order: 1,                      // position within the category
  addedAt: '2026-09-24',
}
```

Everything else — the route, nav, search index, category page, related-tool
block, breadcrumbs, structured data, sitemap entry — derives from it.

Full contract: [`docs/adding-a-tool.md`](adding-a-tool.md).

---

## 6. Design system

Tailwind v4 via `@tailwindcss/vite`, with semantic tokens in `@theme inline`
and a `@custom-variant dark`. Never hard-code a colour in a component; use
`text-ink`, `text-muted`, `bg-surface`, `border-line`, `text-accent` and the
rest, which flip automatically.

A `bc-*` class vocabulary sits on top — `bc-btn`, `bc-input`, `bc-panel`,
`bc-card`, `bc-stat`, `bc-toolbar`, `bc-tool-grid`. Fifty tools built from the
same dozen classes look like one product; fifty tools built from ad-hoc
utilities do not.

Two specifics worth copying:

- **Check contrast with a tool, not an eye.** The muted text colour measured
  4.40:1 against the surface — just under the 4.5:1 AA threshold — and was in
  use at 12–13px on every stat label across the site. Nobody saw it. axe-core
  did.
- **`bc-tool-grid` carries `grid-auto-rows: 1fr`.** Without it each grid row
  sizes independently, so a row whose longest description wraps to three lines
  is 129px while the row beneath it is 106px. The same card renders at two
  sizes depending on what happens to sit beside it, and adding one tool
  silently resizes boxes on unrelated pages.

---

## 7. Building the tools

Three steps per tool, in this order:

**1. Logic in `src/lib/<topic>.ts`** — pure, no DOM, so it can be tested in
Node. Group by topic, not by tool: `src/lib/base64.ts` backs both the encoder
and the decoder. Throw errors written for a user, not a developer:

```ts
throw new Error('This is not valid Base64 — the length must be a multiple of 4.');
```

**2. UI in `src/tools/<Component>.astro`** — wraps `<ToolLayout>`, uses the
`bc-*` classes, and declares standard data attributes (`data-primary-input`,
`data-output`, `data-copy`, `data-clear`, `data-example`) that
`wireStandardActions()` wires up for free.

**3. One registry entry.**

Every tool must handle empty input by clearing rather than erroring, explain
invalid input specifically, refuse oversized input politely, offer Copy, Clear
and a realistic Example, work by keyboard alone, and render its heading,
description and prose server-side so it is useful without JavaScript.

Some cases the tools had to get right, as a flavour of the standard:

- **Regex runs in a Web Worker with a 1.5-second kill.** `(a+)+$` against a
  long run of `a` takes exponential time, and a runaway regex cannot be
  interrupted any other way — `worker.terminate()` is the only mechanism,
  which is precisely why the work has to happen in a worker at all.
- **A JWT decoder must not imply verification.** With no key, the tool says
  the signature is *not* verified and claims nothing else. Given a secret or
  a public key it performs a real `crypto.subtle.verify`. A green tick that
  means "this parsed" is actively dangerous.
- **Broken hashes are labelled.** MD5 and SHA-1 are present because people
  need them for legacy checksums, and each says so specifically. SHA-256 says
  plainly that it is not a password hashing function and names Argon2id,
  scrypt and bcrypt instead.
- **Arbitrary precision where the numbers demand it.** A /64 holds
  18,446,744,073,709,551,616 addresses; `Number` loses integer accuracy above
  2⁵³, so the subnet calculator uses `BigInt`. A calculator that silently
  rounds is worse than none.

### Number and content invariants

If a sample value in prose is *derived* — an HMAC signature, a Base64 string,
a JWT, a regex capture offset — it is coupled to the brand name or to other
content. A blanket find-and-replace invalidates it silently. **Recompute such
values with a script; never hand-edit them.**

---

## 8. Search

A command palette on `/`, ⌘K and Ctrl-K. The index is fetched once from
`/search.json` on first open, so the catalogue never weighs down initial load.

Scoring lives in `src/lib/search.ts`. Exact matching runs first; fuzzy matching
runs only if exact returns nothing, using Optimal String Alignment
(Damerau–Levenshtein with adjacent transposition) so `jsno` finds JSON. Name
matches weigh 14, keywords 9.

`aliases` is what makes it feel good. Put in what people actually type: `b64`,
`epoch`, `guid`, `regexp`, `crontab`, `nbsp`, `whatismyip`.

**Two things that bite:**

- `<input type="search">` swallows Escape to clear itself when it has a value,
  so the dialog's native close never fires and the key appears to do nothing.
  Handle Escape explicitly, and add a regression test that types first.
- The empty state must be a **curated** list, not the first six of whatever
  sort order the array happens to be in. Ranking by spelling opens the dialog
  with "Base64 Decoder" and "Color Converter". `src/data/featured.ts` holds
  that order, and the homepage shortcut row, the Most used grid, the footer
  and the dialog all read from it — four surfaces, one list.

---

## 9. SEO

- Unique `<title>` and meta description per page, enforced by the build.
- Absolute self-referencing `<link rel="canonical">` with no trailing slash.
- Hand-rolled sitemap from the registry. `@astrojs/sitemap` cannot express
  per-tool `lastmod` from registry metadata and emits trailing-slash URLs that
  disagree with the canonical form.
- `robots.txt` naming the absolute sitemap URL.
- Open Graph and Twitter tags, with a generated per-tool social card.
- JSON-LD: `SoftwareApplication` on tool pages, `BreadcrumbList`, `FAQPage`
  from the FAQ data, `ItemList` on category pages.
- **Everything crawlable with JavaScript disabled.** A no-JS pass in the audit
  proves it rather than assuming it.

Two rules that came out of operating it:

- **Do not advertise a tool count.** "50 tools" in copy goes stale the moment
  a tool is added, and it went stale — sitting in the search placeholder under
  a "52 tools" heading that was derived correctly. Nobody needs the number.
  `verify-build.mjs` now fails on any count in rendered text.
- **A retired URL gets a 301, not a 404.** See
  [section 17](#17-changing-the-catalogue-later).

---

## 10. The verification stack

This is the part that actually produced quality, and the part most worth
copying. Five layers, all gating CI, each of which caught defects the others
could not see.

| Layer | What it does |
| --- | --- |
| `npm test` | Unit tests per lib module, plus registry invariants and SEO surfaces |
| `npm run check` | TypeScript and Astro template diagnostics |
| `npm run verify` | Static QA of `dist/` — links, canonicals, metadata, schema, secrets |
| `npm run audit` | Real browser over every page — a11y, JS errors, network, each tool exercised |
| `npm run cross-browser` | Every tool in Chromium, Firefox and WebKit |
| `npm run security` | XSS payloads, CSP, ReDoS containment, input limits |
| `npm run edge` | Empty, malformed and 2.1 MB input; keyboard navigation |
| `npm run perf` | Core Web Vitals against a budget, throttled |

Some specific checks worth stealing:

- **Fail the build on any outbound request.** This is what keeps "nothing is
  uploaded" true rather than aspirational. Analytics hosts are enumerated and
  aborted rather than the ban being switched off.
- **Measure tool output before and after interacting.** "Has content" passes
  for a completely broken tool, because tool pages carry a lot of static prose.
  Requiring the output to *change* does not.
- **Verify the clipboard actually received the text**, by seeding it with a
  sentinel first.
- **Assert both directions of a coupling.** Where an edge function fills
  placeholders in a page, check that every key the function writes has a
  placeholder *and* that every placeholder gets written.

### The rule that matters most

> **Presence proves nothing. Only a success response does.**

This came from an analytics beacon that sat in the HTML, with a plausible
token, recording absolutely nothing for weeks. Every visual inspection passed.
Whenever a check asserts that something *exists*, ask whether it can instead
assert that the thing *worked* — and if it cannot, say so out loud rather than
letting the weaker check imply the stronger one.

### And a rule about fixing

When a symptom appears and the explanation is a guess, do not commit the guess
as a comment. A wrong explanation written down as fact is worse than an open
question, because the next person stops looking.

---

## 11. Accounts and infrastructure

One Google account for the project, used to sign in to GitHub and Cloudflare.

**Give it its own password and turn on 2FA.** A shared password means one
breach is three breaches, and 2FA matters more than password strength.

**Never put a secret in the repo.** Where a token is needed:

- CI reads it from GitHub Actions secrets, which are write-only once set.
- Local tooling reads it from the environment, never from a committed file.
- Nothing is written to disk inside the working tree.

Set an Actions secret without the value touching a file by sealing it with
libsodium against the repo's public key, via the API. Authenticate to GitHub
with the **device flow** rather than a password:

```sh
# POST https://github.com/login/device/code with a client_id, show the user
# the code, poll https://github.com/login/oauth/access_token until authorised.
```

Any browser automation runs **Playwright's own bundled browser with a
throwaway profile** — never an installed browser with real sessions in it.

---

## 12. Deployment

Cloudflare Pages in direct-upload mode, deployed by GitHub Actions. The
workflow is the only thing holding credentials.

Structure the workflow as **build once → fan out verification → deploy the
artifact that passed**:

```yaml
jobs:
  build:     # npm ci, check, test, build, verify; uploads dist as an artifact
  verify:    # matrix: audit | cross-browser | edge | security | perf
  deploy:    # downloads the same artifact and ships it
```

**Why this way.** Run sequentially, the suites took 10.2 minutes against a
10-minute limit and the job was cancelled with seconds of work left. In
parallel the wall clock is roughly the slowest single suite, and a failure
names itself in the job list instead of having to be dug out of one long log.
Deploying the *same bytes* that were verified, rather than rebuilding, means
what ships is what was tested.

Two operational notes:

- `concurrency: cancel-in-progress` means a second push cancels the first
  run. A `cancelled` deploy in the list is usually this, not a failure — the
  newer run built the same commit's tree and deployed it.
- The `functions/` directory is compiled from the repo root, not from `dist/`,
  so the deploy job must check out the repository as well as download the
  artifact.

Pull requests get their own preview URL at `<branch>.<project>.pages.dev`,
which is how anything risky gets verified against real infrastructure before
production sees it.

---

## 13. DNS, SSL and email

- Nameservers moved to Cloudflare; apex and `www` are proxied CNAMEs to the
  Pages project.
- SSL/TLS **Full (strict)**, Always Use HTTPS on. `.dev` is HSTS-preloaded, so
  browsers enforce HTTPS regardless.
- Redirect rules collapse `http://` and `www` onto the canonical origin,
  preserving path and query.
- **Do not redirect `*.pages.dev`.** It is tempting, to stop preview URLs being
  indexed, but it makes preview deployments useless — which is what they are
  for. Absolute canonicals on every page are what handles the duplication.
- Email Routing forwards `contact@`, `support@` and `privacy@` to the project
  mailbox. Receiving works immediately; **sending** from the domain needs a
  separate provider and is not set up.

**Turn off Email Obfuscation and Rocket Loader.** Obfuscation rewrites any
address in your HTML into `[email protected]` on every page, which looks
exactly like a template bug and is not one.

---

## 14. Analytics

Cloudflare Web Analytics, with **Real User Measurements enabled for the
hostname** so Cloudflare injects the beacon at the edge. The repository ships
no beacon token, and `ANALYTICS_BEACON_TOKEN` must stay empty — a token there
would add a second beacon and double-count every pageview.

Three traps, all of them silent, all of them hit:

1. **A site record created without a hostname does not recognise its own
   token.** Every collection POST answers 404, and because a 404 carries no
   `Access-Control-Allow-Origin` header the browser reports it as a CORS
   error. The beacon sits in the HTML looking perfectly correct and records
   nothing.
2. **`site_tag` and `site_token` sit side by side in the API and look
   identical.** The beacon needs `site_token`.
3. **Edge injection only fires for browser-shaped requests.** A bare `curl`
   sees no beacon and looks broken.

So verify it the only way that means anything — drive a real browser, wait for
the POST to `/cdn-cgi/rum`, and check for a **204**:

```sh
npm run check:analytics
```

Not in CI: it tests the deployed site, not the build.

---

## 15. Search Console and indexing

Verify ownership with the HTML file method (drop the file in `public/`), then
submit the sitemap by its **full URL**.

If Search Console reports "Sitemap could not be read", check the response
`Content-Type` — it must be XML, which is set in `public/_headers`. Resubmitting
does not help; the header does. Use URL Inspection on a single page to confirm
"Crawl allowed: Yes", "Page fetch: Successful", "Indexing allowed: Yes" before
concluding anything is wrong.

### Bing Webmaster Tools

Worth doing for one reason: its **AI Performance report** is the only
first-party telemetry anyone publishes on whether LLMs cite your pages. Google
offers no equivalent. Bing also feeds ChatGPT's search, so being indexed there
matters more than Bing's own share of search suggests.

**Skip the "import from Google Search Console" path.** It routinely returns
nothing — it does not reliably see URL-prefix properties, and it silently finds
nothing at all if the Google account signed in to Bing is not the one that owns
the property. Verify manually instead.

Of the three manual methods, **the CNAME is the one to use**: it is live in
seconds, needs no deploy, and puts no verification token in the repository.

```sh
# Bing gives a 32-hex code. Add it as a DNS-only CNAME — a proxied record
# resolves to Cloudflare's IPs and the check fails.
curl -X POST -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -d '{"type":"CNAME","name":"<code>","content":"verify.bing.com","proxied":false,"ttl":300}'
```

Then submit `https://findtool.dev/sitemap.xml` there as well. Expect the AI
report to stay empty for weeks — it needs crawl data first, and Bing indexes
new sites more slowly than Google.

### IndexNow

IndexNow pings Bing and Yandex when URLs change; **Google does not support it**
and has said so repeatedly. The key is a public file at `/<key>.txt`; the
script reads the origin from `site.config.mjs`. Cloudflare's **Crawler Hints**
(Caching → Configuration) does the same pinging automatically on every deploy
and is one toggle.

---

## 16. The one piece of server-side code

Exactly one route is not static: `/tools/what-is-my-ip`.

The reason is the point of the tool. A client-side version would have to ask a
third-party API for the visitor's address — handing that address to someone
else in order to be told what Cloudflare already put in the request.

**The pattern, which is the reusable part:** build the page statically like
every other tool, and put a Pages Function on the same route that fetches that
built HTML with `next()` and streams values into it with `HTMLRewriter`.

```js
export async function onRequest({ request, next }) {
  const asset = await next(/* conditional headers stripped */);
  return new HTMLRewriter()
    .on('[data-ip]', { element(el) { el.setInnerContent(values[el.getAttribute('data-ip')]); } })
    .transform(new Response(asset.body, { status: asset.status, headers }));
}
```

Keeping the page static is what makes this cheap rather than a second
architecture: the layout, prose, FAQ, structured data, sitemap entry, build
verification and browser audit all keep working untouched.

Rules that follow, each load-bearing:

- **`Cache-Control: no-store`,** with `ETag` and `Last-Modified` deleted and
  conditional request headers stripped before fetching the asset. A cached
  copy of this page is somebody else's IP address.
- **Every placeholder needs an honest static fallback**, because `dist/` is
  what local dev and the audit serve. A visible note explains the unfilled
  state, and the function hides it.
- **`setInnerContent` escapes by default** — never pass `{ html: true }`
  anything from a request.
- **Catch everything** and fall back to the untransformed page. The route is
  indexed; a 500 is the worst outcome.
- **The page does not claim local processing.** `serverProcessing: true`, and
  a `privacyNoteOverride` field replaces the standard claim with wording
  written for a server-rendered route. The build fails if a server-processing
  tool tries to use the normal note.
- **Pin any duplicated logic with a test.** A function cannot import from
  `src/lib`, so reverse-DNS formatting exists twice; a test runs both against
  the same addresses.

---

## 17. Changing the catalogue later

**Reordering.** `order` within a category is for reading order — the tool
people come for first, and pairs that belong together (encode next to decode,
the two IP tools next to each other). Alphabetical is the fallback and is what
someone scanning a long list expects, so use `order` sparingly.

**Merging or removing a tool.** A live tool has been indexed and possibly
linked, so deleting the entry is not enough:

1. Move the content, keywords and aliases into whichever tool absorbs it.
2. Move the FAQs, keeping the better set.
3. Delete the registry entry and the component file.
4. **Add a 301 to `public/_redirects`.** This passes the old page's ranking to
   the new one; a 404 discards it. Never remove a line from that file.
5. Fix `related` arrays that referenced the old slug.
6. Confirm the sitemap no longer lists the retired URL — a redirect in a
   sitemap is a wasted crawl.

Worked example: `/tools/current-unix-timestamp` merged into
`/tools/unix-timestamp-converter`, which now opens with the live epoch clock.

---

## 18. Launch

Write the copy honestly and let the engineering be the story: what the site
refuses to do, what it measures, what it got wrong. `docs/launch-kit.md` holds
Hacker News and Reddit copy; `docs/launch-post-devto.md` is a longer write-up.

Post as yourself. An account that only ever posts its own project is spam, and
the communities worth reaching can tell.

Measured at launch: homepage **6.2 KB** over the wire, LCP **650–810 ms**
under Slow 4G with 4× CPU throttling, CLS 0.001, zero accessibility
violations, 350 XSS payloads blocked, zero npm vulnerabilities.

---

## 19. Operating it

**After any deploy**

```sh
npm run build && npm run verify     # before pushing
npm run check:analytics             # after it is live
```

**Adding a tool** — [`docs/adding-a-tool.md`](adding-a-tool.md).

**Recurring checks**

- Search Console coverage, monthly. Watch for "Duplicate, Google chose
  different canonical" on any `pages.dev` URL.
- `npm audit` with dependency updates.
- Cloudflare Web Analytics for traffic, and `npm run check:analytics` if the
  numbers look wrong rather than assuming the traffic is.

**Deliberately not done, and why**

- **No ads.** Slots are designed and disabled. Enabling AdSense requires
  widening `script-src`, `frame-src` and `img-src` in `public/_headers`, and
  an explicit decision.
- **Offline service worker** — designed, not built.
- **Sending email from the domain** — receiving only.

---

## 20. Rules that were never broken

1. No secret, token, password or private account detail in the repository.
2. No personal name or personal email published on the site.
3. No false identity information given to any registrar, host or provider.
4. Nothing paid enabled without stating the feature, the reason, the exact
   price and the free alternative first — and getting a yes.
5. No ads placed and no AdSense application submitted.
6. Browser automation only ever in a throwaway profile, never a real one.
7. A privacy claim appears only where it is literally true, and one automated
   check exists for each claim that can be checked.
