// Serves the web export in ./dist for development checks, with single-page fallback.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..', 'dist');
const port = Number(process.env.PORT ?? 8081);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };

createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, p);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`mobile web on http://localhost:${port}`));
