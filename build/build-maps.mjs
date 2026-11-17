// Builds every quiz map ("pack") from the downloaded sources into ../maps/*.json
// plus ../maps/catalog.json. Run: node build-maps.mjs [packId ...]
//
// Each pack is pre-projected to SVG paths in a W=10000 viewBox, so the app
// needs no map library. Per place: name, alternates, group, path, label point,
// area, bbox, land neighbours (shared border) and near neighbours (across a
// narrow gap of water, for Road Trip).
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import * as d3 from 'd3-geo';
import polylabel from 'polylabel';
const require = createRequire(import.meta.url);
const mapshaper = require('mapshaper');
const topojson = require('topojson-client');

import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'sources');
const OUT = path.join(HERE, '..', 'maps');
fs.mkdirSync(OUT, { recursive: true });
const W = 10000;
const only = process.argv.slice(2);

// ---------- sources ----------
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
let _a0, _a1, _lakes;
const A0 = () => _a0 || (_a0 = readJSON('ne_10m_admin_0_countries.geojson').features);
const A1 = () => _a1 || (_a1 = readJSON('ne_10m_admin_1_states_provinces.geojson').features);
const LAKES = () => _lakes || (_lakes = readJSON('ne_10m_lakes.geojson').features.filter((f) => f.geometry));
const usAtlas = require('us-atlas/counties-10m.json');
const US_STATES = topojson.feature(usAtlas, usAtlas.objects.states).features;
const US_COUNTIES = topojson.feature(usAtlas, usAtlas.objects.counties).features;

// d3 (spherical) wants clockwise exteriors and counter-clockwise holes; Natural Earth ships the reverse.
const cwSum = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a; };
const orient = (r, cw) => ((cwSum(r) > 0) === cw ? r : r.slice().reverse());
function rewind(g) {
  if (!g) return g;
  const poly = (rs) => rs.map((r, i) => orient(r, i === 0));
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: poly(g.coordinates) };
  if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.coordinates.map(poly) };
  return g;
}
const feat = (geometry, props) => ({ type: 'Feature', geometry: rewind(geometry), properties: props });
const uniq = (a) => [...new Set(a.filter(Boolean))];

// ---------- countries (admin 0) ----------
const COUNTRY_NAME = {
  'Dem. Rep. Congo': 'Democratic Republic of the Congo', Congo: 'Republic of the Congo',
  'Central African Rep.': 'Central African Republic', 'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Dominican Rep.': 'Dominican Republic', 'Eq. Guinea': 'Equatorial Guinea', 'S. Sudan': 'South Sudan',
  'W. Sahara': 'Western Sahara', 'United States of America': 'United States', 'Solomon Is.': 'Solomon Islands',
  'Marshall Is.': 'Marshall Islands', 'St. Vin. and Gren.': 'Saint Vincent and the Grenadines',
  'Antigua and Barb.': 'Antigua and Barbuda', 'St. Kitts and Nevis': 'Saint Kitts and Nevis', eSwatini: 'Eswatini',
  'São Tomé and Principe': 'São Tomé and Príncipe', 'Falkland Is.': 'Falkland Islands', 'Faeroe Is.': 'Faroe Islands',
  'Fr. Polynesia': 'French Polynesia', 'Turks and Caicos Is.': 'Turks and Caicos Islands', 'Cayman Is.': 'Cayman Islands',
  'British Virgin Is.': 'British Virgin Islands', 'U.S. Virgin Is.': 'U.S. Virgin Islands', 'N. Mariana Is.': 'Northern Mariana Islands',
  'Cook Is.': 'Cook Islands', 'Fr. S. Antarctic Lands': 'French Southern Lands',
};
const COUNTRY_ALT = {
  USA: ['USA', 'United States of America', 'America', 'US'], GBR: ['UK', 'Great Britain', 'Britain'],
  COD: ['DR Congo', 'DRC', 'Congo-Kinshasa', 'Congo Kinshasa', 'Zaire'], COG: ['Congo', 'Congo-Brazzaville', 'Congo Brazzaville'],
  CIV: ['Ivory Coast'], CZE: ['Czech Republic'], TLS: ['East Timor'], MMR: ['Burma'], CPV: ['Cape Verde'],
  SWZ: ['Swaziland'], MKD: ['Macedonia'], ARE: ['UAE'], CAF: ['CAR'], PRK: ['DPRK'], KOR: ['Korea'],
  VAT: ['Vatican City', 'Holy See'], PSX: ['State of Palestine', 'Palestinian Territories'], FSM: ['Federated States of Micronesia'],
  TUR: ['Türkiye', 'Turkiye'], NLD: ['Holland'], BHS: ['The Bahamas'], GMB: ['The Gambia'], LAO: ["Lao People's Democratic Republic"],
};
// Parts that are merged into another country, and specks left out entirely.
const COUNTRY_MERGE = { SOL: 'SOM', CYN: 'CYP', CNM: 'CYP', WSB: 'CYP', ESB: 'CYP', KAB: 'KAZ', USG: 'CUB', BRI: 'BRA' };
const COUNTRY_DROP = new Set(['KAS', 'BRT', 'SPI', 'PGA', 'SCR', 'BJN', 'SER', 'CLP', 'CSI', 'ATC', 'IOA', 'UMI']);
// Shown on maps (grey) but not quizzed.
const NOT_QUIZZED = new Set(['HKG', 'MAC', 'JEY', 'GGY', 'IMN', 'ALD', 'CUW', 'ABW', 'SXM', 'GIB', 'IOT', 'FLK', 'ATA', 'GRL',
  'PRI', 'NCL', 'PYF', 'ATF', 'SGS', 'HMD', 'SHN', 'BMU', 'SPM', 'FRO', 'VIR', 'VGB', 'AIA', 'MSR', 'CYM', 'TCA', 'MAF', 'BLM',
  'PCN', 'NFK', 'COK', 'WLF', 'NIU', 'ASM', 'GUM', 'MNP']);
const SEVEN_SEAS = { SYC: 'Africa', MUS: 'Africa', MDV: 'Asia' };

function countries() {
  const out = [];
  for (const f of A0()) {
    const p = f.properties;
    let id = p.ADM0_A3;
    if (COUNTRY_DROP.has(id)) continue;
    const merged = COUNTRY_MERGE[id];
    if (merged) id = merged;
    const base = A0().find((g) => g.properties.ADM0_A3 === id).properties;
    const nm = COUNTRY_NAME[base.NAME] || base.NAME;
    out.push({
      id, geometry: f.geometry, name: nm,
      alt: uniq([base.NAME, base.NAME_LONG, base.NAME_EN, base.ADMIN, ...(base.NAME_ALT || '').split('|'), ...(COUNTRY_ALT[id] || [])]).filter((a) => a !== nm),
      continent: SEVEN_SEAS[id] || base.CONTINENT, subregion: base.SUBREGION,
      quiz: !NOT_QUIZZED.has(id) && base.CONTINENT !== 'Seven seas (open ocean)' || !!SEVEN_SEAS[id],
    });
  }
  return out;
}

// ---------- name helpers ----------
const SUFFIX = / (Prefecture|Province|Voivodeship|State|Governorate|Region|Oblast)$/;
function a1Names(p, field, over) {
  const fixed = over && over[p.name] !== undefined;
  const raw = fixed ? over[p.name] : (field === 'name_en' ? (p.name_en || p.name) : p.name);
  const name = fixed ? raw : (raw || '').replace(SUFFIX, '');
  const alt = uniq([p.name, p.name_en, p.woe_name, p.gn_name, ...(p.name_alt || '').split('|'), (p.name_en || '').replace(SUFFIX, '')])
    .filter((a) => a && a !== name);
  return { name, alt };
}

// ---------- pack building ----------
function bboxPolygon([w, s, e, n]) {
  // densified, clockwise (d3 convention) lon/lat rectangle; e < w means it wraps the antimeridian
  if (e < w) e += 360;
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) pts.push([w + (e - w) * i / N, n]);
  for (let i = 0; i <= N; i++) pts.push([e, n - (n - s) * i / N]);
  for (let i = 0; i <= N; i++) pts.push([e - (e - w) * i / N, s]);
  for (let i = 0; i <= N; i++) pts.push([w, s + (n - s) * i / N]);
  return { type: 'Polygon', coordinates: [pts.map(([x, y]) => [x > 180 ? x - 360 : x, y])] };
}

function naiveExtentKm(features) {
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
  const walk = (c) => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); };
  features.forEach((f) => f.geometry && walk(f.geometry.coordinates));
  const lat = (y0 + y1) / 2;
  return Math.max((x1 - x0) * 111 * Math.cos(lat * Math.PI / 180), (y1 - y0) * 111);
}

async function simplifyTopo(features, intervalM, dissolve) {
  const cmd = `-i in.json snap ${dissolve ? '-dissolve pid copy-fields=name,alt,group,role,lbl' : ''} -simplify interval=${Math.round(intervalM)} keep-shapes -o out.json format=topojson`;
  const out = await mapshaper.applyCommands(cmd, { 'in.json': { type: 'FeatureCollection', features } });
  const topo = JSON.parse(out['out.json']);
  return { topo, obj: topo.objects[Object.keys(topo.objects)[0]] };
}

// Records projected rings from d3.geoPath.
function rings(pathGen, geo) {
  const rs = [];
  let cur = null;
  pathGen.context({
    moveTo(x, y) { cur = [[x, y]]; rs.push(cur); }, lineTo(x, y) { cur.push([x, y]); },
    closePath() {}, arc() {}, beginPath() {},
  })(geo);
  return rs;
}
const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; };
function pointInRing([x, y], r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Compact relative SVG path. After 'z' the pen returns to the subpath start.
function encode(rs, close) {
  let s = '', px = 0, py = 0;
  for (const r of rs) {
    const pts = [];
    for (const [x0, y0] of r) { const p = [Math.round(x0), Math.round(y0)]; const l = pts[pts.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) pts.push(p); }
    if (pts.length < 2) continue;
    s += s ? 'm' + num(pts[0][0] - px, true) + num(pts[0][1] - py) : 'M' + pts[0][0] + ' ' + pts[0][1];
    px = pts[0][0]; py = pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      s += (i === 1 ? 'l' + num(pts[i][0] - px, true) : num(pts[i][0] - px)) + num(pts[i][1] - py);
      px = pts[i][0]; py = pts[i][1];
    }
    if (close) { s += 'z'; px = pts[0][0]; py = pts[0][1]; }
  }
  return s;
}
// numbers in a relative path: a leading '-' separates itself
function num(v, first) { return first || v < 0 ? String(v) : ' ' + v; }

function cleanRings(rs, minArea) {
  return rs.map((r) => {
    const o = [];
    for (const [x, y] of r) { const p = [Math.round(x), Math.round(y)]; const l = o[o.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) o.push(p); }
    return o;
  }).filter((r) => r.length >= 3 && Math.abs(ringArea(r)) >= minArea);
}

