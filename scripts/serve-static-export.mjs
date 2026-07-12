import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const rootDir = path.resolve(repoRoot, readArg('--dir', 'exports/player-static'));
const host = readArg('--host', '127.0.0.1');
const port = Number(readArg('--port', '4273'));
const rawBase = readArg('--base', '/');
const basePath = `/${rawBase.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

function parseHeaders() {
  const headersPath = path.join(rootDir, '_headers');
  if (!existsSync(headersPath)) {
    return {};
  }
  const headers = {};
  for (const line of readFileSync(headersPath, 'utf8').split('\n')) {
    const match = line.match(/^\s{2}([^:]+):\s*(.+)$/);
    if (match) {
      headers[match[1]] = match[2];
    }
  }
  return headers;
}

const securityHeaders = parseHeaders();

function sendText(response, status, text) {
  response.writeHead(status, {
    ...securityHeaders,
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(text);
}

async function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl ?? '/', `http://${host}:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === basePath.slice(0, -1)) {
    pathname = basePath;
  }
  if (!pathname.startsWith(basePath)) {
    return null;
  }
  const relativePath = pathname.slice(basePath.length) || 'index.html';
  if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  const absolutePath = path.join(rootDir, relativePath);
  const fileStats = existsSync(absolutePath) ? await stat(absolutePath) : null;
  if (fileStats?.isFile()) {
    return absolutePath;
  }
  return null;
}

const server = createServer(async (request, response) => {
  try {
    const absolutePath = await resolveRequestPath(request.url);
    if (!absolutePath) {
      sendText(response, 404, 'not found');
      return;
    }
    const extension = path.extname(absolutePath);
    response.writeHead(200, {
      ...securityHeaders,
      'Content-Type': contentTypes.get(extension) ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(absolutePath).pipe(response);
  } catch (error) {
    sendText(response, 500, error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, host, () => {
  console.log(`serving ${rootDir} at http://${host}:${port}${basePath}`);
});
