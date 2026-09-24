#!/usr/bin/env node
/**
 * Per-page Open Graph images.
 *
 * A shared preview card means every ByteCabin link pasted into Slack, Discord
 * or a pull request looks identical. Naming the actual tool is the difference
 * between a link someone clicks and one they scroll past.
 *
 * Runs after `astro build` and writes into dist/og/, so the images are never
 * committed — 50 PNGs of build output do not belong in version control, and
 * regenerating them is a second and a half.
 *
 * Text is laid out by hand because SVG has no automatic wrapping: widths are
 * estimated per character class, which is approximate but stable, and the
 * card is designed so a mis-estimate costs whitespace rather than clipping.
 */

import sharp from 'sharp';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_NAME, SITE_DOMAIN } from '../site.config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(DIST, 'og');

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `astro build` first.');
  process.exit(1);
}

const ACCENT = '#0f766e';
const ACCENT_LIGHT = '#2dd4bf';
const INK = '#fafaf9';
const MUTED = '#a8a29e';
const DARK = '#0c0a09';
const SURFACE = '#1c1917';

const FONT = 'Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif';

/** XML-escape text before it goes into the SVG document. */
const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * Rough advance width for a character at 1px font size.
 * Inter is proportional; these three buckets track it closely enough that a
 * line never overshoots its box by more than a few percent.
 */
function charWidth(ch) {
  if ('iljtfrI.,:;\'"|!'.includes(ch)) return 0.3;
  if ('mwMW@'.includes(ch)) return 0.92;
  if (ch === ' ') return 0.28;
  if (ch >= 'A' && ch <= 'Z') return 0.66;
  return 0.55;
}

const textWidth = (text, size) =>
  [...text].reduce((sum, ch) => sum + charWidth(ch), 0) * size;

/** Greedy word wrap to a pixel width, capped at `maxLines`. */
function wrap(text, size, maxWidth, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);

  // Ellipsise if the text did not fit.
  if (lines.length === maxLines) {
    const used = lines.join(' ').length;
    if (used < text.length - 1) {
      let last = lines[maxLines - 1];
      while (last.length > 4 && textWidth(`${last}…`, size) > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last.replace(/[,\s]+$/, '')}…`;
    }
  }
  return lines;
}

const MARK = `
  <g fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5.2 14.4 16 6.2l10.8 8.2"/>
    <path d="M8.6 16.4v9.4h14.8v-9.4"/>
    <path d="M11.8 19.8h8.4"/>
    <path d="M11.8 23h5"/>
  </g>`;

function card({ title, description, badge }) {
  const titleSize = title.length > 26 ? 62 : 74;
  const titleLines = wrap(title, titleSize, 1000, 2);
  const descLines = wrap(description, 30, 980, 3);

  const titleY = 300 - (titleLines.length - 1) * (titleSize * 0.55);
  const descY = titleY + titleSize * 0.35 + 64;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${DARK}"/>
      <stop offset="100%" stop-color="${SURFACE}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="6" fill="${ACCENT_LIGHT}"/>

  <!-- brand lockup -->
  <g transform="translate(96, 84)">
    <rect width="52" height="52" rx="13" fill="${ACCENT}"/>
    <g transform="translate(10, 10)">${MARK}</g>
    <text x="70" y="35" font-family="${FONT}" font-size="30" font-weight="600" fill="${INK}"
      letter-spacing="-0.5">${SITE_NAME}</text>
  </g>

  <!-- category badge -->
  <g transform="translate(96, 180)">
    <rect width="${Math.round(textWidth(badge, 22) + 40)}" height="40" rx="20"
      fill="none" stroke="${ACCENT_LIGHT}" stroke-width="1.5" opacity="0.65"/>
    <text x="20" y="27" font-family="${FONT}" font-size="22" fill="${ACCENT_LIGHT}">${esc(badge)}</text>
  </g>

  <!-- tool name -->
  ${titleLines
    .map(
      (line, i) =>
        `<text x="96" y="${titleY + i * titleSize * 1.1}" font-family="${FONT}" font-size="${titleSize}" font-weight="650" fill="${INK}" letter-spacing="-2">${esc(line)}</text>`,
    )
    .join('\n  ')}

  <!-- description -->
  ${descLines
    .map(
      (line, i) =>
        `<text x="96" y="${descY + i * 42}" font-family="${FONT}" font-size="30" fill="${MUTED}">${esc(line)}</text>`,
    )
    .join('\n  ')}

  <text x="96" y="566" font-family="${FONT}" font-size="26" fill="${MUTED}">
    Runs in your browser · nothing uploaded
  </text>
  <text x="1104" y="566" text-anchor="end" font-family="${FONT}" font-size="26" fill="${ACCENT_LIGHT}">${SITE_DOMAIN}</text>
</svg>`;
}

// ─── Read the registry ───────────────────────────────────────────────────

const toolsSrc = await readFile(join(ROOT, 'src/data/tools.ts'), 'utf8');
const categoriesSrc = await readFile(join(ROOT, 'src/data/categories.ts'), 'utf8');

const categoryNames = new Map();
for (const block of categoriesSrc.split(/\n  \{\n/).slice(1)) {
  const id = block.match(/id: '([a-z]+)'/)?.[1];
  const name = block.match(/name: '([^']+)'/)?.[1];
  if (id && name) categoryNames.set(id, name);
}

const tools = [];
for (const block of toolsSrc.split(/\n  \{\n/).slice(1)) {
  const slug = block.match(/slug: '([a-z0-9-]+)'/)?.[1];
  const name = block.match(/name: '([^']+)'/)?.[1];
  const category = block.match(/category: '([a-z]+)'/)?.[1];
  const description = block.match(/description:\s*\n?\s*'((?:[^'\\]|\\.)*)'/)?.[1];
  if (slug && name) {
    tools.push({
      slug,
      name,
      category,
      description: (description ?? '').replace(/\\'/g, "'"),
    });
  }
}

if (tools.length === 0) {
  console.error('Could not parse any tools from the registry.');
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const render = async (svg, file) => {
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(join(OUT, file), png);
  return png.length;
};

let bytes = 0;
for (const tool of tools) {
  bytes += await render(
    card({
      title: tool.name,
      description: tool.description,
      badge: categoryNames.get(tool.category) ?? 'Developer tools',
    }),
    `${tool.slug}.png`,
  );
}

// Category cards too — those pages get shared as often as individual tools.
for (const [id, name] of categoryNames) {
  const count = tools.filter((t) => t.category === id).length;
  bytes += await render(
    card({
      title: name,
      description: `${count} free developer tools that run entirely in your browser.`,
      badge: 'Category',
    }),
    `category-${id}.png`,
  );
}

console.log(
  `Generated ${tools.length} tool + ${categoryNames.size} category OG images ` +
    `(${(bytes / 1024 / 1024).toFixed(1)} MB total, avg ${Math.round(bytes / (tools.length + categoryNames.size) / 1024)} KB)`,
);
