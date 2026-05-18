// Standalone preview server for the showcase-mode changes — bypasses
// Docusaurus so the showcase chrome can be eyeballed without touching the
// full MDX/SPA pipeline.
//
// Run:  node scripts/preview-showcase.mjs
// Open: http://localhost:4321/
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderDgmoBlock } from '../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientCss = readFileSync(
  resolve(__dirname, '../dist/client.css'),
  'utf8'
);
const clientJs = readFileSync(resolve(__dirname, '../dist/client.js'), 'utf8');

// DGMO syntax pulled from dgmo-content/examples/ — chart-type declarations
// take no colons, participants are declared as "X is an actor / a service",
// pie entries are space-separated. See docs/dgmo-language-spec.md.
const blocks = [
  {
    meta: 'showcase title="Login flow"',
    source: `sequence Login flow

Client is an actor
API is a service
Auth is a service

Client -POST /login-> API
API -validate-> Auth
Auth -JWT-> API
API -200 OK-> Client`,
  },
  {
    meta: 'showcase title="Crew roles"',
    source: `pie Crew Roles Distribution

Sailors          45
Gunners          20
Marines          15
Officers          8
Specialists       7
Cooks & Surgeons  5`,
  },
];

const rendered = await Promise.all(
  blocks.map((b) =>
    renderDgmoBlock(b.source, b.meta, { colorMode: 'light' }).then(
      (r) => r.html
    )
  )
);

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<title>remark-dgmo showcase preview</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  .dgmo-caption { font-weight: 600; margin-bottom: 0.5rem; }
  /* remark-dgmo client.css */
  ${clientCss}
</style>
</head>
<body>
<h1>remark-dgmo — showcase mode preview</h1>
<p>Diagram on top, collapsible source below (click <code>▶ source</code> to expand).
Copy + open-in-editor buttons do NOT toggle the disclosure.</p>

<h2>Login flow</h2>
${rendered[0]}

<h2>Language mix</h2>
${rendered[1]}

<script type="module">${clientJs}</script>
</body>
</html>`;

createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(4321, () => {
  console.log('open http://localhost:4321/');
});