function shapeInfo(rs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0;
  for (const r of rs) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  rs.forEach((r) => { area += ringArea(r); });
  // label: pole of inaccessibility of the biggest ring (holes inside it included)
  let big = rs[0];
  for (const r of rs) if (Math.abs(ringArea(r)) > Math.abs(ringArea(big))) big = r;
  const holes = rs.filter((r) => r !== big && Math.abs(ringArea(r)) < Math.abs(ringArea(big)) && pointInRing(r[0], big));
  const lp = polylabel([big, ...holes], Math.max(2, Math.sqrt(Math.abs(ringArea(big))) / 50));
  return { bb: [x0, y0, x1, y1].map(Math.round), a: Math.round(Math.abs(area)), lx: Math.round(lp[0]), ly: Math.round(lp[1]) };
}

function makeProjection(cfg, fitObj) {
  if (cfg.proj === 'albersUsa') return d3.geoAlbersUsa();
  if (cfg.proj === 'world') return d3.geoNaturalEarth1().rotate([-11, 0]);
  const b = d3.geoBounds(fitObj);
  let lon0 = b[0][0], lon1 = b[1][0];
  if (lon1 < lon0) lon1 += 360;
  const lonc = (lon0 + lon1) / 2, latc = (b[0][1] + b[1][1]) / 2;
  return d3.geoAzimuthalEqualArea().rotate([-lonc, -latc]);
}

