/**
 * A static server for dist/ that mirrors Cloudflare Pages URL semantics.
 *
 * Shared by the browser audit, the performance budget and the cross-browser
 * suite so all three exercise the site exactly as production serves it:
 * clean URLs resolving to `<path>.html`, and unknown paths returning the
 * real 404 page rather than a bare string.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

/** Extensions worth compressing. woff2 and png are already compressed. */
const COMPRESSIBLE = new Set([
  '.html', '.js', '.css', '.json', '.svg', '.xml', '.txt', '.webmanifest',
]);

/**
 * Start the server on an ephemeral port.
 *
 * @param {string} dist  Absolute path to the build output.
 * @param {{ compress?: boolean }} [options]
 *   compress: gzip text responses, so transfer measurements match what a CDN
 *   actually sends. Off by default — it only matters for the perf budget.
 * @returns {Promise<{ base: string, close: () => void }>}
 */
export async function serveDist(dist, options = {}) {
  const { compress = false } = options;

  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);

    const candidates =
      urlPath === '/'
        ? [join(dist, 'index.html')]
        : [
            join(dist, urlPath),
            join(dist, `${urlPath.replace(/\/$/, '')}.html`),
            join(dist, urlPath.replace(/\/$/, ''), 'index.html'),
          ];

    const file = candidates.find((c) => existsSync(c) && extname(c));

    if (!file) {
      const notFound = join(dist, '404.html');
      const body = existsSync(notFound) ? await readFile(notFound) : Buffer.from('Not found');
      res.writeHead(404, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': body.length,
      });
      return res.end(body);
    }

    try {
      const raw = await readFile(file);
      const ext = extname(file);
      const useGzip =
        compress &&
        COMPRESSIBLE.has(ext) &&
        (req.headers['accept-encoding'] ?? '').includes('gzip');
      const body = useGzip ? gzipSync(raw, { level: 9 }) : raw;

      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Content-Length': body.length,
        ...(useGzip ? { 'Content-Encoding': 'gzip' } : {}),
      });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end('error');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => server.close(),
  };
}
