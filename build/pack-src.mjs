// Copies the built map packs (gzipped, base64) into the Apps Script project as src/map_<id>.html
// (Apps Script serves them with getMap). Removes map files for packs that no longer exist.
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAPS = path.join(HERE, '..', 'maps');
const SRC = path.join(HERE, '..', 'src');
const want = new Set();
for (const f of fs.readdirSync(MAPS).filter((f) => f.endsWith('.json'))) {
  const name = 'map_' + f.slice(0, -5).replace(/-/g, '_') + '.html';
  want.add(name);
  // gzip + base64: Apps Script projects have a size cap, and the outlines squeeze to about a third.
  // The catalog stays plain (the page template reads it). The app unpacks maps with DecompressionStream.
  const raw = fs.readFileSync(path.join(MAPS, f), 'utf8');
  const txt = f === 'catalog.json' ? raw : zlib.gzipSync(raw, { level: 9 }).toString('base64');
  const dest = path.join(SRC, name);
  if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== txt) fs.writeFileSync(dest, txt);
}
for (const f of fs.readdirSync(SRC)) if (f.startsWith('map_') && !want.has(f)) fs.unlinkSync(path.join(SRC, f));
console.log(want.size, 'map files in src/');
