// Progress kept in the spreadsheet:
//   Runs    one row per finished game
//   Places  one row per map + place: mastery level 0-5 and counts
//   Summary QUERY tables over Runs (whole-column formulas, so new rows are always counted)
// Settings (pinned maps, preferences) live in script properties.

var RUN_HEAD = ['When', 'Map', 'Map ID', 'Game', 'Level', 'Scope', 'Questions', 'Right first try', 'Accuracy', 'Seconds', 'Score', 'Missed'];
var PLACE_HEAD = ['Map ID', 'Place', 'Level', 'Seen', 'Right', 'Wrong', 'Streak', 'Last seen', 'Avg seconds'];

function book_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('sheetId'));
  return ss;
}

function sheet_(name) {
  var ss = book_();
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  sh = ss.insertSheet(name);
  var head = name === 'Runs' ? RUN_HEAD : name === 'Places' ? PLACE_HEAD : null;
  if (head) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  if (name === 'Runs') {
    sh.getRange(1, 9, 1, 1).setNumberFormat('0%');
    ensureSummary_();
  }
  return sh;
}

function ensureSummary_() {
  var ss = book_();
  if (ss.getSheetByName('Summary')) return;
  var sh = ss.insertSheet('Summary');
  sh.getRange(1, 1, 1, 1).setValues([['By map']]).setFontWeight('bold');
  sh.getRange(2, 1, 1, 1).setValues([["=QUERY(Runs!A:L, \"select B, count(B), avg(I), max(I), sum(J), max(A) where B is not null group by B order by max(A) desc label count(B) 'Games', avg(I) 'Avg accuracy', max(I) 'Best accuracy', sum(J) 'Seconds played', max(A) 'Last played'\", 1)"]]);
  sh.getRange(1, 9, 1, 1).setValues([['By game']]).setFontWeight('bold');
  sh.getRange(2, 9, 1, 1).setValues([["=QUERY(Runs!A:L, \"select D, count(D), avg(I), sum(J) where D is not null group by D order by count(D) desc label count(D) 'Games', avg(I) 'Avg accuracy', sum(J) 'Seconds played'\", 1)"]]);
}

function rows_(name, width) {
  var sh = sheet_(name);
  var n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, width).getValues() : [];
}

function ms_(d) { return d instanceof Date ? d.getTime() : (d ? new Date(d).getTime() : 0); }

// Everything the home screen needs: per-map totals, best results, active days, recent games.
function summary_() {
  var maps = {}, days = {}, recent = [], totals = { plays: 0, secs: 0 };
  var tz = Session.getScriptTimeZone();
  rows_('Runs', RUN_HEAD.length).forEach(function (r) {
    var id = r[2];
    if (!id) return;
    var m = maps[id] || (maps[id] = { plays: 0, secs: 0, last: 0, best: {}, lvl: 0, seen: 0, known: 0 });
    var when = ms_(r[0]);
    m.plays++; m.secs += +r[9] || 0; m.last = Math.max(m.last, when);
    totals.plays++; totals.secs += +r[9] || 0;
    var key = r[3] + '|' + r[4] + '|' + (r[5] || 'All');
    var b = m.best[key];
    var acc = +r[8] || 0, score = +r[10] || 0, secs = +r[9] || 0;
    if (!b || score > b[0] || (score === b[0] && secs < b[1])) m.best[key] = [score, secs, acc];
    var day = Utilities.formatDate(new Date(when), tz, 'yyyy-MM-dd');
    days[day] = (days[day] || 0) + 1;
    recent.push([when, id, r[3], r[4], acc, score, r[5]]);
  });
  rows_('Places', PLACE_HEAD.length).forEach(function (r) {
    var m = maps[r[0]];
    if (!m) m = maps[r[0]] = { plays: 0, secs: 0, last: 0, best: {}, lvl: 0, seen: 0, known: 0 };
    m.lvl += +r[2] || 0; m.seen++;
    if (+r[2] >= 3) m.known++;
  });
  recent.sort(function (a, b) { return b[0] - a[0]; });
  return { maps: maps, days: days, recent: recent.slice(0, 15), totals: totals };
}

// One map's place levels and its game history.
function getMapProgress(id) {
  var places = {};
  rows_('Places', PLACE_HEAD.length).forEach(function (r) {
    if (r[0] === id) places[r[1]] = [+r[2] || 0, +r[3] || 0, +r[4] || 0, +r[5] || 0, +r[6] || 0, ms_(r[7]), +r[8] || 0];
  });
  var runs = [];
  rows_('Runs', RUN_HEAD.length).forEach(function (r) {
    if (r[2] === id) runs.push([ms_(r[0]), r[3], r[4], r[5], +r[6] || 0, +r[7] || 0, +r[8] || 0, +r[9] || 0, +r[10] || 0, String(r[11] || '')]);
  });
  runs.sort(function (a, b) { return a[0] - b[0]; });
  return { places: places, runs: runs.slice(-300) };
}

