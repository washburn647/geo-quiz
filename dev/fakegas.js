// Stand-ins for the Apps Script services Code.js and Store.js use: an in-memory
// spreadsheet saved to a JSON file, script properties, lock, HtmlService file reads.
// load(stateFile) returns the server functions running in that fake world.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');

function fakeSheet(name, data) {
  const sh = {
    name, data: data || [],
    getName: () => name,
    getLastRow: () => { let n = sh.data.length; while (n && (sh.data[n - 1] || []).every((v) => v === '' || v == null)) n--; return n; },
    setFrozenRows() {},
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const rng = {
        setValues(v) {
          if (v.length !== nr) throw new Error(name + ': ' + v.length + ' rows for a ' + nr + '-row range');
          v.forEach((row, i) => {
            if (row.length !== nc) throw new Error(name + ': row width ' + row.length + ' != ' + nc);
            sh.data[r - 1 + i] = sh.data[r - 1 + i] || [];
            row.forEach((x, j) => { sh.data[r - 1 + i][c - 1 + j] = x; });
          });
          return rng;
        },
        getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (sh.data[r - 1 + i] || [])[c - 1 + j]; return v === undefined || v === null ? '' : v; })); },
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sh.data[r - 1 + i]) sh.data[r - 1 + i][c - 1 + j] = ''; return rng; },
        setFontWeight: () => rng, setNumberFormat: () => rng,
      };
      return rng;
    },
  };
  return sh;
}

function load(stateFile) {
  let state = { sheets: [], props: {} };
  if (stateFile && fs.existsSync(stateFile)) {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state.sheets.forEach((s) => { s.data = s.data.map((row) => row.map((v) => (v && v.$d ? new Date(v.$d) : v))); });
  }
  const book = { sheets: state.sheets.map((s) => fakeSheet(s.name, s.data)) };
  const ss = {
    getSheetByName: (n) => book.sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = fakeSheet(n); book.sheets.push(s); return s; },
  };
  const props = state.props || {};
  const save = () => {
    if (!stateFile) return;
    fs.writeFileSync(stateFile, JSON.stringify({ props, sheets: book.sheets.map((s) => ({ name: s.name, data: s.data.map((row) => row.map((v) => (v instanceof Date ? { $d: v.toISOString() } : v))) })) }));
  };
  const readSrc = (name) => fs.readFileSync(path.join(SRC, name + '.html'), 'utf8');
  const ctx = {
    console, Date, JSON, Math,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'America/New_York' },
    Utilities: { formatDate: (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) },
    HtmlService: { createHtmlOutputFromFile: (name) => ({ getContent: () => readSrc(name) }) },
  };
  vm.createContext(ctx);
  ['Code.js', 'Store.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }));
  return { ctx, book, props, save, readSrc };
}

module.exports = { load };
