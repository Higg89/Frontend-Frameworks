#!/usr/bin/env node
/**
 * Minimal static server for the production build with SPA fallback.
 * Useful for Lighthouse, manual smoke tests and offline demos.
 *
 * Usage:
 *   npm run preview
 *   PORT=4173 BASE_PATH=/todo-app/ npm run preview
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const root = resolve(process.cwd(), 'dist', 'spa');
const port = Number(process.env.PORT ?? 4173);
const basePath = normalizeBasePath(process.env.BASE_PATH ?? '/');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
};

function normalizeBasePath(value) {
  if (value === '' || value === './') return '/';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

if (!existsSync(join(root, 'index.html'))) {
  console.error('dist/spa/index.html not found. Run "npm run build" first.');
  process.exit(1);
}

function sendFile(request, response, path, statusCode = 200) {
  const extension = extname(path).toLowerCase();
  const isFingerprinted = path.includes(`${join(root, 'assets')}`) || /[.-][a-f0-9]{8,}\./.test(path);
  const encoded = encodeBody(request, path, extension);
  const headers = {
    'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
    'Cache-Control': isFingerprinted ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Accept-Encoding',
  };

  if (encoded) {
    headers['Content-Encoding'] = encoded.encoding;
    headers['Content-Length'] = String(encoded.body.length);
    response.writeHead(statusCode, headers);
    response.end(encoded.body);
    return;
  }

  response.writeHead(statusCode, headers);
  createReadStream(path).pipe(response);
}

/**
 * GitHub Pages serves gzip/brotli, so the preview server does too. Without it
 * Lighthouse would report uncompressed transfer sizes that never reach users.
 */
const compressionCache = new Map();
const compressibleExtensions = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.txt',
  '.xml',
  '.svg',
  '.webmanifest',
]);

function encodeBody(request, path, extension) {
  if (!compressibleExtensions.has(extension)) {
    return null;
  }

  const acceptEncoding = request.headers['accept-encoding'] ?? '';
  const wantsBrotli = /\bbr\b/.test(acceptEncoding);
  const wantsGzip = /\bgzip\b/.test(acceptEncoding);

  if (!wantsBrotli && !wantsGzip) {
    return null;
  }

  const stats = statSync(path);

  if (stats.size < 1024) {
    return null;
  }

  const cacheKey = `${path}:${stats.mtimeMs}`;
  let cached = compressionCache.get(cacheKey);

  if (!cached) {
    const content = readFileSync(path);
    cached = {
      br: brotliCompressSync(content),
      gzip: gzipSync(content, { level: 9 }),
    };
    compressionCache.set(cacheKey, cached);
  }

  return wantsBrotli
    ? { encoding: 'br', body: cached.br }
    : { encoding: 'gzip', body: cached.gzip };
}

function resolveRequestPath(url) {
  const parsed = new URL(url, 'http://localhost');
  let pathname = decodeURIComponent(parsed.pathname);

  if (basePath !== '/' && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length - 1);
  }

  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root)) {
    return null;
  }

  return { filePath, pathname };
}

const server = createServer((request, response) => {
  const resolved = resolveRequestPath(request.url ?? '/');

  if (!resolved) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  const { filePath, pathname } = resolved;

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(request, response, filePath);
    return;
  }

  // Unknown file with an extension is a real 404; routes without an extension
  // are handled by the SPA router.
  if (extname(pathname) !== '') {
    const notFound = join(root, '404.html');
    sendFile(request, response, existsSync(notFound) ? notFound : join(root, 'index.html'), 404);
    return;
  }

  sendFile(request, response, join(root, 'index.html'));
});

server.listen(port, () => {
  console.log(`Preview: http://localhost:${port}${basePath}`);
});
