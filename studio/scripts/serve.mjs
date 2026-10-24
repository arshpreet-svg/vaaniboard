#!/usr/bin/env node
// Serves the built Studio (studio/out/) on http://localhost:3000 with no
// dependencies and no network access, so Studio runs fully offline after
// `npm run build`. Listens on 127.0.0.1 only: other machines cannot reach it.
//
//   node scripts/serve.mjs [port]        (or: npm start)

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../out', import.meta.url)));
const port = Number(process.argv[2] ?? process.env.PORT ?? 3000);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error('studio/out/ not found. Run `npm run build` first.');
  process.exit(1);
}

// Maps a URL path to a file inside `root`, or null. Never escapes `root`.
function resolvePath(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const full = normalize(join(root, p));
  if (full !== root && !full.startsWith(root + sep)) return null;
  for (const candidate of [full, join(full, 'index.html'), `${full}.html`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  const file = resolvePath(req.url ?? '/');
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(join(root, '404.html')).pipe(res);
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`VaaniBoard Studio: http://localhost:${port}  (offline, this laptop only; Ctrl+C to stop)`);
});
