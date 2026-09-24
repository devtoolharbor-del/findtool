# Adding a tool to FindTool

This is the contract every tool follows. It exists so that tool #500 looks,
behaves and performs like tool #1, and so a new tool needs no changes to
routing, navigation, search, sitemap or metadata.

Adding a tool is three steps:

1. Write the pure logic in `src/lib/<topic>.ts`.
2. Write the UI in `src/tools/<Component>.astro`.
3. Add one entry to `TOOLS` in `src/data/tools.ts`.

Routing, nav, search index, category page, related tools, breadcrumbs,
structured data and the sitemap all update themselves.

---

## 1. Logic lives in `src/lib/`

All real work goes in a plain TypeScript module with **no DOM access**, so it
can be unit-tested in Node:

```ts
// src/lib/base64.ts
export function encodeBase64(text: string, urlSafe = false): string { … }
```

Group by topic, not by tool — `src/lib/base64.ts` backs both the encoder and
the decoder. Add tests in `tests/<topic>.test.ts`.

Throw `Error` with a message written for a user, not a developer:

```ts
throw new Error('This is not valid Base64 — the length must be a multiple of 4.');
```

## 2. UI lives in `src/tools/<Component>.astro`

Use `src/tools/JsonFormatter.astro` as the reference implementation.

### Required structure

```astro
---
import type { Tool } from '~/types';
import ToolLayout from '~/layouts/ToolLayout.astro';

interface Props { tool: Tool }
const { tool } = Astro.props;
---

<ToolLayout tool={tool}>
  <div data-tool="<the-tool-slug>" class="space-y-4">
    … interface …
    <div data-status role="status" aria-live="polite" hidden></div>
  </div>

  <Fragment slot="content">
    … crawlable explainer prose …
  </Fragment>
</ToolLayout>

<script>
  import { mount, q, on, … } from '~/lib/toolkit';
  mount('<the-tool-slug>', (root) => { … });
</script>
```

- The wrapper's `data-tool` value **must equal the registry slug**.
- `mount()` scopes all queries to that root, so two tools can never collide.
- Never use `innerHTML` with user input. Use `textContent`, or
  `escapeHtml()` from the toolkit.

### Required class vocabulary

Use these instead of ad-hoc Tailwind stacks — they carry the light/dark
palette and keep 50 pages consistent. Defined in `src/styles/global.css`.

| Purpose        | Class                                                        |
| -------------- | ------------------------------------------------------------ |
| Buttons        | `bc-btn` + `bc-btn-primary` / `bc-btn-secondary` / `bc-btn-ghost`, `bc-btn-sm` |
| Text input     | `bc-input`, `bc-textarea`, `bc-select`                        |
| Field label    | `bc-label`                                                    |
| Checkbox       | `bc-checkbox` inside a `bc-check-label`                       |
| Panels / cards | `bc-panel`, `bc-card`                                         |
| Result area    | `bc-output`                                                   |
| Stat chip      | `bc-stat` › `bc-stat-value` + `bc-stat-label`                 |
| Button row     | `bc-toolbar`                                                  |
| Prose          | `bc-prose` (applied by the layout to the `content` slot)      |

Never hard-code a colour. Use the semantic tokens: `text-ink`, `text-muted`,
`text-ink-soft`, `bg-surface`, `bg-surface-2`, `bg-canvas`, `border-line`,
`border-line-strong`, `text-accent`. They flip automatically in dark mode.

### Required data attributes

The toolkit wires these for free via `wireStandardActions(root)`:

| Attribute             | Meaning                                                    |
| --------------------- | ---------------------------------------------------------- |
| `data-tool`           | Root wrapper; value is the slug                            |
| `data-status`         | Where errors and success messages render                   |
| `data-primary-input`  | The main input field                                       |
| `data-output`         | The result field, used by copy/download                    |
| `data-clear-target`   | Fields emptied by the Clear button                         |
| `data-clear`          | The Clear button                                           |
| `data-example="…"`    | Example button; the attribute value is the sample input     |
| `data-load-example`   | Example button for a tool with **two** inputs, wired by hand — the shared handler only fills `[data-primary-input]`. See `TextDiff.astro`. |
| `data-copy="<sel>"`   | Copy button; the selector points at what to copy            |
| `data-upload`         | Upload button, paired with `data-file-input`                |
| `data-file-input`     | Hidden `<input type="file">`                               |
| `data-swap`           | Swap input/output button (converters)                      |

### Required behaviours

Every tool must:

- **Validate and explain.** Never fail silently and never show a raw stack
  trace. Use `setStatus(root, msg, 'error' | 'warn' | 'ok')`.
- **Handle empty input** by clearing the output, not by showing an error.
- **Guard large input** with `guardSize(text)` before expensive work.
- **Offer Copy** on every result, via `copyText()` or `data-copy`.
- **Offer an Example** that demonstrates something real, not `"foo"`.
- **Offer Clear.**
- **Call `markUsed()`** the first time it produces real output.
- **Be usable by keyboard only**, with labels on every control. A `<label for>`
  or `aria-label` is required — placeholder text is not a label.
- **Work with JavaScript disabled** to the extent that the heading, the
  description and all explainer prose are in the server-rendered HTML.

Offer Download and Upload where a user plausibly has the data in a file
(JSON, CSV, YAML, XML, hashing, text tools). Skip them where they make no
sense (a timestamp converter).

## 3. Explainer content (the `content` slot)

This is what makes the page rank and what makes it useful to someone who
landed from a search. Aim for **250–450 words** of genuinely specific prose.

