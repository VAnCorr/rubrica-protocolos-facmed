const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8'};
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname === '/' ? '/output/demo.html' : url.pathname;
  const file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) || !['docs', 'output'].some(dir => file.startsWith(path.join(root, dir) + path.sep))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404); res.end('No encontrado'); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store'}); res.end(content);
  });
}).listen(4173, '127.0.0.1', () => console.log('Vista de prueba: http://127.0.0.1:4173'));