// Saves a finished game. run = {id, mapId, title, mode, level, scope, q, right, secs, score, missed[], results:[[name, ok, secs]]}
// `id` makes a retried save harmless (the app re-sends games it couldn't save).
function saveRun(run) {
  if (!run || !run.mapId || !run.mode) throw new Error('Bad run');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var seen = (props.getProperty('savedRuns') || '').split(',');
    if (run.id && seen.indexOf(run.id) >= 0) return { ok: true, dup: true, progress: getMapProgress(run.mapId) };
    var now = new Date();
    var acc = run.q ? Math.round(run.right / run.q * 1000) / 1000 : 0;
    var runs = sheet_('Runs');
    runs.getRange(runs.getLastRow() + 1, 1, 1, RUN_HEAD.length).setValues([[now, run.title, run.mapId, run.modeName || run.mode, run.level, run.scope || 'All',
      run.q, run.right, acc, Math.round(run.secs || 0), run.score || 0, (run.missed || []).slice(0, 60).join(', ')]]);
    runs.getRange(runs.getLastRow(), 9, 1, 1).setNumberFormat('0%');

    if (run.results && run.results.length) {
      var sh = sheet_('Places');
      var n = sh.getLastRow() - 1;
      var data = n > 0 ? sh.getRange(2, 1, n, PLACE_HEAD.length).getValues() : [];
      var at = {};
      data.forEach(function (r, i) { if (r[0] === run.mapId) at[r[1]] = i; });
      run.results.forEach(function (res) {
        var name = String(res[0]), credit = Math.max(0, Math.min(1, +res[1] || 0)), ok = credit > 0, secs = +res[2] || 0;
        var i = at[name];
        if (i === undefined) { i = data.length; at[name] = i; data.push([run.mapId, name, 0, 0, 0, 0, 0, now, 0]); }
        var r = data[i];
        var lvl = +r[2] || 0, seenN = +r[3] || 0;
        r[2] = nextLevel_(lvl, credit);
        r[3] = seenN + 1;
        r[4] = (+r[4] || 0) + (ok ? 1 : 0);
        r[5] = (+r[5] || 0) + (ok ? 0 : 1);
        r[6] = credit >= 1 ? (+r[6] || 0) + 1 : ok ? (+r[6] || 0) : 0;
        r[7] = now;
        r[8] = secs ? Math.round(((+r[8] || 0) * seenN + secs) / (seenN + 1) * 10) / 10 : r[8];
      });
      if (data.length) sh.getRange(2, 1, data.length, PLACE_HEAD.length).setValues(data);
    }
    if (run.id) { seen.push(run.id); props.setProperty('savedRuns', seen.slice(-40).join(',')); }
    return { ok: true, progress: getMapProgress(run.mapId) };
  } finally {
    lock.releaseLock();
  }
}

// Mastery is slow on purpose: a clean answer is worth half a level (six to reach "known",
// ten to master); hinted answers and ones left over by elimination earn a fraction; a miss costs 1.5.
// Same rule as nextLevel in JsCore.html.
function nextLevel_(lvl, credit) {
  var v = credit > 0 ? Math.min(5, lvl + 0.5 * credit) : Math.max(0, lvl - 1.5);
  return Math.round(v * 100) / 100;
}

function getSettings_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('settings') || '{}'); } catch (e) { return {}; }
}

function saveSettings(s) {
  PropertiesService.getScriptProperties().setProperty('settings', JSON.stringify(s || {}));
  return true;
}

// Clears one map's progress (both tabs). Asked for from the app's stats page.
function resetMap(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ['Places', 'Runs'].forEach(function (name) {
      var sh = sheet_(name);
      var col = name === 'Places' ? 0 : 2;
      var width = name === 'Places' ? PLACE_HEAD.length : RUN_HEAD.length;
      var n = sh.getLastRow() - 1;
      if (n <= 0) return;
      var keep = sh.getRange(2, 1, n, width).getValues().filter(function (r) { return r[col] !== id; });
      sh.getRange(2, 1, n, width).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, width).setValues(keep);
    });
  } finally {
    lock.releaseLock();
  }
  return getMapProgress(id);
}