// k-means groups for big maps with no natural regions, named by compass direction
function autoGroups(places, W, H) {
  const n = places.length;
  const k = Math.max(2, Math.round(n / 22));
  const pts = places.map((p) => [p.lx, p.ly]);
  let cs = [pts[0]];
  while (cs.length < k) {
    let best = null, bd = -1;
    for (const p of pts) { const d = Math.min(...cs.map((c) => (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2)); if (d > bd) { bd = d; best = p; } }
    cs.push(best);
  }
  let asg = new Array(n).fill(0);
  for (let it = 0; it < 30; it++) {
    asg = pts.map((p) => { let bi = 0, bd = Infinity; cs.forEach((c, i) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; });
    cs = cs.map((c, i) => { const m = pts.filter((_, j) => asg[j] === i); return m.length ? [m.reduce((s, p) => s + p[0], 0) / m.length, m.reduce((s, p) => s + p[1], 0) / m.length] : c; });
  }
  let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
  pts.forEach(([x, y]) => { gx0 = Math.min(gx0, x); gx1 = Math.max(gx1, x); gy0 = Math.min(gy0, y); gy1 = Math.max(gy1, y); });
  const names = cs.map(([x, y]) => {
    const fx = (x - gx0) / (gx1 - gx0 || 1), fy = (y - gy0) / (gy1 - gy0 || 1);
    const v = fy < 0.36 ? 'North' : fy > 0.64 ? 'South' : '';
    const h = fx < 0.36 ? 'west' : fx > 0.64 ? 'east' : '';
    return v ? v + h : h ? h[0].toUpperCase() + h.slice(1) : 'Central';
  });
  // de-duplicate names: "North" & "North" → "North (around X)"
  const cnt = {};
  names.forEach((nm) => { cnt[nm] = (cnt[nm] || 0) + 1; });
  const final = names.map((nm, i) => {
    if (cnt[nm] === 1) return nm;
    const members = places.filter((_, j) => asg[j] === i).sort((a, b) => b.a - a.a);
    return nm + ' (around ' + members[0].n + ')';
  });
  return { groups: final, asg };
}

async function buildPack(cfg) {
  const q = cfg.places; // [{pid,name,alt[],group, geometry}]
  const ctx = cfg.context || [];
  const extentKm = cfg.extentKm || naiveExtentKm(q.map((p) => ({ geometry: p.geometry })));
  // ~0.9 output px at 1000px wide; `detail` sharpens maps people zoom far into (small countries)
  const interval = cfg.interval || extentKm * 1000 / W * 9 / (cfg.detail || 1);
  const fs0 = [
    ...q.map((p) => feat(p.geometry, { pid: 'q:' + p.pid, name: p.name, alt: (p.alt || []).join('|'), group: p.group || '', role: 'q', lbl: 1 })),
    ...ctx.map((c, i) => feat(c.geometry, { pid: 'c:' + (c.pid || i), name: c.name || '', alt: '', group: '', role: 'c', lbl: c.lbl ? 1 : 0 })),
  ];
  const { topo, obj } = await simplifyTopo(fs0, interval, true);
  const geoms = obj.geometries.filter((g) => g.type);
  const qGeoms = geoms.filter((g) => g.properties.role === 'q');
  const cGeoms = geoms.filter((g) => g.properties.role === 'c');
  const qFeats = qGeoms.map((g) => topojson.feature(topo, g));
  // inset members: places whose centroid falls in the inset's lon/lat box
  const inBox = (f, [w, so, e, n]) => { const [x, y] = d3.geoCentroid(f); return x >= w && x <= e && y >= so && y <= n; };
  for (const s of cfg.insets || []) s.pids = qFeats.filter((f) => inBox(f, s.within)).map((f) => f.properties.pid.slice(2));
  const insetPids = new Set((cfg.insets || []).flatMap((s) => s.pids.map((p) => 'q:' + p)));
  const mainQ = qFeats.filter((f) => !insetPids.has(f.properties.pid));
  const fitObj = cfg.bbox ? bboxPolygon(cfg.bbox) : { type: 'FeatureCollection', features: mainQ };

  const proj = makeProjection(cfg, fitObj);
  proj.fitSize([1000, 1000], fitObj);
  const b0 = d3.geoPath(proj).bounds(fitObj);
  const aspect = Math.min(1.5, Math.max(0.55, (b0[1][1] - b0[0][1]) / (b0[1][0] - b0[0][0])));
  const H = Math.round(W * aspect);
  const pad = W * 0.02;
  proj.fitExtent([[pad, pad], [W - pad, H - pad]], fitObj);
  // places are cut at the map edge; neighbouring land runs on past it so panning doesn't show a hard edge
  const TIGHT = [[-W * 0.01, -W * 0.01], [W * 1.01, H + W * 0.01]], WIDE = [[-W * 0.3, -W * 0.3], [W * 1.3, H + W * 0.3]];
  const clipTo = (e) => { if (proj.clipExtent) proj.clipExtent(e); };
  clipTo(TIGHT);
  const gp = d3.geoPath(proj);

  // insets: their own projection inside a box (fractions of W/H)
  const insetPath = {};
  for (const s of cfg.insets || []) {
    const fsI = qFeats.filter((f) => s.pids.includes(f.properties.pid.slice(2)));
    const pI = d3.geoAzimuthalEqualArea();
    const fc = { type: 'FeatureCollection', features: fsI };
    const bI = d3.geoBounds(fc);
    pI.rotate([-(bI[0][0] + bI[1][0]) / 2, -(bI[0][1] + bI[1][1]) / 2]);
    const [bx, by, bw, bh] = [s.box[0] * W, s.box[1] * H, s.box[2] * W, s.box[3] * H];
    pI.fitExtent([[bx + bw * 0.06, by + bh * 0.06], [bx + bw * 0.94, by + bh * 0.94]], fc);
    s.frame = [bx, by, bw, bh].map(Math.round);
    fsI.forEach((f) => { insetPath[f.properties.pid] = d3.geoPath(pI); });
  }

  const minRing = W * 0.000002; // drop sub-pixel islets (but each place keeps its biggest ring)
  const places = [];
  qFeats.forEach((f, i) => {
    const pg = insetPath[f.properties.pid] || gp;
    let rs = cleanRings(rings(pg, f), 0);
    if (!rs.length) {
      // a speck smaller than one unit (Vatican, Tuvalu on a world map): keep a tiny square so it gets a tap circle
      const [cx, cy] = pg.centroid(f);
      if (!isFinite(cx) || !isFinite(cy)) { places.push(null); return; }
      rs = [[[cx - 2, cy - 2], [cx + 2, cy - 2], [cx + 2, cy + 2], [cx - 2, cy + 2]].map(([x, y]) => [Math.round(x), Math.round(y)])];
    }
    const big = rs.reduce((m, r) => Math.abs(ringArea(r)) > Math.abs(ringArea(m)) ? r : m, rs[0]);
    rs = rs.filter((r) => r === big || Math.abs(ringArea(r)) >= minRing * W);
    const info = shapeInfo(rs);
    if (info.bb[2] < 0 || info.bb[0] > W || info.bb[3] < 0 || info.bb[1] > H) { places.push(null); return; }
    places.push({
      id: f.properties.pid.slice(2), n: f.properties.name, alt: f.properties.alt ? f.properties.alt.split('|') : [],
      group: f.properties.group, d: encode(rs, true), ...info, _rs: rs, _gi: i,
    });
  });

  // neighbours from shared arcs
  const nbIdx = topojson.neighbors(qGeoms);
  const keep = places.map((p, i) => p ? i : -1).filter((i) => i >= 0);
  const newIdx = new Map(keep.map((oi, ni) => [oi, ni]));
  const P = keep.map((i) => places[i]);
  P.forEach((p) => { p.nb = (nbIdx[p._gi] || []).filter((j) => newIdx.has(j)).map((j) => newIdx.get(j)).filter((j) => P[j] !== p); });
  // near neighbours: within a short gap (islands, lakes)
  const gap = Math.max(W, H) * 0.012;
  const samp = (p) => { const pts = p._rs.flat(); const step = Math.max(1, Math.floor(pts.length / 500)); return pts.filter((_, i) => i % step === 0); };
  const S = P.map(samp);
  P.forEach((p, i) => { p.nr = []; });
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j];
    if (a.nb.includes(j)) continue;
    if (a.bb[0] - gap > b.bb[2] || b.bb[0] - gap > a.bb[2] || a.bb[1] - gap > b.bb[3] || b.bb[1] - gap > a.bb[3]) continue;
    let md = Infinity;
    for (const u of S[i]) { for (const v of S[j]) { const d = (u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2; if (d < md) md = d; } if (md < gap * gap) break; }
    if (md < gap * gap) { a.nr.push(j); b.nr.push(i); }
  }

  // groups
  let groups = uniq(P.map((p) => p.group));
  if (cfg.groupOrder) groups = cfg.groupOrder.filter((g) => groups.includes(g)).concat(groups.filter((g) => !cfg.groupOrder.includes(g)));
  else groups.sort();
  if (!groups.length && P.length >= (cfg.autoGroupMin || 45)) {
    const ag = autoGroups(P, W, H);
    groups = ag.groups;
    P.forEach((p, i) => { p.group = groups[ag.asg[i]]; });
    groups = groups.slice().sort();
  }
  P.forEach((p) => { p.g = groups.length ? groups.indexOf(p.group) : -1; });

  // unique display names
  const dup = {};
  P.forEach((p) => { dup[p.n] = (dup[p.n] || 0) + 1; });
  P.forEach((p) => { if (dup[p.n] > 1 && p.group) { p.alt.push(p.n); p.n = p.n + ' (' + p.group + ')'; } });
  const dup2 = new Set(); P.forEach((p) => { if (dup2.has(p.n)) console.warn('  ! duplicate name', cfg.id, p.n); dup2.add(p.n); });

  // marker for specks
  P.forEach((p) => { const w = Math.max(p.bb[2] - p.bb[0], p.bb[3] - p.bb[1]); if (w < W * 0.006) p.m = 1; });

  // group boundary lines and the outline of the whole quiz area
  const qSet = new Set(qGeoms);
  const gOf = (g) => g.properties.group;
  let lines = '';
  if (groups.length > 1) {
    const grpOf = new Map(qGeoms.map((g, i) => [g, places[i] ? places[i].group : null]));
    const mesh = topojson.mesh(topo, obj, (a, b) => a !== b && qSet.has(a) && qSet.has(b) && grpOf.get(a) !== grpOf.get(b));
    lines = encode(cleanLines(rings(gp, mesh)), false);
  }
  const outline = encode(cleanRings(rings(gp, topojson.merge(topo, qGeoms.filter((g, i) => places[i] && !insetPid(places[i])))), W * 0.5), true);
  function insetPid(p) { return insetPids.has('q:' + p.id); }

  // context: drawn wide, labelled from the part inside the map
  const ctxOut = [];
  for (const g of cGeoms) {
    const f = topojson.feature(topo, g);
    clipTo(WIDE);
    const rs = cleanRings(rings(gp, f), W * 0.02);
    if (!rs.length) continue;
    const c = { d: encode(rs, true) };
    if (g.properties.lbl && g.properties.name) {
      clipTo(TIGHT);
      const rt = cleanRings(rings(gp, f), W * 0.02);
      if (rt.length) {
        const info = shapeInfo(rt);
        if (info.a > (W * 0.03) ** 2) { c.n = g.properties.name; c.lx = info.lx; c.ly = info.ly; c.a = info.a; }
      }
    }
    ctxOut.push(c);
  }
  clipTo(WIDE);

  // lakes
  let lakes = '';
  if (cfg.lakes !== false) {
    const lk = LAKES().filter((f) => f.properties.featurecla !== 'Reservoir' || true);
    const { topo: lt, obj: lo } = await simplifyTopo(lk.map((f) => feat(f.geometry, {})), interval, false);
    const all = topojson.feature(lt, lo);
    // a ring that spans the whole view is a lake turned inside out by the projection: drop it
    const rs = cleanRings(rings(gp, all), (W * 0.004) ** 2).filter((r) => Math.abs(ringArea(r)) < W * H * 0.3);
    lakes = encode(rs, true);
  }

  const pack = {
    id: cfg.id, title: cfg.title, noun: cfg.noun, nouns: cfg.nouns, groupNoun: cfg.groupNoun || 'Region',
    w: W, h: H, groups,
    places: P.map((p) => {
      const o = { n: p.n, d: p.d, lx: p.lx, ly: p.ly, a: p.a, bb: p.bb, nb: p.nb, nr: p.nr };
      if (p.alt.length) o.alt = p.alt;
      if (p.g >= 0) o.g = p.g;
      if (p.m) o.m = 1;
      return o;
    }),
    ctx: ctxOut, lines, outline, lakes,
  };
  if (cfg.insets) pack.frames = cfg.insets.map((s) => s.frame);
  const json = JSON.stringify(pack);
  fs.writeFileSync(path.join(OUT, cfg.id + '.json'), json);
  console.log(`${cfg.id.padEnd(22)} ${String(P.length).padStart(4)} places ${String(groups.length).padStart(3)} groups ${(json.length / 1024).toFixed(0).padStart(5)} KB  ${P.filter((p) => !p.nb.length && !p.nr.length).length} isolated`);
  return { id: cfg.id, title: cfg.title, count: P.length, noun: cfg.noun, nouns: cfg.nouns, kb: Math.round(json.length / 1024) };
}
function cleanLines(rs) {
  return rs.map((r) => r.map(([x, y]) => [Math.round(x), Math.round(y)])).filter((r) => r.length >= 2);
}

// ---------- pack definitions ----------
const packs = [];
const add = (cfg) => packs.push(cfg);

// World-level
const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
add({
  id: 'world-continents', title: 'Continents', noun: 'continent', nouns: 'continents', proj: 'world', lakes: false, extentKm: 30000,
  make() {
    return { places: countries().filter((c) => c.continent !== 'Seven seas (open ocean)').map((c) => ({ pid: c.continent, name: c.continent, alt: c.continent === 'Oceania' ? ['Australia', 'Australasia'] : [], geometry: c.geometry })) };
  },
});
add({
  id: 'world-countries', title: 'Countries of the World', detail: 3, noun: 'country', nouns: 'countries', proj: 'world', groupNoun: 'Continent', extentKm: 30000,
  make() {
    const cs = countries();
    return { places: cs.filter((c) => c.quiz).map((c) => ({ pid: c.id, name: c.name, alt: c.alt, group: c.continent, geometry: c.geometry })),
      context: cs.filter((c) => !c.quiz).map((c) => ({ pid: c.id, name: c.name, geometry: c.geometry })) };
  },
});
const CONT_CFG = {
  Africa: { id: 'africa', bbox: [-26, -36, 60, 38], detail: 2 },
  Asia: { id: 'asia', detail: 2.5 },
  Europe: { id: 'europe', bbox: [-25, 34, 45, 71], detail: 3 },
  'North America': { id: 'north-america', bbox: [-170, 6, -52, 72], detail: 3 },
  'South America': { id: 'south-america', bbox: [-93, -56, -33, 13], detail: 1.5 },
  Oceania: { id: 'oceania', interval: 2000 },
};
for (const cont of CONTINENTS) {
  const c = CONT_CFG[cont];
  add({
    id: c.id, title: cont, noun: 'country', nouns: 'countries', bbox: c.bbox, interval: c.interval, detail: c.detail, groupNoun: 'Region',
    make() {
      const cs = countries();
      const qs = cs.filter((x) => x.quiz && x.continent === cont);
      return { places: qs.map((x) => ({ pid: x.id, name: x.name, alt: x.alt, group: x.subregion, geometry: x.geometry })),
        context: cs.filter((x) => !(x.quiz && x.continent === cont)).map((x) => ({ pid: x.id, name: x.name, lbl: true, geometry: x.geometry })) };
    },
  });
}
const MIDEAST = ['BHR', 'CYP', 'EGY', 'IRN', 'IRQ', 'ISR', 'JOR', 'KWT', 'LBN', 'OMN', 'PSX', 'QAT', 'SAU', 'SYR', 'TUR', 'ARE', 'YEM'];
add({
  id: 'middle-east', title: 'Middle East', noun: 'country', nouns: 'countries', detail: 2,
  make() {
    const cs = countries();
    return { places: cs.filter((x) => MIDEAST.includes(x.id)).map((x) => ({ pid: x.id, name: x.name, alt: x.alt, geometry: x.geometry })),
      context: cs.filter((x) => !MIDEAST.includes(x.id)).map((x) => ({ pid: x.id, name: x.name, lbl: true, geometry: x.geometry })) };
  },
});

// Provinces of countries (Natural Earth admin 1)
function a1Context(adm0) {
  return countries().filter((c) => c.id !== adm0).map((c) => ({ pid: c.id, name: c.name, lbl: true, geometry: c.geometry }));
}
function a1Pack(o) {
  add({
    id: o.id, title: o.title, noun: o.noun, nouns: o.nouns, bbox: o.bbox, detail: o.detail, insets: o.insets, groupNoun: o.groupNoun, groupOrder: o.groupOrder, interval: o.interval, cont: o.cont, country: o.country,
    make() {
      let fs1 = A1().filter((f) => (o.admins || [o.admin]).includes(f.properties.admin) && f.properties.name);
      if (o.filter) fs1 = fs1.filter((f) => o.filter(f.properties));
      const places = fs1.map((f) => {
        const p = f.properties;
        const nm = a1Names(p, o.field || 'name', o.names);
        const key = o.key ? o.key(p, nm) : null;
        if (key) return { pid: key.id, name: key.name, alt: key.alt || [], group: key.group || '', geometry: f.geometry };
        return { pid: p.adm1_code, name: nm.name, alt: nm.alt, group: o.group ? o.group(p) || '' : '', geometry: f.geometry };
      }).filter((p) => p.name);
      return { places, context: a1Context(o.adm0) };
    },
  });
}

const regionOf = (p) => (p.region && p.region !== 'null' ? p.region : '');
a1Pack({ id: 'ca-provinces', title: 'Canada', country: 'Canada', cont: 'North America', admin: 'Canada', adm0: 'CAN', noun: 'province or territory', nouns: 'provinces & territories', group: regionOf });
a1Pack({ id: 'mx-states', title: 'Mexico', country: 'Mexico', cont: 'North America', admin: 'Mexico', adm0: 'MEX', noun: 'state', nouns: 'states', names: { México: 'State of Mexico', 'Distrito Federal': 'Mexico City' } });
a1Pack({ id: 'br-states', title: 'Brazil', country: 'Brazil', cont: 'South America', admin: 'Brazil', adm0: 'BRA', noun: 'state', nouns: 'states', names: { 'Distrito Federal': 'Federal District' },
  group: (p) => ({ AC: 'North', AM: 'North', AP: 'North', PA: 'North', RO: 'North', RR: 'North', TO: 'North', AL: 'Northeast', BA: 'Northeast', CE: 'Northeast', MA: 'Northeast', PB: 'Northeast', PE: 'Northeast', PI: 'Northeast', RN: 'Northeast', SE: 'Northeast', DF: 'Central-West', GO: 'Central-West', MT: 'Central-West', MS: 'Central-West', ES: 'Southeast', MG: 'Southeast', RJ: 'Southeast', SP: 'Southeast', PR: 'South', RS: 'South', SC: 'South' })[(p.iso_3166_2 || '').slice(3)] });
a1Pack({ id: 'ar-provinces', title: 'Argentina', country: 'Argentina', cont: 'South America', admin: 'Argentina', adm0: 'ARG', noun: 'province', nouns: 'provinces', names: { 'Ciudad de Buenos Aires': 'Buenos Aires City' } });
a1Pack({ id: 'cl-regions', title: 'Chile', country: 'Chile', cont: 'South America', admin: 'Chile', adm0: 'CHL', noun: 'region', nouns: 'regions', bbox: [-76, -56, -66, -17.5],
  names: { 'Región Metropolitana de Santiago': 'Santiago Metropolitan', 'Libertador General Bernardo O\'Higgins': 'O\'Higgins', 'Aisén del General Carlos Ibáñez del Campo': 'Aysén', 'Magallanes y Antártica Chilena': 'Magallanes' } });
a1Pack({ id: 'co-departments', title: 'Colombia', country: 'Colombia', cont: 'South America', admin: 'Colombia', adm0: 'COL', noun: 'department', nouns: 'departments', bbox: [-80, -4.5, -66.5, 13], names: { Bogota: 'Bogotá', 'San Andrés y Providencia': '' } });
a1Pack({ id: 'pe-regions', title: 'Peru', country: 'Peru', cont: 'South America', admin: 'Peru', adm0: 'PER', noun: 'region', nouns: 'regions', names: { Lima: 'Lima Region', 'Lima Province': 'Lima Province' } });
a1Pack({ id: 'au-states', title: 'Australia', country: 'Australia', cont: 'Oceania', admin: 'Australia', adm0: 'AUS', noun: 'state or territory', nouns: 'states & territories', bbox: [112, -44, 154, -10],
  filter: (p) => !['Jervis Bay Territory', 'Macquarie Island', 'Lord Howe Island'].includes(p.name) });
a1Pack({ id: 'nz-regions', title: 'New Zealand', country: 'New Zealand', cont: 'Oceania', admin: 'New Zealand', adm0: 'NZL', noun: 'region', nouns: 'regions', field: 'name_en', bbox: [166, -47.5, 178.8, -34.2],
  filter: (p) => ['North Island', 'South Island'].includes(p.region), group: regionOf, names: { 'Nelson City': 'Nelson', 'Marlborough District': 'Marlborough', 'Tasman District': 'Tasman', 'Gisborne District': 'Gisborne', 'Manawatu-Wanganui': 'Manawatū-Whanganui' } });
a1Pack({ id: 'cn-provinces', title: 'China', country: 'China', cont: 'Asia', admin: 'China', adm0: 'CHN', noun: 'province', nouns: 'provinces', field: 'name_en', filter: (p) => p.name !== 'Paracel Islands', group: regionOf });
a1Pack({ id: 'in-states', title: 'India', country: 'India', cont: 'Asia', admin: 'India', adm0: 'IND', noun: 'state or territory', nouns: 'states & territories', group: (p) => regionOf(p) || ({ Gujarat: 'West', Ladakh: 'North', Lakshadweep: 'South', 'Andaman and Nicobar': 'East' })[p.name] || '' });
a1Pack({ id: 'jp-prefectures', title: 'Japan', country: 'Japan', cont: 'Asia', admin: 'Japan', adm0: 'JPN', noun: 'prefecture', nouns: 'prefectures', group: (p) => regionOf(p) || 'Kanto', groupNoun: 'Region' });
a1Pack({ id: 'kr-provinces', title: 'South Korea', country: 'South Korea', cont: 'Asia', admin: 'South Korea', adm0: 'KOR', noun: 'province or city', nouns: 'provinces & cities' });
a1Pack({ id: 'id-provinces', title: 'Indonesia', country: 'Indonesia', cont: 'Asia', admin: 'Indonesia', adm0: 'IDN', noun: 'province', nouns: 'provinces', field: 'name_en' });
a1Pack({ id: 'th-provinces', title: 'Thailand', country: 'Thailand', cont: 'Asia', admin: 'Thailand', adm0: 'THA', noun: 'province', nouns: 'provinces', field: 'name_en', group: regionOf });
a1Pack({ id: 'ir-provinces', title: 'Iran', country: 'Iran', cont: 'Asia', admin: 'Iran', adm0: 'IRN', noun: 'province', nouns: 'provinces', field: 'name_en' });
a1Pack({ id: 'tr-provinces', title: 'Turkey', country: 'Turkey', cont: 'Asia', admin: 'Turkey', adm0: 'TUR', noun: 'province', nouns: 'provinces', field: 'name_en', names: { Zinguldak: 'Zonguldak', Kinkkale: 'Kırıkkale' } });
a1Pack({ id: 'sa-regions', title: 'Saudi Arabia', country: 'Saudi Arabia', cont: 'Asia', admin: 'Saudi Arabia', adm0: 'SAU', noun: 'region', nouns: 'regions', field: 'name_en', names: { 'Al Madinah': 'Medina', Makkah: 'Mecca', 'Ash Sharqiyah': 'Eastern Province', 'Al Quassim': 'Al-Qassim' } });
a1Pack({ id: 'pk-provinces', title: 'Pakistan', country: 'Pakistan', cont: 'Asia', admin: 'Pakistan', adm0: 'PAK', noun: 'province or territory', nouns: 'provinces & territories', field: 'name_en' });
a1Pack({ id: 'ru-subjects', title: 'Russia', country: 'Russia', cont: 'Europe', admin: 'Russia', adm0: 'RUS', noun: 'federal subject', nouns: 'federal subjects', field: 'name_en', interval: 6000,
  filter: (p) => !['Crimea', 'Sevastopol'].includes(p.name), group: regionOf,
  names: { Altay: 'Altai Krai', 'Gorno-Altay': 'Altai Republic', Moskovskaya: 'Moscow Oblast', Moskva: 'Moscow', Yevrey: 'Jewish Autonomous Oblast', 'Maga Buryatdan': 'Magadan', 'City of St. Petersburg': 'Saint Petersburg' } });
a1Pack({ id: 'de-states', title: 'Germany', country: 'Germany', cont: 'Europe', admin: 'Germany', adm0: 'DEU', noun: 'state', nouns: 'states' });
a1Pack({ id: 'fr-regions', title: 'France', country: 'France', cont: 'Europe', admin: 'France', adm0: 'FRA', noun: 'region', nouns: 'regions', bbox: [-5.2, 41.3, 9.6, 51.1],
  filter: (p) => p.type_en === 'Metropolitan department',
  key: (p) => ({ id: p.region, name: p.region, alt: ({ Bretagne: ['Brittany'], Normandie: ['Normandy'], Corse: ['Corsica'] })[p.region] }) });
a1Pack({ id: 'fr-departements', title: 'France (départements)', country: 'France', cont: 'Europe', admin: 'France', adm0: 'FRA', noun: 'département', nouns: 'départements', bbox: [-5.2, 41.3, 9.6, 51.1],
  filter: (p) => p.type_en === 'Metropolitan department', group: regionOf });
const IT_REG = { Piemonte: ['Piedmont'], Lombardia: ['Lombardy'], "Valle d'Aosta": ['Aosta Valley'], Toscana: ['Tuscany'], Sardegna: ['Sardinia'], Sicily: ['Sicilia'], Apulia: ['Puglia'] };
a1Pack({ id: 'it-regions', title: 'Italy', country: 'Italy', cont: 'Europe', admin: 'Italy', adm0: 'ITA', noun: 'region', nouns: 'regions',
  key: (p) => { const r = p.region; const en = IT_REG[r] && !['Sicily', 'Apulia'].includes(r) ? IT_REG[r][0] : r; return { id: r, name: en, alt: uniq([r, ...(IT_REG[r] || [])]).filter((a) => a !== en) }; } });
const ES_REG = { 'Foral de Navarra': 'Navarre', 'País Vasco': 'Basque Country', Cataluña: 'Catalonia', Andalucía: 'Andalusia', 'Castilla y León': 'Castile and León', Valenciana: 'Valencian Community', 'Canary Is.': 'Canary Islands', 'Islas Baleares': 'Balearic Islands', 'Castilla-La Mancha': 'Castilla–La Mancha' };
const ES_INSET = [{ within: [-19, 27, -13, 30], box: [0.0, 0.78, 0.3, 0.22] }];
a1Pack({ id: 'es-communities', title: 'Spain', country: 'Spain', cont: 'Europe', admin: 'Spain', adm0: 'ESP', noun: 'autonomous community', nouns: 'autonomous communities', insets: ES_INSET,
  key: (p) => ({ id: p.region, name: ES_REG[p.region] || p.region, alt: ES_REG[p.region] ? [p.region, p.region.replace('Is.', 'Islands')] : [] }) });
a1Pack({ id: 'es-provinces', title: 'Spain (provinces)', country: 'Spain', cont: 'Europe', admin: 'Spain', adm0: 'ESP', noun: 'province', nouns: 'provinces',
  filter: (p) => !['Ceuta', 'Melilla'].includes(p.name), group: (p) => ES_REG[p.region] || p.region,
  insets: ES_INSET });
a1Pack({ id: 'gb-countries', title: 'United Kingdom', country: 'United Kingdom', cont: 'Europe', admin: 'United Kingdom', adm0: 'GBR', noun: 'country', nouns: 'countries', bbox: [-8.7, 49.8, 2, 59.5],
  key: (p) => ({ id: p.geonunit, name: p.geonunit }) });
const IE_PROV = { Leinster: ['Carlow', 'Dublin', 'Kildare', 'Kilkenny', 'Laois', 'Longford', 'Louth', 'Meath', 'Offaly', 'Westmeath', 'Wexford', 'Wicklow'], Munster: ['Clare', 'Cork', 'Kerry', 'Limerick', 'Tipperary', 'Waterford'], Connacht: ['Galway', 'Leitrim', 'Mayo', 'Roscommon', 'Sligo'], Ulster: ['Cavan', 'Donegal', 'Monaghan'] };
const IE_MAP = { 'Dún Laoghaire–Rathdown': 'Dublin', Fingal: 'Dublin', 'South Dublin': 'Dublin', Laoighis: 'Laois', 'North Tipperary': 'Tipperary', 'South Tipperary': 'Tipperary' };
a1Pack({ id: 'ie-counties', title: 'Ireland', country: 'Ireland', cont: 'Europe', admin: 'Ireland', adm0: 'IRL', noun: 'county', nouns: 'counties', groupNoun: 'Province',
  key: (p) => { const n = IE_MAP[p.name] || p.name; return { id: n, name: n, group: Object.keys(IE_PROV).find((k) => IE_PROV[k].includes(n)) }; } });
a1Pack({ id: 'pl-voivodeships', title: 'Poland', country: 'Poland', cont: 'Europe', admin: 'Poland', adm0: 'POL', noun: 'voivodeship', nouns: 'voivodeships' });
a1Pack({ id: 'nl-provinces', title: 'Netherlands', country: 'Netherlands', cont: 'Europe', admin: 'Netherlands', adm0: 'NLD', noun: 'province', nouns: 'provinces', filter: (p) => p.type_en === 'Province' });
a1Pack({ id: 'ch-cantons', title: 'Switzerland', country: 'Switzerland', cont: 'Europe', admin: 'Switzerland', adm0: 'CHE', noun: 'canton', nouns: 'cantons', detail: 2 });
a1Pack({ id: 'at-states', title: 'Austria', country: 'Austria', cont: 'Europe', admin: 'Austria', adm0: 'AUT', noun: 'state', nouns: 'states' });
a1Pack({ id: 'se-counties', title: 'Sweden', country: 'Sweden', cont: 'Europe', admin: 'Sweden', adm0: 'SWE', noun: 'county', nouns: 'counties', names: { Orebro: 'Örebro' } });
a1Pack({ id: 'gr-regions', title: 'Greece', country: 'Greece', cont: 'Europe', admin: 'Greece', adm0: 'GRC', noun: 'region', nouns: 'regions', field: 'name_en', filter: (p) => p.name !== 'Ayion Oros', names: { 'Kentriki Makedonia': 'Central Macedonia', Thessalia: 'Thessaly' } });
a1Pack({ id: 'ua-oblasts', title: 'Ukraine', country: 'Ukraine', cont: 'Europe', admins: ['Ukraine', 'Russia'], adm0: 'UKR', noun: 'oblast', nouns: 'oblasts', field: 'name_en',
  filter: (p) => p.admin === 'Ukraine' || ['Crimea', 'Sevastopol'].includes(p.name), names: { Kiev: 'Kyiv Oblast', 'Kiev City': 'Kyiv', Crimea: 'Crimea', Kherson: 'Kherson' } });
a1Pack({ id: 'eg-governorates', title: 'Egypt', country: 'Egypt', cont: 'Africa', admin: 'Egypt', adm0: 'EGY', noun: 'governorate', nouns: 'governorates', field: 'name_en' });
a1Pack({ id: 'ng-states', title: 'Nigeria', country: 'Nigeria', cont: 'Africa', admin: 'Nigeria', adm0: 'NGA', noun: 'state', nouns: 'states', names: { Nassarawa: 'Nasarawa' } });
a1Pack({ id: 'za-provinces', title: 'South Africa', country: 'South Africa', cont: 'Africa', admin: 'South Africa', adm0: 'ZAF', noun: 'province', nouns: 'provinces', bbox: [16, -35, 33, -22] });

// United States
const STATE_NAMES = Object.fromEntries(US_STATES.map((f) => [f.id, f.properties.name]));
const FIFTY = US_STATES.filter((f) => +f.id <= 56 && f.id !== '11');
const US_REGION = {
  Northeast: ['09', '23', '25', '33', '44', '50', '34', '36', '42'], Midwest: ['17', '18', '26', '39', '55', '19', '20', '27', '29', '31', '38', '46'],
  South: ['10', '11', '12', '13', '24', '37', '45', '51', '54', '01', '21', '28', '47', '05', '22', '40', '48'], West: ['04', '08', '16', '30', '32', '35', '49', '56', '02', '06', '15', '41', '53'],
};
const usRegion = (fips) => Object.keys(US_REGION).find((k) => US_REGION[k].includes(fips));
add({
  id: 'us-states', title: 'United States', country: 'United States', cont: 'North America', noun: 'state', nouns: 'states', proj: 'albersUsa', groupNoun: 'Region', lakes: false, extentKm: 4500,
  make() { return { places: FIFTY.map((f) => ({ pid: f.id, name: f.properties.name, group: usRegion(f.id), geometry: f.geometry })) }; },
});
function usContext(fips) {
  const can = A1().filter((f) => f.properties.admin === 'Canada').map((f) => ({ pid: f.properties.adm1_code, name: f.properties.name, lbl: true, geometry: f.geometry }));
  const mex = countries().filter((c) => ['MEX', 'CUB', 'BHS'].includes(c.id)).map((c) => ({ pid: c.id, name: c.name, lbl: true, geometry: c.geometry }));
  return [...US_STATES.filter((f) => f.id !== fips).map((f) => ({ pid: 's' + f.id, name: f.properties.name, lbl: true, geometry: f.geometry })), ...can, ...mex];
}
const STATE_ABBR = { '01': 'al', '02': 'ak', '04': 'az', '05': 'ar', '06': 'ca', '08': 'co', '09': 'ct', '10': 'de', '12': 'fl', '13': 'ga', '15': 'hi', '16': 'id', '17': 'il', '18': 'in', '19': 'ia', '20': 'ks', '21': 'ky', '22': 'la', '23': 'me', '24': 'md', '25': 'ma', '26': 'mi', '27': 'mn', '28': 'ms', '29': 'mo', '30': 'mt', '31': 'ne', '32': 'nv', '33': 'nh', '34': 'nj', '35': 'nm', '36': 'ny', '37': 'nc', '38': 'nd', '39': 'oh', '40': 'ok', '41': 'or', '42': 'pa', '44': 'ri', '45': 'sc', '46': 'sd', '47': 'tn', '48': 'tx', '49': 'ut', '50': 'vt', '51': 'va', '53': 'wa', '54': 'wv', '55': 'wi', '56': 'wy' };
const COUNTY_WORD = { '22': ['parish', 'parishes'], '02': ['borough or census area', 'boroughs & census areas'] };
for (const st of FIFTY) {
  const fips = st.id, ab = STATE_ABBR[fips];
  const [noun, nouns] = COUNTY_WORD[fips] || ['county', 'counties'];
  add({
    id: `us-${ab}-counties`, title: STATE_NAMES[fips], state: fips, noun, nouns, interval: fips === '02' ? 2500 : undefined,
    make() {
      const cs = US_COUNTIES.filter((f) => f.id.slice(0, 2) === fips && f.geometry);
      const cnt = {};
      cs.forEach((f) => { cnt[f.properties.name] = (cnt[f.properties.name] || 0) + 1; });
      return {
        places: cs.map((f) => {
          let nm = f.properties.name;
          if (cnt[nm] > 1) nm += +f.id.slice(2) >= 500 ? ' (city)' : (fips === '22' ? ' Parish' : ' County');
          return { pid: f.id, name: nm, alt: [f.properties.name + ' County'], geometry: f.geometry };
        }), context: usContext(fips),
      };
    },
  });
}
// New England towns (Census county subdivisions)
const TOWN_STATES = { '50': 'vt', '33': 'nh', '25': 'ma', '23': 'me', '09': 'ct', '44': 'ri' };
const townCache = {};
async function readCousub(fips) {
  if (townCache[fips]) return townCache[fips];
  const zip = path.join(SRC, `cb_2023_${fips}_cousub_500k.zip`).replace(/\\/g, '/');
  const out = await mapshaper.applyCommands(`-i "${zip}" -o out.json format=geojson`);
  return (townCache[fips] = JSON.parse(out['out.json']).features);
}
function townName(p, all) {
  const kind = p.NAMELSAD.slice(p.NAME.length).trim(); // "town", "city", "gore", "grant", "plantation", "UT" ...
  let nm = p.NAME;
  if (['gore', 'grant', 'location', 'purchase', 'plantation', 'township'].includes(kind)) nm = p.NAME + ' ' + kind[0].toUpperCase() + kind.slice(1);
  else if (all.filter((q) => q.NAME === p.NAME).length > 1) nm = p.NAME + ' ' + (kind ? kind[0].toUpperCase() + kind.slice(1) : '');
  return nm.trim();
}
const TOWN_ALT = { Enosburgh: ['Enosburg'], 'Buels Gore': ["Buel's Gore"], Alburgh: ['Alburg'] };
for (const [fips, ab] of Object.entries(TOWN_STATES)) {
  add({
    id: `us-${ab}-towns`, title: STATE_NAMES[fips], state: fips, noun: 'town', nouns: 'towns & cities', groupNoun: fips === '09' ? 'Planning region' : 'County',
    async make() {
      const fs1 = (await readCousub(fips)).filter((f) => f.geometry && !/not defined/i.test(f.properties.NAME));
      const props = fs1.map((f) => f.properties);
      return {
        places: fs1.map((f) => {
          const p = f.properties;
          const nm = townName(p, props);
          return { pid: p.GEOID, name: nm, alt: uniq([p.NAME, p.NAMELSAD, ...(TOWN_ALT[nm] || [])]).filter((a) => a !== nm), group: p.NAMELSADCO.replace(/ County$/, ''), geometry: f.geometry };
        }), context: usContext(fips),
      };
    },
  });
}

// ---------- roads (Census TIGER primary + secondary roads, one pack per state) ----------
// A road pack's places are routes (I-89, US 7, VT 100) drawn as lines, with
// nb = routes they meet, g = 0 major / 1 other. It also carries the state's
// towns (New England) or cities (elsewhere) with the routes through each, for Road Trip.
const ROUTE_SKIP = /farm|ranch|\bfm\b|\brm\b|loop|spur|park|beltway|toll|tpke|turnpike|express|frontage|access|conn/i;
function routeOf(p, ab) {
  const full = p.FULLNAME || '';
  const m = full.match(/(\d+)([A-Za-z])?\b\s*(.*)$/);
  if (!m) return null;
  const rest = m[3].trim();
  if (rest && !/^(N|S|E|W|North|South|East|West|NB|SB|EB|WB)$/i.test(rest)) return null; // Bus, Byp, Alt, Truck...
  const pre = full.slice(0, m.index);
  if (ROUTE_SKIP.test(pre)) return null;
  const num = m[1] + (m[2] || '').toUpperCase();
  const st = STATE_NAMES_BY_AB[ab];
  if (p.RTTYP === 'I') return { key: 'I' + num, type: 'I', num, name: 'I-' + num, alt: ['I ' + num, 'Interstate ' + num, 'Interstate Highway ' + num, num] };
  if (p.RTTYP === 'U') return { key: 'U' + num, type: 'U', num, name: 'US ' + num, alt: ['U.S. ' + num, 'US Route ' + num, 'US Highway ' + num, 'Route ' + num, 'Highway ' + num, num] };
  if (p.RTTYP === 'S') return { key: 'S' + num, type: 'S', num, name: ab.toUpperCase() + ' ' + num, alt: [st + ' ' + num, st + ' Route ' + num, 'Route ' + num, 'State Route ' + num, 'Highway ' + num, 'Rte ' + num, num] };
  return null;
}
let STATE_NAMES_BY_AB = null;
async function readRoads(fips) {
  const zip = path.join(SRC, 'roads', `tl_2023_${fips}_prisecroads.zip`).replace(/\\/g, '/');
  const out = await mapshaper.applyCommands(`-i "${zip}" -filter "RTTYP=='I'||RTTYP=='U'||RTTYP=='S'" -o out.json format=geojson`);
  return JSON.parse(out['out.json']).features;
}
let _places = null;
const POP_PLACES = () => _places || (_places = readJSON('ne_10m_populated_places.geojson').features);

function lineLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
    for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  return out;
}
function pointAlong(pts, frac) {
  let target = lineLen(pts) * frac;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (target <= d) { const k = d ? target / d : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; }
    target -= d;
  }
  return pts[pts.length - 1];
}

