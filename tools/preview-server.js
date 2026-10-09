import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const routes = new Map([
  ['/', ['preview/index.html', 'text/html']],
  ['/preview.js', ['preview/preview.js', 'text/javascript']],
  ['/style.css', ['preview/style.css', 'text/css']],
  ['/dashboard.js', ['src/dashboard.js', 'text/javascript']],
]);
const server = createServer(async (request, response) => {
  const route = routes.get(new URL(request.url, 'http://localhost').pathname);
  if (!route) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(fileURLToPath(new URL(route[0], root)));
    response.writeHead(200, {
      'Content-Type': `${route[1]}; charset=utf-8`,
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(500).end('Unable to read preview file');
  }
});
server.listen(4173, '127.0.0.1', () => {
  console.log('Egern preview: http://127.0.0.1:4173');
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
