import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildStandaloneHtml, DeckError, loadDeck, readSlide, updateSlide, root } from './lib/deck.mjs';

const publicDir = resolve(root, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const sendJson = (res, status, value) => send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');
function send(res, status, data, contentType = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(data);
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 400_000) throw new DeckError(413, '請求超過 400 KB');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new DeckError(400, 'JSON 格式錯誤'); }
}

export function createApp() {
  return createServer(async (req, res) => {
    try {
      const route = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && route === '/api/deck') return sendJson(res, 200, await loadDeck());
      if (req.method === 'GET' && route === '/api/export') {
        return send(res, 200, await buildStandaloneHtml(), 'text/html; charset=utf-8', {
          'Content-Disposition': 'attachment; filename="presentation.html"'
        });
      }
      const match = route.match(/^\/api\/slides\/([a-z0-9-]+)$/);
      if (match && req.method === 'GET') return sendJson(res, 200, await readSlide(match[1]));
      if (match && req.method === 'PUT') {
        const payload = await readJson(req);
        return sendJson(res, 200, await updateSlide(match[1], payload.html, payload.expectedHash));
      }
      if (route.startsWith('/api/')) throw new DeckError(404, '找不到 API');
      if (req.method !== 'GET') throw new DeckError(405, '不允許此操作');
      const relative = route === '/' ? '/index.html' : decodeURIComponent(route);
      const file = resolve(publicDir, `.${relative}`);
      if (!file.startsWith(publicDir + sep)) throw new DeckError(403, '不可讀取此路徑');
      try { return send(res, 200, await readFile(file), types[extname(file)] || 'application/octet-stream'); }
      catch { throw new DeckError(404, '找不到檔案'); }
    } catch (error) {
      const status = error instanceof DeckError ? error.status : 500;
      return sendJson(res, status, { error: error.message || '伺服器錯誤' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4173);
  createApp().listen(port, '127.0.0.1', () => console.log(`HTML Presentation Studio: http://127.0.0.1:${port}`));
}