async function buildRoadPack(cfg) {
  const { fips, ab } = cfg;
  if (!STATE_NAMES_BY_AB) STATE_NAMES_BY_AB = Object.fromEntries(Object.entries(STATE_ABBR).map(([f, a]) => [a, STATE_NAMES[f]]));
  const stateF = US_STATES.find((f) => f.id === fips);
  // 1. group segments into routes
  const RIV = cfg.kind === 'rivers';
  const routes = new Map();
  if (RIV) for (const r of riverRoutes(cfg)) routes.set(r.key, r);
  else for (const f of await readRoads(fips)) {
    const r = routeOf(f.properties, ab);
    if (!r || !f.geometry) continue;
    if (!routes.has(r.key)) routes.set(r.key, { ...r, lines: [] });
    const g = f.geometry;
    if (g.type === 'LineString') routes.get(r.key).lines.push(g.coordinates);
    else if (g.type === 'MultiLineString') routes.get(r.key).lines.push(...g.coordinates);
  }
  // 2. simplify, project (fit to the state)
  const extentKm = naiveExtentKm([stateF]);
  const interval = extentKm * 1000 / W * 6;
  const rfeats = Array.from(routes.values()).map((r) => ({ type: 'Feature', properties: { pid: r.key }, geometry: { type: 'MultiLineString', coordinates: r.lines } }));
  const out = await mapshaper.applyCommands(`-i in.json -simplify interval=${Math.round(interval)} keep-shapes -o out.json format=geojson`, { 'in.json': { type: 'FeatureCollection', features: rfeats } });
  const simple = new Map(JSON.parse(out['out.json']).features.map((f) => [f.properties.pid, f]));
  const fitObj = stateF;
  const proj = fips === '02' ? d3.geoAzimuthalEqualArea().rotate([152, -62]) : makeProjection({}, fitObj);
  proj.fitSize([1000, 1000], fitObj);
  const b0 = d3.geoPath(proj).bounds(fitObj);
  const aspect = Math.min(1.5, Math.max(0.55, (b0[1][1] - b0[0][1]) / (b0[1][0] - b0[0][0])));
  const H = Math.round(W * aspect);
  const pad = W * 0.02;
  proj.fitExtent([[pad, pad], [W - pad, H - pad]], fitObj);
  const TIGHT = [[-W * 0.01, -W * 0.01], [W * 1.01, H + W * 0.01]], WIDE = [[-W * 0.3, -W * 0.3], [W * 1.3, H + W * 0.3]];
  proj.clipExtent(TIGHT);
  const gp = d3.geoPath(proj);
  const mPerUnit = extentKm * 1000 / W;

  let R = [];
  for (const r of routes.values()) {
    const f = simple.get(r.key);
    if (!f || !f.geometry) continue;
    const pieces = cleanLines(rings(gp, f)).filter((l) => lineLen(l) > 3);
    const len = pieces.reduce((s, l) => s + lineLen(l), 0);
    if (!pieces.length || len < W * 0.015) continue; // drop stubs
    const longest = pieces.reduce((a, b) => (lineLen(b) > lineLen(a) ? b : a));
    const [lx, ly] = pointAlong(longest, 0.5);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pieces.forEach((l) => l.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
    R.push({ ...r, pieces, len, lx: Math.round(lx), ly: Math.round(ly), bb: [x0, y0, x1, y1].map(Math.round), dense: pieces.flatMap((l) => densify(l, 12)) });
  }
  // keep the 90 longest; major = interstates, US routes and the longest state routes
  R.sort((a, b) => b.len - a.len);
  if (RIV) {
    // rivers: every one long enough, in three sets by length inside the state
    R.forEach((r) => { r.g = r.km >= 40 ? 0 : r.km >= 20 ? 1 : 2; });
    R.sort((a, b) => a.g - b.g || b.km - a.km);
  } else {
  R = R.slice(0, 90);
  const nMajor = Math.max(10, Math.round(R.length * 0.35));
  let stateRank = 0;
  const nIU = R.filter((r) => r.type !== 'S').length;
  R.forEach((r) => { r.g = r.type !== 'S' ? 0 : (stateRank++ < nMajor - nIU ? 0 : 1); });
  const order = { I: 0, U: 1, S: 2 };
  R.sort((a, b) => order[a.type] - order[b.type] || parseInt(a.num, 10) - parseInt(b.num, 10) || a.num.localeCompare(b.num));
  }

  // 3. which routes meet (within ~600 m: a junction in a village is often filed under its street name)
  const tol = Math.max(RIV ? 6 : 10, (RIV ? 300 : 600) / mPerUnit), cell = tol * 2;
  const grid = new Map();
  R.forEach((r, i) => r.dense.forEach(([x, y]) => {
    const k = Math.floor(x / cell) + ',' + Math.floor(y / cell);
    if (!grid.has(k)) grid.set(k, []);
    const a = grid.get(k);
    if (a[a.length - 1] !== i || true) a.push([i, x, y]);
  }));
  const nb = R.map(() => new Set());
  for (const [k, list] of grid) {
    const [cx, cy] = k.split(',').map(Number);
    for (let dx = 0; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy < 0) continue;
      const other = dx || dy ? grid.get((cx + dx) + ',' + (cy + dy)) : list;
      if (!other) continue;
      for (const [i, x, y] of list) for (const [j, u, v] of other) {
        if (i === j || nb[i].has(j)) continue;
        if ((x - u) ** 2 + (y - v) ** 2 < tol * tol) { nb[i].add(j); nb[j].add(i); }
      }
    }
  }

  // 4. towns (New England) or cities, and the routes through each
  const near = (x, y, d) => {
    const s = new Set();
    const c0 = Math.floor((x - d) / cell), c1 = Math.floor((x + d) / cell), r0 = Math.floor((y - d) / cell), r1 = Math.floor((y + d) / cell);
    for (let a = c0; a <= c1; a++) for (let b = r0; b <= r1; b++) for (const [i, u, v] of grid.get(a + ',' + b) || []) if ((x - u) ** 2 + (y - v) ** 2 < d * d) s.add(i);
    return s;
  };
  const towns = [];
  let basePolys = [];
  if (TOWN_STATES[fips]) {
    const fs1 = (await readCousub(fips)).filter((f) => f.geometry && !/not defined/i.test(f.properties.NAME));
    const props = fs1.map((f) => f.properties);
    // through mapshaper like the town maps, which also settles each ring's winding for d3
    const { topo: tt, obj: to } = await simplifyTopo(fs1.map((f) => feat(f.geometry, { pid: f.properties.GEOID, name: '', alt: '', group: '', role: 'q', lbl: 0 })), interval, true);
    const byId = new Map(to.geometries.filter((g) => g.type).map((g) => [g.properties.pid, topojson.feature(tt, g)]));
    for (const f of fs1) {
      const tf = byId.get(f.properties.GEOID);
      if (!tf) continue;
      const rs = cleanRings(rings(gp, tf), 1).filter((r) => Math.abs(ringArea(r)) < W * H * 0.3);
      if (!rs.length) continue;
      basePolys.push(...rs);
      const info = shapeInfo(rs);
      const inside = new Set();
      R.forEach((r, i) => {
        if (r.bb[2] < info.bb[0] || r.bb[0] > info.bb[2] || r.bb[3] < info.bb[1] || r.bb[1] > info.bb[3]) return;
        if (r.dense.some((p) => p[0] >= info.bb[0] && p[0] <= info.bb[2] && p[1] >= info.bb[1] && p[1] <= info.bb[3] && rs.some((ring) => pointInRing(p, ring)))) inside.add(i);
      });
      towns.push({ n: townName(f.properties, props), lx: info.lx, ly: info.ly, a: info.a, r: Array.from(inside), co: f.properties.NAMELSADCO.replace(/ County$/, '') });
    }
  } else {
    const st = STATE_NAMES[fips];
    const pp = POP_PLACES().filter((f) => f.properties.ADM0_A3 === 'USA' && f.properties.ADM1NAME === st);
    for (const f of pp) {
      const xy = proj(f.geometry.coordinates);
      if (!xy) continue;
      const [x, y] = xy;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      towns.push({ n: f.properties.NAME.replace(/\s+/g, ' ').replace(/^Ft\.? /, 'Fort ').replace(/^Pt\.? /, 'Point ').replace(/^Mt\.? /, 'Mount '), lx: Math.round(x), ly: Math.round(y), a: f.properties.POP_MAX || 0, r: Array.from(near(x, y, Math.max(tol * 1.5, 2500 / mPerUnit))) });
    }
    const cs = US_COUNTIES.filter((f) => f.id.slice(0, 2) === fips && f.geometry);
    cs.forEach((f) => basePolys.push(...cleanRings(rings(gp, f), 1).filter((r) => Math.abs(ringArea(r)) < W * H * 0.3)));
  }
  const stOutline = cleanRings(rings(gp, stateF), W * 0.5);

  // 5. context (neighbours) and lakes, drawn wider than the map
  proj.clipExtent(WIDE);
  const ctxOut = [];
  const ctxSrc = usContext(fips);
  const { topo: ct, obj: co } = await simplifyTopo(ctxSrc.map((c, k) => feat(c.geometry, { pid: 'k' + k, name: '', alt: '', group: '', role: 'c', lbl: 0 })), interval * 1.5, true);
  const ctxById = new Map(co.geometries.filter((g) => g.type).map((g) => [g.properties.pid, topojson.feature(ct, g)]));
  for (const [k, c] of ctxSrc.entries()) {
    const f = ctxById.get('k' + k);
    if (!f) continue;
    const rs = cleanRings(rings(gp, f), W * 0.02).filter((q) => Math.abs(ringArea(q)) < W * H * 2);
    if (!rs.length) continue;
    const o = { d: encode(rs, true) };
    proj.clipExtent(TIGHT);
    const rt = cleanRings(rings(gp, f), W * 0.02).filter((q) => Math.abs(ringArea(q)) < W * H * 0.9);
    proj.clipExtent(WIDE);
    if (rt.length) { const info = shapeInfo(rt); if (info.a > (W * 0.03) ** 2) { o.n = c.name; o.lx = info.lx; o.ly = info.ly; o.a = info.a; } }
    ctxOut.push(o);
  }
  let lakes;
  if (RIV) lakes = await fineLakes(ab, gp, interval, H);
  else {
    const { topo: lt, obj: lo } = await simplifyTopo(LAKES().map((f) => feat(f.geometry, {})), interval * 1.5, false);
    lakes = encode(cleanRings(rings(gp, topojson.feature(lt, lo)), (W * 0.004) ** 2).filter((r) => Math.abs(ringArea(r)) < W * H * 0.3), true);
  }
  if (RIV) {
    // same name twice (two Black Rivers): add the county most of it runs through
    const cnt = {};
    R.forEach((r) => { cnt[r.name] = (cnt[r.name] || 0) + 1; });
    R.forEach((r, i) => {
      if (cnt[r.name] < 2) return;
      const by = {};
      towns.forEach((t) => { if (t.r.includes(i) && t.co) by[t.co] = (by[t.co] || 0) + 1; });
      const co = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
      if (co) { r.alt = uniq([...(r.alt || []), r.name]); r.name = r.name + ' (' + co[0] + ')'; }
    });
    // still twins inside one county: name the town instead
    const cnt2 = {};
    R.forEach((r) => { cnt2[r.name] = (cnt2[r.name] || 0) + 1; });
    R.forEach((r, i) => {
      if (cnt2[r.name] < 2) return;
      const [mx, my] = [r.lx, r.ly];
      const tn = towns.filter((t) => t.r.includes(i)).sort((a, b) => Math.hypot(a.lx - mx, a.ly - my) - Math.hypot(b.lx - mx, b.ly - my))[0];
      if (tn) r.name = r.name.replace(/ \([^)]*\)$/, '') + ' (' + tn.n + ')';
    });
    const seen = new Set();
    R.forEach((r) => { if (seen.has(r.name)) console.warn('  ! duplicate name', cfg.id, r.name); seen.add(r.name); });
  }
  const groups = RIV ? ['Major rivers', 'Rivers', 'Streams & brooks'].slice(0, Math.max(...R.map((r) => r.g)) + 1)
    : R.some((r) => r.g === 1) ? ['Major roads', 'Other state routes'] : ['Major roads'];
  const pack = {
    id: cfg.id, kind: cfg.kind, title: cfg.title, noun: cfg.noun, nouns: cfg.nouns, groupNoun: 'Set', w: W, h: H, groups,
    places: R.map((r, i) => ({ n: r.name, alt: r.alt, d: encode(r.pieces, false), lx: r.lx, ly: r.ly, a: Math.round(r.len), bb: r.bb, nb: Array.from(nb[i]).sort((a, b) => a - b), nr: [], g: r.g, ...(RIV ? { km: Math.round(r.km) } : {}) })),
    towns: towns.sort((a, b) => b.a - a.a).map((t) => ({ n: t.n, lx: t.lx, ly: t.ly, r: t.r })),
    base: encode(basePolys, true), outline: encode(stOutline, true), ctx: ctxOut, lakes, lines: '',
  };
  const json = JSON.stringify(pack);
  fs.writeFileSync(path.join(OUT, cfg.id + '.json'), json);
  console.log(`${cfg.id.padEnd(22)} ${String(R.length).padStart(4)} ${cfg.nouns} ${String(R.filter((r) => r.g === 0).length).padStart(3)} major ${String(towns.length).padStart(4)} towns ${(json.length / 1024).toFixed(0).padStart(5)} KB  ${towns.filter((t) => !t.r.length).length} towns off-road`);
  return { id: cfg.id, title: cfg.title, count: R.length, noun: cfg.noun, nouns: cfg.nouns, kb: Math.round(json.length / 1024) };
}

