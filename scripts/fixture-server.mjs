import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fixturePage } from '../tests/fixtures/page.mjs';
const assets = {
  '/site.js': ['../tests/fixtures/site.js', 'text/javascript'],
  '/fixture.css': ['../tests/fixtures/fixture.css', 'text/css'],
};
createServer(async (request, response) => {
  const asset = assets[request.url];
  if (asset) {
    response.writeHead(200, { 'content-type': asset[1] });
    response.end(await readFile(new URL(asset[0], import.meta.url)));
  } else {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(fixturePage(request.url));
  }
}).listen(4173, '127.0.0.1', () =>
  console.log('Fixture lab: http://localhost:4173/zybook/demo/chapter/1/section/1'),
);
