#!/usr/bin/env node
/**
 * Generates ByteCabin's raster brand assets from inline SVG sources.
 *
 * Run via `npm run assets`. Output lands in public/ and is committed, so a
 * normal build never depends on sharp being installed or on this script
 * running in CI.
 *
 * Produces:
 *   og.png                  1200×630  social preview
 *   icon-192.png            192×192   PWA
 *   icon-512.png            512×512   PWA
 *   icon-maskable-512.png   512×512   PWA maskable (safe-zone padded)
 *   apple-touch-icon.png    180×180   iOS home screen
 *   favicon.ico             32×32     legacy browsers
 */

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const ACCENT = '#0f766e';
const INK = '#fafaf9';
const DARK = '#0c0a09';
const SURFACE = '#1c1917';
const MUTED = '#a8a29e';

/**
 * The cabin mark, as a path group on a 0–32 grid.
 * Roof plus two log lines of unequal length — cabin walls and code lines at
 * once. Kept in sync with src/components/Logo.astro and public/favicon.svg.
 */
const MARK = (stroke, width = 2.4) => `
  <g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5.2 14.4 16 6.2l10.8 8.2"/>
    <path d="M8.6 16.4v9.4h14.8v-9.4"/>
    <path d="M11.8 19.8h8.4"/>
    <path d="M11.8 23h5"/>
  </g>`;

/** Square app icon: accent tile, white mark. */
function iconSvg(size, padding = 0) {
  const inner = size - padding * 2;
  const radius = Math.round(inner * 0.22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${padding ? ACCENT : 'none'}"/>
    <rect x="${padding}" y="${padding}" width="${inner}" height="${inner}" rx="${padding ? 0 : radius}" fill="${ACCENT}"/>
    <g transform="translate(${padding}, ${padding}) scale(${inner / 32})">
      ${MARK('#ffffff', 2.3)}
    </g>
  </svg>`;
}

/**
 * Social preview card. Kept deliberately plain — a legible name, the tagline
 * and the tool count read better in a cramped timeline than any illustration.
 */
function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${DARK}"/>
        <stop offset="100%" stop-color="${SURFACE}"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <rect x="0" y="0" width="1200" height="6" fill="${ACCENT}"/>

    <g transform="translate(96, 168)">
      <rect width="104" height="104" rx="24" fill="${ACCENT}"/>
      <g transform="translate(20, 20) scale(2.0)">
        ${MARK('#ffffff', 2.3)}
      </g>
    </g>

    <text x="96" y="352" font-family="Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif"
          font-size="82" font-weight="650" fill="${INK}" letter-spacing="-2.5">ByteCabin</text>

    <text x="96" y="424" font-family="Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif"
          font-size="34" font-weight="400" fill="${MUTED}">Developer tools that run in your browser</text>

    <g transform="translate(96, 470)">
      ${['50 tools', 'No uploads', 'No accounts']
        .map((label, i) => {
          const x = i * 210;
          return `<g transform="translate(${x}, 0)">
            <rect width="188" height="52" rx="26" fill="none" stroke="#44403c" stroke-width="1.5"/>
            <text x="94" y="34" text-anchor="middle"
                  font-family="Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif"
                  font-size="22" fill="${MUTED}">${label}</text>
          </g>`;
        })
        .join('')}
    </g>

    <text x="1104" y="566" text-anchor="end"
          font-family="Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif"
          font-size="26" fill="${ACCENT}">bytecabin.dev</text>
  </svg>`;
}

const png = (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer();

/**
 * Wrap a 32×32 PNG in an ICO container.
 * Vista and later accept PNG-compressed entries, which keeps this trivial.
 */
function pngToIco(pngBuffer, size = 32) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12); // offset

  return Buffer.concat([header, entry, pngBuffer]);
}

const out = (name) => join(PUBLIC, name);

console.log('Generating brand assets…');

await sharp(Buffer.from(ogSvg())).png({ compressionLevel: 9 }).toFile(out('og.png'));
console.log('  og.png                1200×630');

for (const size of [192, 512]) {
  await writeFile(out(`icon-${size}.png`), await png(iconSvg(size), size));
  console.log(`  icon-${size}.png${' '.repeat(10 - String(size).length)}${size}×${size}`);
}

// Maskable icons need ~10% safe-zone padding so the mark survives being
// cropped to a circle or squircle on Android.
await writeFile(out('icon-maskable-512.png'), await png(iconSvg(512, 56), 512));
console.log('  icon-maskable-512.png 512×512');

await writeFile(out('apple-touch-icon.png'), await png(iconSvg(180), 180));
console.log('  apple-touch-icon.png  180×180');

await writeFile(out('favicon.ico'), pngToIco(await png(iconSvg(32), 32), 32));
console.log('  favicon.ico           32×32');

console.log('Done.');