// ---------- physical geography per state: rivers (lines), and cities, peaks, lakes ("spots" on the town map) ----------
// Sources are the small GeoJSON files in sources/derived, made by build/prep/prep-state.py.
const DERIVED = path.join(SRC, 'derived');
const hasDerived = (ab, what) => fs.existsSync(path.join(DERIVED, `us-${ab}-${what}.geojson`));
const derivedCache = {};
const derived = (ab, what) => derivedCache[ab + what] || (derivedCache[ab + what] = JSON.parse(fs.readFileSync(path.join(DERIVED, `us-${ab}-${what}.geojson`), 'utf8')).features);
const shortSaint = (n) => n.replace(/^Saint /, 'St. ').replace(/ Saint /g, ' St. ');
const RIVER_ALT = { 'Batten Kill': ['Battenkill', 'Battenkill River'] };
function riverRoutes(cfg) {
  return derived(cfg.ab, 'rivers').filter((f) => f.properties.km >= (cfg.minKm || 12) && !/^(Ruisseau|Rivière)/.test(f.properties.name)).map((f) => {
    const nm = f.properties.name;
    const alt = uniq([...(RIVER_ALT[nm] || []), / River$/.test(nm) ? nm.replace(/ River$/, '') : null, nm.replace(/^(First|Second|Third|North|South|East|West|Middle) Branch (.*)$/, '$2 $1 Branch') !== nm ? nm.replace(/^(\w+) Branch (.*)$/, '$1 Branch of the $2') : null]);
    const g = f.geometry;
    return { key: 'R' + f.properties.gnis_id, type: 'R', num: '', name: nm, alt, km: f.properties.km, lines: g.type === 'LineString' ? [g.coordinates] : g.coordinates };
  });
}
// Lakes drawn behind a state map, from the hydrography extract (finer than Natural Earth's); `skip` leaves out the ones being quizzed.
async function fineLakes(ab, gp, interval, H, skip) {
  const fsL = derived(ab, 'lakes').filter((f) => !(skip && skip.has(f.properties.gnis_id)) && f.properties.km2 >= 0.3);
  const { topo: lt, obj: lo } = await simplifyTopo(fsL.map((f) => feat(f.geometry, {})), interval, false);
  return encode(cleanRings(rings(gp, topojson.feature(lt, lo)), (W * 0.0015) ** 2).filter((r) => Math.abs(ringArea(r)) < W * H * 0.3), true);
}
// Projection and frame for a state, the same fit as its road and town maps.
function stateFrame(fips) {
  const stateF = US_STATES.find((f) => f.id === fips);
  const extentKm = naiveExtentKm([stateF]);
  const interval = extentKm * 1000 / W * 6;
  const proj = fips === '02' ? d3.geoAzimuthalEqualArea().rotate([152, -62]) : makeProjection({}, stateF);
  proj.fitSize([1000, 1000], stateF);
  const b0 = d3.geoPath(proj).bounds(stateF);
  const aspect = Math.min(1.5, Math.max(0.55, (b0[1][1] - b0[0][1]) / (b0[1][0] - b0[0][0])));
  const H = Math.round(W * aspect);
  const pad = W * 0.02;
  proj.fitExtent([[pad, pad], [W - pad, H - pad]], stateF);
  const TIGHT = [[-W * 0.01, -W * 0.01], [W * 1.01, H + W * 0.01]], WIDE = [[-W * 0.3, -W * 0.3], [W * 1.3, H + W * 0.3]];
  proj.clipExtent(TIGHT);
  return { stateF, extentKm, interval, proj, gp: d3.geoPath(proj), H, TIGHT, WIDE, mPerUnit: extentKm * 1000 / W };
}

