# FindTool

Fast, private developer tools that run entirely in the browser.
Production: **https://findtool.dev**

Utilities for JSON, encoding, hashing, dates, text and web development.
No accounts, no uploads, no backend.

---

## Contents

- [How this was built](docs/runbook.md) — the full project runbook
- [Principles](#principles)
- [Architecture](#architecture)
- [Local development](#local-development)
- [Adding a new tool](#adding-a-new-tool)
- [Tool metadata](#tool-metadata)
- [Categories](#categories)
- [SEO behaviour](#seo-behaviour)
- [Analytics](#analytics)
- [Environment variables](#environment-variables)
- [Deployment](#deployment)
- [Cloudflare configuration](#cloudflare-configuration)
- [Testing](#testing)
- [Advertising](#advertising)
- [Security](#security)

---

## Principles

These are load-bearing. Changing one changes what the site is.

1. **Everything runs client-side.** No tool sends user input anywhere. This is
   architectural, not a policy — there is no server to send it to. The privacy
   claim on each page depends on it staying true, and the browser audit fails
   the build on any outbound request.

   One documented exception: `/tools/what-is-my-ip` fetches the address family
   the visitor did *not* arrive on, which cannot come from our own hostnames.
   See [Dual-stack lookup](#dual-stack-lookup). It is scoped to that page and
   two hostnames; everything else still sends nothing.
2. **Static first.** The whole site is pre-rendered HTML on a CDN. No SSR, no
   runtime, no cold starts.
3. **Minimal JavaScript.** No UI framework. Each tool ships only its own small
   script plus a ~2 KB shared toolkit.
4. **The registry is the source of truth.** Routing, navigation, search,
   sitemap and metadata are all derived from one array. Nothing is hand-wired.
5. **The tool is the page.** Explanatory content supports the tool; it never
   pushes it below the fold.

## Architecture

```
src/
  consts.ts              Site config, limits, ad config. No secrets.
  types.ts               Tool / Category / Crumb types.
  data/
    tools.ts             THE REGISTRY — one entry per tool.
    categories.ts        The 7 categories.
    faqs/                Per-tool FAQ prose, one module per category.
  lib/
    toolkit.ts           Shared browser helpers (copy, download, upload,
                         status, size guards, analytics). Used by every tool.
    search.ts            Scoring + highlighting for the search dialog.
    json.ts, base64.ts,  Pure, DOM-free logic per topic. Unit-tested.
    cron.ts, color.ts …
  workers/
    regex-worker.ts      Runs user regexes with a hard timeout.
  components/            Header, Footer, ToolCard, SearchDialog, AdSlot …
  layouts/
    BaseLayout.astro     <head>, canonical, OG, theme bootstrap, chrome.
                         Dark is the default; the bootstrap only removes it.
    ToolLayout.astro     The standard tool page + structured data.
  tools/                 One .astro per tool.
functions/
  tools/
    what-is-my-ip.js     The ONLY server-side code. A Pages Function that
                         rewrites values into the statically built page.
  pages/
    index.astro          Homepage
    tools/index.astro    All tools, filterable
    tools/[slug].astro   THE tool route — resolves component from registry
    [category].astro     /json, /encoding, /text …
    about|contact|privacy|terms.astro
    404.astro
    sitemap.xml.ts       Generated from the registry
    robots.txt.ts
    search.json.ts       Search index, fetched lazily by the dialog
scripts/
  lib/serve-dist.mjs     Static server mirroring Cloudflare Pages URL rules,
                         shared by the three browser-driven scripts.
  generate-assets.mjs    Favicons, PWA icons, OG image (run manually)
  verify-build.mjs       Static QA gate — links, metadata, schema, secrets
  audit-site.mjs         Browser audit — a11y, JS errors, network, tools
  cross-browser.mjs      Every tool in Chromium, Firefox and WebKit
  security-check.mjs     XSS payloads, CSP, ReDoS, input limits
  edge-cases.mjs         Empty / malformed / oversized input, keyboard
  measure-perf.mjs       Core Web Vitals against a budget
  generate-og.mjs        Per-tool social cards (runs as part of build)
  submit-indexnow.mjs    Ping Bing/Yandex when URLs change
  check-analytics.mjs    Prove analytics records, against live production
  styles/global.css      Design tokens and the bc-* class vocabulary,
                         including .bc-tool-grid (equal-height card rows).
public/
  _headers               Security headers and cache policy.
  _redirects             301s for URLs that were live and moved. Append only.
  <indexnow-key>.txt     IndexNow ownership proof.
tests/                   Vitest unit tests. Beyond one per lib module:
  registry.test.ts       Registry invariants — slugs, ordering, related links,
                         privacy claims, FAQs, retired URLs.
  seo.test.ts            Sitemap, robots.txt, canonicals, OG tags and
                         structured data, checked against dist/.
  analytics.test.ts      The beacon must stay out of the repo (see Analytics).
  edge-ip.test.ts        Pins the edge function against src/lib/ip.ts.
docs/adding-a-tool.md    The full contract for a new tool
docs/runbook.md          How this project was built, end to end
```

**Why no UI framework.** Tools are independent islands of plain DOM code. React
would add ~45 KB gzipped to every page to manage a handful of inputs. The
`mount()` helper in `toolkit.ts` scopes a tool's script to its own root
element, which is all the isolation these need.

<a id="dual-stack-lookup"></a>
**Why one page reaches the network.** A TCP connection carries exactly one
address family, so the edge can report the address a visitor arrived on and no
other. Showing both needs a second connection over the other family, which
needs a hostname resolving to that family alone — and that cannot be one of
ours. Tested in both directions on this zone: a proxied A-only record gets AAAA
added and a proxied AAAA-only record gets A added, because Cloudflare answers
every name it fronts from anycast addresses carrying both. The only control on
the Free plan is a zone-wide IPv6 switch with no IPv4 equivalent; per-hostname
control is Enterprise.

So `/tools/what-is-my-ip` fetches `ipv4.icanhazip.com` or `ipv6.icanhazip.com`.
icanhazip was chosen over ipify and the rest because Cloudflare has run it
since 2021 and already terminates every request to findtool.dev — it discloses
the address to a party that has already seen it rather than a new one. The
alternative was running an origin, rejected as not worth a server on a site
whose premise is not having one.

The guarantee is kept narrow rather than relaxed: `scripts/audit-site.mjs`
allows those two hostnames on that one path only, so another tool contacting
them, or that page contacting anything else, still fails the build.

**Why there is one Pages Function.** `/tools/what-is-my-ip` is the single route
whose content depends on who is asking. A client-side version would have to ask
a third-party API for the visitor's address — handing that address to someone
else in order to be told what Cloudflare already put in the request. So the
page is built statically like every other tool, and
`functions/tools/what-is-my-ip.js` intercepts the route, fetches that built
HTML with `next()`, and streams the values in with `HTMLRewriter`.

Keeping the page static is what makes this cheap rather than a second
architecture: the layout, prose, FAQ, structured data, sitemap entry, build
verification and browser audit all work unchanged, and the function only fills
placeholders. Three consequences are load-bearing:

- **The response is `no-store`,** with `ETag` and `Last-Modified` stripped, and
  conditional request headers removed before fetching the asset. A cached copy
  of this page is somebody else's IP address.
- **Only that path invokes a worker.** Pages routes requests to functions by
  path, so every other page is still served as a pure static asset.
- **The placeholder keys are a contract** between the `.astro` file and the
  `.js` file, and `npm run verify` fails if either side renames one. Reverse
  DNS is implemented in both (a Function cannot import from `src/lib`);
  `tests/edge-ip.test.ts` runs the two against the same addresses so they
  cannot drift.

The `functions/` directory must be checked out in the deploy job —
`wrangler pages deploy dist` compiles it from the repo root, not from `dist/`.

**Why a hand-rolled sitemap.** `@astrojs/sitemap` cannot express per-tool
`lastmod` from registry metadata, and it emits trailing-slash URLs that
disagree with our canonical form. `src/pages/sitemap.xml.ts` is short, has no
dependencies, and stays correct at 1,000 tools.

## Local development

**Requires Node 22.12 or newer.** Astro 7 builds with rolldown, which ships a
native binary and refuses to start on older versions.

```bash
npm install
npm run dev          # http://localhost:4321
```

> **If the build fails with "Cannot find native binding":** npm resolved the
> platform-specific rolldown package against a different Node version
> ([npm/cli#4828](https://github.com/npm/cli/issues/4828)). Delete
> `node_modules` and `package-lock.json` and reinstall under Node 22. Switching
> Node versions without reinstalling is the usual cause.

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | Dev server with HMR                                  |
| `npm run build`    | Production build into `dist/`                        |
| `npm run preview`  | Serve `dist/` locally                                |
| `npm test`         | Vitest unit tests                                    |
| `npm run check`    | `astro check` — TypeScript + template diagnostics     |
| `npm run verify`   | Post-build QA (links, canonicals, sitemap, metadata) |
| `npm run audit`    | Real-browser audit of every page (a11y, JS, tools)   |
| `npm run audit:shots` | The same, plus screenshots in `.audit-screenshots/` |
| `npm run cross-browser` | Every tool in Chromium, Firefox and WebKit      |
| `npm run security` | XSS payloads, CSP checks, ReDoS and input limits     |
| `npm run edge`     | Empty / malformed / 2.1 MB input, plus keyboard use  |
| `npm run perf`     | Core Web Vitals against a budget, throttled          |
| `npm run assets`   | Regenerate favicons / PWA icons / OG image           |
| `npm run check:prod` | Smoke-test the live site (beacon blocked)            |
| `npm run check:analytics` | Prove the beacon records, against production  |
| `npm run ci`       | Everything above in order — what CI runs              |

No environment variables are needed for local development. Every tool works
offline once the page has loaded.

## Adding a new tool

Full contract: **[`docs/adding-a-tool.md`](docs/adding-a-tool.md)**.
Reference implementation: **`src/tools/JsonFormatter.astro`**.

Three steps:

1. **Logic** → `src/lib/<topic>.ts`, pure and DOM-free, plus
   `tests/<topic>.test.ts`.
2. **UI** → `src/tools/<Component>.astro`, wrapping `<ToolLayout>` and using
   the `bc-*` class vocabulary.
3. **Registry** → one entry in `TOOLS` in `src/data/tools.ts`.

Everything else is automatic: the route, nav, search index, category page,
related-tool blocks, breadcrumbs, structured data and sitemap entry.

`npm run verify` fails the build if a registry entry points at a component
that does not exist, if a tool page renders without its interface, or if a
title or description is duplicated.

## Tool metadata

```ts
{
  slug: 'json-formatter',        // URL: /tools/json-formatter
  name: 'JSON Formatter',        // H1 and card title
  category: 'json',              // must match a Category id
  description: '…',              // one sentence: cards, search, page subtitle
  seoTitle: '…',                 // <title>, aim ≤60 chars, must be unique
  seoDescription: '…',           // <meta description>, 140–160, must be unique
  keywords: ['…'],               // topic terms, used for search relevance
  aliases: ['b64', 'guid', …],   // what users actually type — drives search
  related: ['…'],                // explicit slugs, most relevant first
  component: 'JsonFormatter',    // → src/tools/JsonFormatter.astro
  icon: 'braces',                // must exist in IconName
  serverProcessing: false,       // true ⇒ privacy note is NOT shown
  privacyNote: '…',              // optional extra privacy wording
  popular: true,                 // optional: surfaces on the homepage
  order: 1,                      // optional: position within its category
  addedAt: '2026-09-24',         // drives sitemap lastmod + "recently added"
}
```

**FAQs are not stored here.** They live in `src/data/faqs/<category>.ts` and
are looked up by slug, so the registry stays metadata rather than prose. See
`src/data/faqs/index.ts` for the rules an entry has to meet — in short, only
questions people actually ask, and every answer has to carry a concrete fact.

**`related` is metadata-driven.** `relatedTools()` takes the explicit slugs in
order, then tops up from the same category so a block is never short. Adding a
tool automatically makes it available as a related tool elsewhere.

**`serverProcessing` controls a factual claim.** When `false`, the page states
that data is processed locally. Only set it to `false` if that is literally
true — no fetch, no beacon, no third-party script touching the input.

## Categories

Seven, defined in `src/data/categories.ts`, mounted at the root for short URLs:

| Slug          | Name                 |
| ------------- | -------------------- |
| `/json`       | JSON & Data          |
| `/encoding`   | Encoding & Decoding  |
| `/generators` | Generators           |
| `/security`   | Hashing & Security   |
| `/time`       | Date & Time          |
| `/text`       | Text Tools           |
| `/web`        | Web & Dev            |

Static routes (`/about`, `/contact`, …) take precedence over the dynamic
`[category].astro` route, and `getStaticPaths` only emits known slugs, so
there is no collision risk.

If this list ever exceeds ~10, add sub-categories rather than more top-level
paths.

## SEO behaviour

- **Canonical URLs** are absolute, on `https://findtool.dev`, with no
  trailing slash. `astro.config.mjs` sets `trailingSlash: 'never'`.
- **One `<h1>` per page**, enforced by `npm run verify`.
- **Unique title and description per page**, enforced by `npm run verify`.
- **Open Graph + Twitter cards** on every page, with a generated `/og.png`.
- **Structured data**: `WebSite` + `Organization` on the homepage,
  `BreadcrumbList` + `SoftwareApplication` on every tool page, `FAQPage`
  where a tool defines `faq`, `ItemList` on category and index pages.
- **Content is server-rendered.** Headings, descriptions and all explainer
  prose exist in the HTML without JavaScript. Only interactivity needs JS.
- **`sitemap.xml`** is generated from the registry, with per-tool `lastmod`.
- **`robots.txt`** allows everything and points at the sitemap.

Redirects to the canonical origin (`http→https`, `www→apex`,
`*.pages.dev→apex`) are Cloudflare rules, not application code — see below.

## Analytics

**Cloudflare Web Analytics.** Cookie-free, fingerprint-free, no consent banner
required. Enabled by setting `PUBLIC_CF_BEACON_TOKEN`; with it unset, no
analytics script is emitted at all, so local and preview traffic never
pollutes production numbers.

**Custom events** go through `track()` in `src/lib/toolkit.ts`:

`tool_used` · `copy_clicked` · `download_clicked` · `example_loaded` ·
`search_used` · `related_tool_clicked` · `theme_changed`

> **Hard rule:** the payload is the event name and the tool slug from the URL.
> `track()` never reads an input field, so no call site can leak user content
> even by mistake. `tool_used` fires at most once per page view.

Events are only sent when `PUBLIC_EVENTS_ENDPOINT` is set. Unset (the launch
state), `track()` dispatches a DOM event and does nothing else.

## Environment variables

See `.env.example`. None are required to run or build the site.

| Variable                 | Where            | Secret? | Purpose                              |
| ------------------------ | ---------------- | ------- | ------------------------------------ |
| `CLOUDFLARE_API_TOKEN`   | GitHub secret    | **Yes** | Deploy to Pages                      |
| `CLOUDFLARE_ACCOUNT_ID`  | GitHub secret    | No      | Deploy target                        |
| `PUBLIC_CF_BEACON_TOKEN` | Build-time       | No      | Web Analytics beacon (public id)     |
| `PUBLIC_EVENTS_ENDPOINT` | Build-time       | No      | Optional anonymous event collector   |
| `INDEXNOW_KEY`           | Build-time       | No      | IndexNow submission key              |

**Never commit secrets.** `.env*` is gitignored, and `npm run verify` scans
build output for token-shaped strings and fails if it finds any.

## Deployment

```
push to main → GitHub Actions → check + test + build + verify → wrangler pages deploy
```

`.github/workflows/deploy.yml` is the only thing holding deploy credentials.
Pull requests get their own preview URL, commented on the PR.

Deployment is intentionally *not* wired through Cloudflare's dashboard Git
integration: keeping it in Actions means the build logs, the test gate and the
verification gate all live with the code, and a red test blocks a deploy.

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Cloudflare configuration

- **Pages project**: `findtool`, direct-upload mode, deployed by Wrangler.
- **Custom domain**: `findtool.dev` (apex) plus `www.findtool.dev`.
- **DNS**: managed in the `findtool.dev` zone. Apex and `www` are proxied
  CNAMEs to the Pages project.
- **SSL/TLS**: Full (strict). Always Use HTTPS on. `.dev` is HSTS-preloaded,
  so browsers enforce HTTPS regardless.
- **Redirect rules** collapse the non-canonical hosts onto
  `https://findtool.dev`, preserving path and query. Verified in production:
  - `http://findtool.dev` → `https://findtool.dev` (301)
  - `http(s)://www.findtool.dev` → `https://findtool.dev` (301)
  - **`*.pages.dev` is NOT redirected.** `findtool.pages.dev` serves the whole
    site, and so does every preview deployment. Redirecting it would make
    preview URLs useless, which is what they are for. Duplicate content is
    held off by the absolute `<link rel="canonical">` on every page, which
    always names `findtool.dev` — see GitHub issue #6.
- **Email Routing**: `contact@`, `support@` and `privacy@` forward to the
  project mailbox. Destination addresses are never shown on the site.
- **Caching**: driven by `public/_headers` — hashed assets immutable for a
  year, HTML revalidated on every request.

## Testing

Five layers, all gating CI:

```bash
npm test          # unit tests, registry invariants, SEO surfaces
npm run check     # TypeScript + Astro template diagnostics
npm run verify    # static QA of dist/ — run after npm run build
npm run audit     # real browser over every page
npm run perf      # Core Web Vitals budget
```

Plus two that are deliberately **not** in CI, because they test the deployed
site rather than the build and need the public internet:

```bash
npm run check:prod        # sitemap URLs, redirects, headers, card sizing,
                          # the edge-rendered IP page and its one allowed
                          # outbound request — all against the live site
npm run check:analytics   # drives a browser at production, waits for the
                          # beacon's POST and checks it returns 204
```

**`check:prod` blocks the analytics beacon; `check:analytics` does not.** That
split matters on a young site: driving production in a browser records a
pageview per navigation, and at ~60 navigations a run it briefly accounted for
54% of all recorded visits, which made the real numbers unreadable. Proving
collection works is the one job worth two pageviews.

The guiding rule, learned from an analytics beacon that sat in the HTML
recording nothing for weeks: **presence proves nothing, only a success
response does.** Any check that asserts a thing exists should be asked
whether it can instead assert the thing worked.

### Browser audit (`scripts/audit-site.mjs`)

Serves `dist/` with the same URL semantics Cloudflare Pages uses, then drives
a headless Chromium — Playwright's own bundled browser with a throwaway
profile, never an installed one — over every page. It fails on:

- any JavaScript error or failed request
- **any outbound request to a non-local origin**, which would break the
  privacy guarantee the tool pages make
- axe-core violations (WCAG 2.2 AA, plus best-practice rules)
- horizontal overflow at a 390px viewport
- tap targets under 24px, excluding cases WCAG exempts
- any tool that produces no output when exercised

It clicks each tool's Example button, triggers the primary action, and checks
that something appeared. This is what caught a muted-text contrast ratio of
4.40:1 against our own surface colour — under the 4.5:1 AA threshold, and
invisible to static analysis.

### Performance budget (`scripts/measure-perf.mjs`)

Measures LCP, CLS and FCP under Slow 4G with a 4× CPU slowdown, serving
gzipped so the transfer figure reflects what a CDN actually sends. Budgets:
LCP < 2500ms, CLS < 0.1, FCP < 1800ms, transfer < 120 KB.

At the time of writing the worst page measures roughly 780ms LCP, CLS 0.001
and 93 KB — comfortably inside every budget. Run `npm run perf` for current
figures rather than trusting this paragraph; it is the kind of number that
rots.

### Static build verification (`scripts/verify-build.mjs`)

Fails the build on:

- a missing page, or a registry entry pointing at a non-existent component
- a broken internal link anywhere in the output
- a missing or mismatched canonical URL
- a duplicate `<title>` or meta description
- zero or multiple `<h1>` on a page
- a tool page that rendered without its interface
- a sitemap that disagrees with what was generated
- missing `SoftwareApplication` / `BreadcrumbList` structured data
- a token-shaped string appearing in build output

### Cross-browser suite (`scripts/cross-browser.mjs`)

Drives every tool through Chromium, Firefox and WebKit, plus the search
dialog and theme toggle. WebKit is Safari's engine and the usual source of
divergence — clipboard permissions, `<dialog>`, `Intl.Segmenter` and regex
lookbehind all shipped there later than elsewhere. Run a single engine with
`node scripts/cross-browser.mjs --engine=webkit`.

### Security check (`scripts/security-check.mjs`)

Static review says the code looks safe; this tries to break it. It feeds
seven XSS payloads to every tool — raw tags, attribute breakouts,
`javascript:` URLs, SVG handlers, and HTML-entity-encoded forms that a
*decoder* tool might turn back into live markup, which is the realistic risk
on a site full of decoders — then asserts nothing executed and nothing became
live DOM. It also greps for `eval`, `new Function`, `document.write` and
string-bodied timers, checks the CSP has no wildcard and no `unsafe-eval`,
confirms `(a+)+$` against a pathological input leaves the page responsive,
and confirms a 2.2 MB paste is refused with a message rather than freezing.

Current result: 350 injection attempts, none executed.

### Edge cases and keyboard (`scripts/edge-cases.mjs`)

Drives every tool through the inputs people hit by accident: nothing at all,
something malformed, and 2.1 MB — just over the input limit. The bar is not
that a tool succeeds; refusing bad input *is* success. It is that a tool
always either produces output or explains in its status area why it cannot,
and never fails silently, throws or hangs. Silent failure is the specific
defect being hunted, because a tool that produces nothing and says nothing
looks broken even when the input was at fault, and no screenshot reveals it.

Also checks the skip link is the first Tab stop and becomes visible, that
every interactive element has a focus indicator, and that Ctrl-K opens search.

Current result: every tool that takes text input passes; 35 refuse the
oversized input by name and the rest process it fast enough that refusing
would be wrong.

### Manual QA before a release

The automated layers are thorough but headless. Before a significant release
it is still worth a human pass: keyboard-only navigation end to end, a
real-device check on iOS Safari and Android Chrome, and for a sample of tools
— empty input, deliberately invalid input, and a multi-megabyte paste.

## Advertising

Ads are **off**. `src/components/AdSlot.astro` renders nothing while
`ADS.enabled` is `false`, so there are no placeholders and no layout shift.

Three positions already exist in the page structure — below the header,
after the tool, and further down the explainer content. Turning ads on is a
config change in `src/consts.ts`, not a redesign.

Constraints encoded in the component: never inside or above the tool
interface; always labelled "Advertisement"; always visually separated from
controls; fixed reserved height to avoid CLS.

Enabling AdSense also requires widening the CSP in `public/_headers` to allow
`googlesyndication.com` and `doubleclick.net`, and updating
`src/pages/privacy.astro` **before** any ad code ships.

## Security

- **No secrets in the repo.** `.env*` gitignored; build output scanned in CI.
- **No `eval`, no `new Function`, no `innerHTML` with user content.** Tools
  use `textContent` or the `escapeHtml()` helper. Tree and diff views build
  DOM nodes rather than markup strings.
- **Regex denial-of-service is contained.** User patterns run in a Web Worker
  that is terminated after `LIMITS.regexTimeoutMs`, so catastrophic
  backtracking cannot freeze the tab.
- **Input size limits** (`LIMITS` in `src/consts.ts`) are enforced by
  `guardSize()` before expensive work, and by a file-size check on upload.
- **Strict CSP** in `public/_headers`: `object-src 'none'`,
  `frame-ancestors 'none'`, `form-action 'none'`, no third-party script
  origins beyond the Cloudflare Analytics beacon.
- **Cryptography uses the platform.** Hashes and HMAC use Web Crypto;
  randomness uses `crypto.getRandomValues()`, never `Math.random()`.
  MD5 is hand-implemented because Web Crypto deliberately omits it, and is
  labelled throughout as unsuitable for security use.
- **Dependencies are minimal** — Astro, Tailwind and `js-yaml` in production.
  Run `npm audit` before releases.

---

Licensed for personal and commercial use of the tools themselves. The
FindTool name, logo and written page content are not licensed for reuse.
