// Минимальный статический сервер без зависимостей.
// Запуск: node server.js  -> http://localhost:8080

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr':  'application/octet-stream',
  '.ico':  'image/x-icon'
};

const server = http.createServer((req, res) => {
  try {
    const reqUrl = decodeURIComponent(req.url.split('?')[0]);
    let safe = path.normalize(reqUrl).replace(/^([\/\\])+/, '');
    let filePath = path.join(ROOT, safe);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: ' + reqUrl);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end('Server error: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n  ROOM 1107 :: http://localhost:${PORT}\n`);
});