// A "spots" pack: things to find on the state's town map. Each place is a point (city, village, peak)
// or a small shape (lake). cfg.make() returns [{ id, name, alt, group, rank, geometry, extra }].
async function buildSpotPack(cfg) {
  const { fips, ab } = cfg;
  const F = stateFrame(fips);
  const { proj, gp, H, interval } = F;
  const items = await cfg.make();
  const pad = W * 0.012;
  let P = [];
  for (const it of items) {
    const g = it.geometry;
    let o;
    if (g.type === 'Point') {
      const xy = proj(g.coordinates);
      if (!xy) continue;
      const x = Math.round(xy[0]), y = Math.round(xy[1]);
      if (x < 0 || x > W || y < 0 || y > H) continue;
      o = { d: `M${x - 2} ${y - 2}l4 0 0 4-4 0z`, lx: x, ly: y, bb: [x - pad, y - pad, x + pad, y + pad].map(Math.round), m: 1 };
    } else {
      const out = await mapshaper.applyCommands(`-i in.json -simplify interval=${Math.round(interval / 3)} keep-shapes -o out.json format=geojson`, { 'in.json': { type: 'FeatureCollection', features: [feat(g, { k: 1 })] } });
      const sf = JSON.parse(out['out.json']).features[0];
      proj.clipExtent(F.WIDE);
      const rs = cleanRings(rings(gp, { type: 'Feature', geometry: rewind(sf.geometry) }), 0).filter((r) => Math.abs(ringArea(r)) < W * H * 0.3);
      proj.clipExtent(F.TIGHT);
      if (!rs.length) continue;
      const info = shapeInfo(rs);
      const lx = Math.min(W, Math.max(0, info.lx)), ly = Math.min(H, Math.max(0, info.ly));
      const bb = [Math.min(info.bb[0], lx - pad), Math.min(info.bb[1], ly - pad), Math.max(info.bb[2], lx + pad), Math.max(info.bb[3], ly + pad)].map(Math.round);
      o = { d: encode(rs, true), lx, ly, bb, shape: 1 };
      if (Math.max(info.bb[2] - info.bb[0], info.bb[3] - info.bb[1]) < W * 0.02) o.m = 1;
    }
    P.push({ ...o, n: it.name, alt: it.alt || [], group: it.group || '', rank: it.rank || 0, where: it.where || '', extra: it.extra || {} });
  }
  // unique names: add the town (or county) to twins
  const cnt = {};
  P.forEach((p) => { cnt[p.n] = (cnt[p.n] || 0) + 1; });
  P.forEach((p) => { if (cnt[p.n] > 1 && p.where) { p.alt = uniq([...p.alt, p.n]); p.n = p.n + ' (' + p.where + ')'; } });
  P.sort((a, b) => b.rank - a.rank);
  const seen = new Set();
  P = P.filter((p) => { if (seen.has(p.n)) { console.warn('  ! dropped duplicate', cfg.id, p.n); return false; } seen.add(p.n); return true; });
  let groups = uniq(P.map((p) => p.group));
  if (cfg.groupOrder) groups = cfg.groupOrder.filter((g) => groups.includes(g)); else groups.sort();
  P.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || b.rank - a.rank || a.n.localeCompare(b.n));

  // backdrop: town boundaries, the state's outline, neighbours, lakes and the bigger rivers
  let basePolys = [];
  if (TOWN_STATES[fips]) {
    const fs1 = (await readCousub(fips)).filter((f) => f.geometry && !/not defined/i.test(f.properties.NAME));
    const { topo: tt, obj: to } = await simplifyTopo(fs1.map((f) => feat(f.geometry, { pid: f.properties.GEOID, name: '', alt: '', group: '', role: 'q', lbl: 0 })), interval, true);
    for (const g of to.geometries.filter((g) => g.type)) basePolys.push(...cleanRings(rings(gp, topojson.feature(tt, g)), 1).filter((r) => Math.abs(ringArea(r)) < W * H * 0.3));
  } else {
    US_COUNTIES.filter((f) => f.id.slice(0, 2) === fips && f.geometry).forEach((f) => basePolys.push(...cleanRings(rings(gp, f), 1).filter((r) => Math.abs(ringArea(r)) < W * H * 0.3)));
  }
  const stOutline = cleanRings(rings(gp, F.stateF), W * 0.5);
  let rivers = '';
  if (hasDerived(ab, 'rivers')) {
    const big = derived(ab, 'rivers').filter((f) => f.properties.km >= (cfg.riverKm || 30) && !/^(Ruisseau|Rivière)/.test(f.properties.name));
    const out = await mapshaper.applyCommands(`-i in.json -simplify interval=${Math.round(interval)} keep-shapes -o out.json format=geojson`, { 'in.json': { type: 'FeatureCollection', features: big.map((f, k) => ({ type: 'Feature', properties: { k }, geometry: f.geometry })) } });
    rivers = encode(JSON.parse(out['out.json']).features.flatMap((f) => cleanLines(rings(gp, f))).filter((l) => lineLen(l) > 3), false);
  }
  const lakes = hasDerived(ab, 'lakes') ? await fineLakes(ab, gp, interval, H, cfg.skipLakes) : '';
  const ctxOut = await stateContext(fips, F);

  const pack = {
    id: cfg.id, kind: 'points', sub: cfg.sub, title: cfg.title, noun: cfg.noun, nouns: cfg.nouns, groupNoun: cfg.groupNoun || 'County', w: W, h: H, groups,
    places: P.map((p) => {
      const o = { n: p.n, d: p.d, lx: p.lx, ly: p.ly, a: p.rank, bb: p.bb, nb: [], nr: [], ...p.extra };
      if (p.alt.length) o.alt = p.alt;
      if (groups.length) o.g = groups.indexOf(p.group);
      if (p.m) o.m = 1;
      if (p.shape) o.s = 1;
      return o;
    }),
    base: encode(basePolys, true), outline: encode(stOutline, true), ctx: ctxOut, lakes, rivers, lines: '',
  };
  const json = JSON.stringify(pack);
  fs.writeFileSync(path.join(OUT, cfg.id + '.json'), json);
  console.log(`${cfg.id.padEnd(22)} ${String(P.length).padStart(4)} ${cfg.nouns.padEnd(18)} ${String(groups.length).padStart(3)} groups ${(json.length / 1024).toFixed(0).padStart(5)} KB`);
}
// Neighbouring states (and countries) around a state map, drawn wider than the map and named where they show.
async function stateContext(fips, F) {
  const { proj, gp, interval, H } = F;
  proj.clipExtent(F.WIDE);
  const ctxOut = [];
  const ctxSrc = usContext(fips);
  const { topo: ct, obj: co } = await simplifyTopo(ctxSrc.map((c, k) => feat(c.geometry, { pid: 'k' + k, name: '', alt: '', group: '', role: 'c', lbl: 0 })), interval * 1.5, true);
  const ctxById = new Map(co.geometries.filter((g) => g.type).map((g) => [g.properties.pid, topojson.feature(ct, g)]));
  for (const [k, c] of ctxSrc.entries()) {
    const f = ctxById.get('k' + k);
    if (!f) continue;
    const rs = cleanRings(rings(gp, f), W * 0.02).filter((q) => Math.abs(ringArea(q)) < W * H * 2);
    if (!rs.length) continue;
    const o = { d: encode(rs, true) };
    proj.clipExtent(F.TIGHT);
    const rt = cleanRings(rings(gp, f), W * 0.02).filter((q) => Math.abs(ringArea(q)) < W * H * 0.9);
    proj.clipExtent(F.WIDE);
    if (rt.length) { const info = shapeInfo(rt); if (info.a > (W * 0.03) ** 2) { o.n = c.name; o.lx = info.lx; o.ly = info.ly; o.a = info.a; } }
    ctxOut.push(o);
  }
  proj.clipExtent(F.TIGHT);
  return ctxOut;
}

