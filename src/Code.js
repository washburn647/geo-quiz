// Geography Quiz: web app entry points, map loading and the sheet menu.
// (Menu handlers can't end in _ : Apps Script hides those from menus.)

var BUILD = '2.0-t2';
// Where the map files are served from (the maps/ folder of the GitHub Pages site), ending in '/'.
// Empty: maps come from this script's own map_*.html files, and there is no terrain backdrop.
var MAP_BASE = 'https://washburn647.github.io/geo-quiz/maps/';

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  t.boot = JSON.stringify({ build: BUILD, base: MAP_BASE, catalog: JSON.parse(include('map_catalog')), progress: summary_(), settings: getSettings_() })
    .replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle('Geography Quiz')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// One map pack (JSON text). Map files are named map_<id with _ for ->.
function getMap(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Bad map id');
  return include('map_' + id.replace(/-/g, '_'));
}

function getBoot() {
  return { progress: summary_(), settings: getSettings_() };
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Geography Quiz')
    .addItem('Open the app', 'menuOpenApp')
    .addToUi();
}

function menuOpenApp() {
  var url = ScriptApp.getService().getUrl();
  var html = url
    ? '<p style="font:14px Arial"><a href="' + url + '" target="_blank">Open Geography Quiz</a></p>'
    : '<p style="font:14px Arial">The web app is not deployed yet.</p>';
  SpreadsheetApp.getUi().showModelessDialog(HtmlService.createHtmlOutput(html).setWidth(260).setHeight(70), 'Geography Quiz');
}