Required shape:

```
<h2>What this tool does</h2>       — 2 short paragraphs
<h2>Common uses</h2>               — 3–5 concrete bullets
<h2>A short example</h2>           — real input → real output in <pre><code>
<h2>[A specific technical section]</h2>  — the gotcha that matters for THIS tool
<h2>Worth knowing</h2>             — the caveat an expert would mention
```

Hard rules:

- **No filler.** No "In today's fast-paced development environment".
- **No duplication across tools.** The Base64 encoder and decoder pages must
  not share sentences. Write each one for the person who landed on that page.
- **Be specific and correct.** Name real limits, real spec sections, real
  failure modes. If a claim needs a number, use the real number.
- **Never overstate security.** MD5 and SHA-1 are for legacy compatibility
  and corruption checks only, never for passwords or signatures. Decoding a
  JWT is not verifying it.

Add a `faq` array to the registry entry when there are genuine recurring
questions. It renders as crawlable HTML and as `FAQPage` structured data.

## 4. Registry entry

```ts
{
  slug: 'base64-encoder',          // URL: /tools/base64-encoder
  name: 'Base64 Encoder',
  category: 'encoding',            // must be an id from src/data/categories.ts
  description: '…',                // one sentence, used on cards + as subtitle
  seoTitle: '…',                   // <title>, ≤60 chars, unique
  seoDescription: '…',             // <meta description>, 140–160 chars, unique
  keywords: ['…'],                 // topic terms
  aliases: ['…'],                  // synonyms, abbreviations: what users type
  related: ['…'],                  // 4–5 slugs, most relevant first
  component: 'Base64Encoder',      // src/tools/Base64Encoder.astro
  icon: 'binary',                  // must exist in IconName / Icon.astro
  serverProcessing: false,         // true ⇒ the privacy note is NOT shown
  order: 1,                        // optional: position within the category
  addedAt: '2026-09-24',
}
```

`order` controls position within a category. Lower sorts first; anything
without one falls in behind, alphabetically. Use it sparingly — alphabetical
is what someone scanning a long list expects, so reach for `order` only where
that is actively unhelpful, such as a tool people open the category *for*, or
a pair that reads better together.

`aliases` is what makes search feel good — put in what a hurried developer
actually types: `b64`, `epoch`, `guid`, `regexp`, `crontab`, `nbsp`.

## 5. Privacy honesty

`serverProcessing: false` causes the page to state:

> Your data is processed locally in your browser and is not uploaded to
> FindTool servers.

Only set it to `false` if that is **literally true** — no `fetch`, no beacon,
no third-party script touching the input. If a tool ever needs a server, set
it to `true` and the claim disappears automatically.

A server-processing tool may still show a privacy panel, but only through
`privacyNoteOverride`, which replaces the standard claim with wording written
for that tool:

```ts
serverProcessing: true,
privacyNoteOverride:
  'This page is built from the request your browser already made, so nothing is looked up…',
```

`privacyNote` is *appended* to the standard claim, so a tool that never shows
that claim must not use it — the sentence would silently vanish.
`npm run verify` fails on the combination, and separately fails if an override
is declared but does not appear in the built HTML.

## 6. Tools that need the edge

Almost nothing does. Before reaching for a Pages Function, check that the
answer is not already in the browser: `navigator.userAgent`,
`Intl.DateTimeFormat().resolvedOptions()` and `crypto.subtle` cover far more
than people expect, and a tool that calls an API is a tool that leaks its
input.

The one genuine case on this site is `/tools/what-is-my-ip`, where the answer
is the visitor's own IP address — already present in the request, and
obtainable client-side only by sending it to a third party.

If a tool truly needs the edge, **do not build a separate page for it.** Build
the tool as a normal static Astro page and add a Cloudflare Pages Function at
the matching path under `functions/`, which fetches the built page with
`next()` and rewrites values into it with `HTMLRewriter`. Everything that
makes a tool page work — layout, prose, FAQ, structured data, sitemap entry,
the build verifier, the browser audit — then keeps working unchanged.

The rules that follow from that split:

- **Every placeholder needs an honest static fallback**, because the built
  file is what local dev and the audit serve. Add a visible element explaining
  the unfilled state, and hide it from the function.
- **Set `Cache-Control: no-store`** and delete `ETag` and `Last-Modified` from
  the response. Strip conditional headers from the request before calling
  `next()`, or a 304 will hand a visitor the previous visitor's values.
- **Never `setInnerContent(…, { html: true })`** with anything from a request.
  The default escapes; that is the whole reason to use it.
- **Catch everything.** The page is indexed. Falling back to the untransformed
  HTML is always better than a 500.
- **Declare the keys once.** The function's key names must match the page's
  `data-*` placeholders; `verify-build.mjs` checks both directions and fails
  on a rename to either side.
- **Duplicate no logic silently.** A function cannot import from `src/lib`. If
  something has to be written twice, pin the two copies together with a test
  — see `tests/edge-ip.test.ts`.

## 7. Checklist before you call a tool done

- [ ] `npm run build` passes
- [ ] `npx astro check` reports no errors for your files
- [ ] Empty input clears output, shows no error
- [ ] Invalid input shows a specific, useful message
- [ ] Very large input is refused politely, not silently
- [ ] Copy, Clear and Example all work
- [ ] Tab order is sensible and focus is always visible
- [ ] Looks correct in light and dark mode
- [ ] Explainer prose is unique to this tool
- [ ] `tests/<topic>.test.ts` covers the logic, including error cases