const TIER_RANK = { city: 4, village: 3, cdp: 2, hamlet: 1 };
const PLACE_ALT = { 'St. Johnsbury': ['St. J', 'St Johnsbury'] };
const PEAK_BANDS = [[4000, '4,000-footers'], [3500, '3,500 to 4,000 ft'], [3000, '3,000 to 3,500 ft'], [2500, '2,500 to 3,000 ft'], [0, 'Landmark hills']];
for (const st of FIFTY) {
  const ab = STATE_ABBR[st.id], fips = st.id, title = STATE_NAMES[st.id];
  if (hasDerived(ab, 'rivers')) add({ id: `us-${ab}-rivers`, title, state: fips, kind: 'rivers', fips, ab, noun: 'river', nouns: 'rivers', minKm: 12 });
  if (hasDerived(ab, 'places')) {
    const mk = (tiers) => () => derived(ab, 'places').filter((f) => tiers.includes(f.properties.tier)).map((f) => {
      const p = f.properties, nm = shortSaint(p.name);
      return { id: p.gnis_id, name: nm, alt: uniq([nm !== p.name ? p.name : null, ...(PLACE_ALT[nm] || [])]), group: p.county, where: p.town && p.town !== p.name ? p.town : p.county, rank: TIER_RANK[p.tier], geometry: f.geometry, extra: { k: p.tier, ...(p.town && p.town !== p.name ? { t: p.town } : {}) } };
    });
    add({ id: `us-${ab}-cities`, title, state: fips, kind: 'points', sub: 'city', fips, ab, noun: 'place', nouns: 'cities & villages', make: mk(['city', 'village', 'cdp']) });
    add({ id: `us-${ab}-hamlets`, title, state: fips, kind: 'points', sub: 'hamlet', fips, ab, noun: 'place', nouns: 'hamlets & corners', make: mk(['hamlet']) });
  }
  if (hasDerived(ab, 'summits')) add({
    id: `us-${ab}-peaks`, title, state: fips, kind: 'points', sub: 'peak', fips, ab, noun: 'peak', nouns: 'mountains', groupNoun: 'Height', groupOrder: PEAK_BANDS.map((b) => b[1]),
    make() {
      // highest first; a summit within 1.2 km of a higher one already kept is a shoulder of it (The Chin, The Nose)
      const all = derived(ab, 'summits').filter((f) => f.properties.ft).sort((a, b) => b.properties.ft - a.properties.ft || /^The /.test(a.properties.name) - /^The /.test(b.properties.name) || a.properties.name.localeCompare(b.properties.name));
      const kept = [];
      for (const f of all) {
        const p = f.properties, [x, y] = f.geometry.coordinates;
        if (p.ft < 2500 && p.iso_km < 6) continue;
        if (/^(The Nose|The Forehead|The Chin|Adams Apple)$/.test(p.name)) continue; // parts of Mount Mansfield
        if (kept.some((k) => Math.hypot((k.geometry.coordinates[0] - x) * 79, (k.geometry.coordinates[1] - y) * 111) < 1.2)) continue;
        kept.push(f);
      }
      return kept.map((f) => {
        const p = f.properties, nm = p.name;
        const alt = uniq([/^Mount /.test(nm) ? nm.replace(/^Mount /, 'Mt. ') : null, /^Mount /.test(nm) ? nm.replace(/^Mount /, '') : null, / (Mountain|Peak)$/.test(nm) ? nm.replace(/ (Mountain|Peak)$/, '') : null, nm === 'Camels Hump' ? "Camel's Hump" : null]);
        return { id: p.gnis_id, name: nm, alt, group: PEAK_BANDS.find((b) => p.ft >= b[0])[1], where: p.town || p.county, rank: p.ft, geometry: f.geometry, extra: { ft: p.ft, ...(p.town ? { t: p.town } : {}) } };
      });
    },
  });
  if (hasDerived(ab, 'lakes')) {
    const quiz = derived(ab, 'lakes').filter((f) => f.properties.name && f.properties.instate && f.properties.km2 >= 0.4);
    add({
      id: `us-${ab}-lakes`, title, state: fips, kind: 'points', sub: 'lake', fips, ab, noun: 'lake', nouns: 'lakes & ponds', groupNoun: 'Size', groupOrder: ['Largest lakes', 'Lakes & ponds'],
      skipLakes: new Set(quiz.map((f) => f.properties.gnis_id)), riverKm: 40,
      make: () => quiz.map((f) => ({ id: f.properties.gnis_id, name: shortSaint(f.properties.name), alt: uniq([shortSaint(f.properties.name) !== f.properties.name ? f.properties.name : null, /^Lake /.test(f.properties.name) ? f.properties.name.replace(/^Lake /, '') : null, / (Lake|Pond|Reservoir)$/.test(f.properties.name) ? f.properties.name.replace(/ (Lake|Pond|Reservoir)$/, '') : null]), group: f.properties.km2 >= 2 ? 'Largest lakes' : 'Lakes & ponds', where: '', rank: f.properties.km2, geometry: f.geometry, extra: { km2: f.properties.km2 } })),
    });
  }
}
for (const st of FIFTY) {
  const ab = STATE_ABBR[st.id];
  add({ id: `us-${ab}-roads`, title: STATE_NAMES[st.id], state: st.id, kind: 'roads', fips: st.id, ab, noun: 'road', nouns: 'roads' });
}

