// Local preview: runs the real Code.js + Store.js against a fake spreadsheet
// (dev/state.json; delete it to start over) and serves the page with a
// google.script.run stand-in that calls them over HTTP.
// Run: node dev/server.js 5221   (launch config "geo-quiz")
const http = require('http');
const path = require('path');
const { load } = require('./fakegas');
const port = +process.argv[2] || 5221;
const STATE = path.join(__dirname, 'state.json');
const STARTED = Date.now(); // new build id per server start, so cached maps reload

const STUB = `<script>window.google = { script: { run: (function () {
  function runner(ok, fail) {
    return new Proxy({}, { get(_, fn) {
      if (fn === 'withSuccessHandler') return (f) => runner(f, fail);
      if (fn === 'withFailureHandler') return (f) => runner(ok, f);
      return (...args) => fetch('/api/' + fn, { method: 'POST', body: JSON.stringify(args) })
        .then((r) => r.json()).then((j) => { if (j.error) { if (fail) fail(new Error(j.error)); } else if (ok) ok(j.result); })
        .catch((e) => fail && fail(e));
    } });
  }
  return runner(null, null);
})() } };</script>`;

function render(gas) {
  let html = gas.readSrc('Index');
  html = html.replace(/<\?!= include\('(\w+)'\); \?>/g, (_, n) => gas.readSrc(n));
  const boot = JSON.stringify({ build: 'dev' + STARTED, base: process.env.NO_BASE ? '' : '/maps/', catalog: JSON.parse(gas.readSrc('map_catalog')), progress: gas.ctx.summary_(), settings: gas.ctx.getSettings_() }).replace(/</g, '\\u003c');
  return html.replace('<?!= boot ?>', boot).replace('<head>', '<head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">' + STUB);
}

http.createServer((req, res) => {
  const gas = load(STATE);
  if (req.url.startsWith('/maps/')) {
    // stands in for the static map host (GitHub Pages)
    const f = path.join(__dirname, '..', 'maps', decodeURIComponent(req.url.slice(6).split('?')[0]).replace(/\.\./g, ''));
    require('fs').readFile(f, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': f.endsWith('.json') ? 'application/json' : f.endsWith('.webp') ? 'image/webp' : 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      res.end(buf);
    });
    return;
  }
  if (req.url.startsWith('/api/')) {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const fn = req.url.slice(5);
      let out;
      try {
        if (fn.endsWith('_') || typeof gas.ctx[fn] !== 'function') throw new Error('no such function ' + fn);
        out = { result: gas.ctx[fn](...JSON.parse(body || '[]')) };
        gas.save();
      } catch (e) { out = { error: String(e.message || e) }; console.error(fn, e); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(render(gas));
  } catch (e) {
    res.writeHead(500); res.end(String(e.stack));
  }
}).listen(port, () => console.log('http://localhost:' + port));