// ---------- run ----------
const results = [];
for (const cfg of packs) {
  if (only.length && !only.includes(cfg.id)) continue;
  if (cfg.kind === 'roads' || cfg.kind === 'rivers') { await buildRoadPack(cfg); continue; }
  if (cfg.kind === 'points') { await buildSpotPack(cfg); continue; }
  const made = await cfg.make();
  await buildPack({ ...cfg, ...made });
}

// catalog: every pack file on disk, so building a few packs still leaves a complete catalog
{
  const by = {};
  for (const cfg of packs) {
    const f = path.join(OUT, cfg.id + '.json');
    if (!fs.existsSync(f)) continue;
    const p = JSON.parse(fs.readFileSync(f, 'utf8'));
    by[cfg.id] = { id: cfg.id, title: p.title, count: p.places.length, noun: p.noun, nouns: p.nouns, kb: Math.round(fs.statSync(f).size / 1024), cont: cfg.cont };
  }
  const item = (id, label) => ({ id, label: label || by[id].title, count: by[id].count, nouns: by[id].nouns });
  const tree = [];
  tree.push({ title: 'World', items: [item('world-continents', 'Continents'), item('world-countries', 'All countries')] });
  for (const cont of CONTINENTS) {
    const cid = CONT_CFG[cont].id;
    const items = [item(cid, 'Countries of ' + cont)];
    if (cont === 'Asia') items.push(item('middle-east', 'Countries of the Middle East'));
    const sub = Object.values(by).filter((r) => r.cont === cont && r.id !== 'us-states').sort((a, b) => a.title.localeCompare(b.title));
    if (cont === 'North America') sub.unshift(by['us-states']);
    sub.forEach((r) => items.push(item(r.id, r.title + ' — ' + r.nouns)));
    tree.push({ title: cont, items });
  }
  const states = FIFTY.map((f) => f.id).sort((a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b]));
  tree.push({
    title: 'U.S. states', states: states.map((fips) => {
      const ab = STATE_ABBR[fips];
      const c = by[`us-${ab}-counties`];
      const items = [item(`us-${ab}-counties`, c.nouns[0].toUpperCase() + c.nouns.slice(1))];
      if (by[`us-${ab}-towns`]) items.unshift(item(`us-${ab}-towns`, 'Towns & cities'));
      if (by[`us-${ab}-cities`]) items.splice(items.length - 1, 0, item(`us-${ab}-cities`, 'Cities & villages'));
      if (by[`us-${ab}-hamlets`]) items.splice(items.length - 1, 0, item(`us-${ab}-hamlets`, 'Hamlets & corners'));
      if (by[`us-${ab}-roads`]) items.push(item(`us-${ab}-roads`, 'Roads'));
      if (by[`us-${ab}-rivers`]) items.push(item(`us-${ab}-rivers`, 'Rivers'));
      if (by[`us-${ab}-lakes`]) items.push(item(`us-${ab}-lakes`, 'Lakes & ponds'));
      if (by[`us-${ab}-peaks`]) items.push(item(`us-${ab}-peaks`, 'Mountains'));
      return { title: STATE_NAMES[fips], abbr: ab, items };
    }),
  });
  const packsOut = Object.fromEntries(Object.values(by).map((r) => [r.id, { title: r.title, count: r.count, noun: r.noun, nouns: r.nouns, kb: r.kb }]));
  fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify({ tree, packs: packsOut }, null, 1));
  console.log('catalog:', Object.keys(by).length, 'packs,', (Object.values(by).reduce((s, r) => s + r.kb, 0) / 1024).toFixed(1), 'MB');
}
