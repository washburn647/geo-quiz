# Geography Quiz

Map games for memorizing places, from continents down to every town in Vermont. A Google Sheet keeps the score; the games run as an Apps Script web app (phone, iPad or computer).

- Spreadsheet ("Geography Quiz"): https://docs.google.com/spreadsheets/d/1XJHuHnjZfgna0TMRjiNSiTstbHCyy1Sh9WV3B7gOxJU
- Script (bound to the sheet): https://script.google.com/d/1EZWN_Nj1cW0i7QpDPZpfFFjrNwn0nNJbnsaVjhVZ3cwaRt58Q53tgkR5/edit
- Web app: https://script.google.com/macros/s/AKfycbwC-l7vJJV2zKBUkfl1_UafEPQf4dE1xkMSqUyznj_nBFUks2XIBdH0MRxqK6hszUh5jQ/exec
  (deployment id `AKfycbwC-l7vJJV2zKBUkfl1_UafEPQf4dE1xkMSqUyznj_nBFUks2XIBdH0MRxqK6hszUh5jQ`)

Access is "Only myself": it runs as Kyle and only Kyle (signed in to Google) can open it. The first time, Google asks for permission ("unverified app" warning: Advanced ▸ Go to Geography Quiz).

## Maps (154)

| Level | Maps | Grouped by |
| --- | --- | --- |
| World | Continents; all countries | continent |
| Continents | Africa, Asia, Europe, North America, South America, Oceania, plus the Middle East | UN sub-region |
| Countries → provinces | Canada, Mexico, Brazil, Argentina, Chile, Colombia, Peru, Australia, New Zealand, China, India, Japan, South Korea, Indonesia, Thailand, Iran, Turkey, Saudi Arabia, Pakistan, Russia, Germany, France (regions and départements), Italy, Spain (communities and provinces), UK, Ireland, Poland, Netherlands, Switzerland, Austria, Sweden, Greece, Ukraine, Egypt, Nigeria, South Africa | regions where they exist (Japan, China, Brazil, Ireland's provinces…), otherwise compass areas for big ones |
| United States | 50 states | Census region |
| States → counties | all 50 states (parishes, boroughs) | compass areas for big states |
| States → towns | Vermont, New Hampshire, Massachusetts, Maine, Connecticut, Rhode Island | county (planning region in CT) |
| States → roads | all 50 states: interstates, US routes and state routes (up to 90 per state, the longest) | **Major roads** (interstates, US routes, the longest state routes; ~31 in VT) and **Other state routes** |

Vermont towns follow the Census list: 256 towns, cities, gores and grants. Twin names are split as "Barre City"/"Barre Town" (same for Rutland, St. Albans, Newport); typing just "Barre" also counts in Name It.

## Games

Every game has Easy / Medium / Hard / Blind, and can be played on the whole map, one or more groups (e.g. Windsor + Orange counties), **Weak spots** (lowest levels), **Due for review** (spaced repetition: a place comes due after 0/1/2/4/8/16 days by level), or **Never asked**.

| Game | What you do | Levels |
| --- | --- | --- |
| 🔍 Study | Explore with names on; tap for name, county, your level; hide names and tap to reveal | — |
| 🏷️ Label Drop | Drag name tiles onto the map (or tap a tile, then tap the map) | place ¼ / ½ / all (placed names stay) / all with no names ever |
| 📍 Pinpoint | Tap the named place; wrong taps tell you what you hit | ¼ / ½ / all / all with no labels or clues |
| ⌨️ Name It | Type the highlighted place; small typos pass unless they spell another place | first letter + length / length + hint / no hints / no labels |
| 🎡 Name Wheel | Flip ‹ › through names to the right one | 3 / 5 / 8 names / the whole list (with A–Z jump) |
| 🧠 Name ’em All | Type every name you remember, any order (Sporcle style) | first letters shown / plain / clock / clock + borders hidden |
| 🧭 Border Patrol | Pick which names border the highlighted place | count told + few decoys / count told / more decoys / place not shown |
| 🚗 Road Trip (road maps only) | Get from one town to another by picking roads in order: the first must go through the start, each next must meet the last, the last must reach the finish | tap roads, all labeled, ≤3 roads / tap roads, unlabeled / choose road names from a list, ≤4 roads / choose names, roads hidden until picked |
| 🧩 Shape Shifter (not on road maps) | Name a place from its outline alone | 4 choices / 6 / type it / type it, shape turned |
| ⚡ Blitz | Find as many as you can | 90 s / 60 s / 60 s, misses −3 s / 45 s, misses −3 s, no labels |

## Progress

- Each answer moves that place's **level** (0–5, shown rounded down): a clean answer adds 0.5 (so 6 to reach "known" at level 3, 10 to master), a miss takes away 1.5. Answers earn only part of the 0.5: one hint ½, two hints ⅕; on Easy/Medium in Pinpoint and Label Drop, the last 3 blanks left count 60% / 35% / 10% (they're partly guessed by elimination). Hinted answers count as "to practice" and not as right in the score.
- Hint button in Pinpoint and Label Drop (1st: outlines and names the county/region, 2nd: pulses the place), Name It (adds a letter), Name Wheel (removes half the wrong names), Shape Shifter (removes half the choices, or adds a letter).
- The map page shows a mastery map (grey = never asked → red → yellow → green), best result per game × level, accuracy trend, mastery per county, trickiest places (with a "practice these" button), history, and a reset button.
- The home page has pinned maps (☆ on a map page), "keep going", a day streak, and a Progress page (calendar of days played, every map's mastery, recent games).
- The sheet: **Runs** (one row per game), **Places** (map, place, level, seen, right, wrong, streak, last seen, avg seconds), **Summary** (QUERY tables by map and by game, whole-column so new rows always count). Settings (pins) are in script properties.
- Games are saved on the device first and sent to the sheet; if a save fails (offline), it's retried the next time the app opens. Each game carries an id so a retry can't double-count.

## Layout

| Path | Role |
| --- | --- |
| `src/Code.js` | `doGet` (page + boot data), `getMap`, sheet menu |
| `src/Store.js` | Runs / Places / Summary tabs, `saveRun`, `getMapProgress`, `resetMap`, settings |
| `src/Index.html` | Page shell; includes the files below |
| `src/Styles.html` | All CSS (light + dark) |
| `src/JsCore.html` | Helpers, server calls, map cache (localStorage), progress, name matching, routing (`google.script.history`) |
| `src/JsMap.html` | `MapView`: SVG map with pan / pinch / wheel zoom, taps, drop targets, labels that appear as you zoom |
| `src/JsGames.html` | The ten games and the results screen |
| `src/JsScreens.html` | Home, Progress, map page (Play + Stats) |
| `src/map_*.html` | Map packs (JSON), copied in by `build/pack-src.mjs` |
| `build/build-maps.mjs` | Builds every pack from `build/sources/` into `maps/` |
| `build/preview.html` | Contact sheet of every pack (`?ids=a,b` for big ones) — preview "geo-preview", port 5220, `/build/preview.html` |
| `dev/server.js`, `dev/fakegas.js` | Local preview running the real Code.js/Store.js on a fake sheet (`dev/state.json`; delete to start over) — preview "geo-quiz", port 5221 |

Map detail: borders are simplified to about 1/1,100 of the map width, times `detail` for maps you zoom deep into (world 3×, Europe 3×, North America 3×, Asia 2.5×, Africa/Middle East 2×). Neighboring land outside the map is drawn coarser-margined (30% of the width) to keep packs small.

Map packs are pre-projected SVG paths (10000-wide viewBox): name, alternates, group, label point, area, bbox, land neighbors (shared border) and near neighbors (across a narrow gap, for Road Trip). Specks (island nations, Vatican…) get a tap circle.

Road maps (`kind: 'roads'`): Census TIGER 2023 primary + secondary roads (`build/sources/roads/tl_2023_<fips>_prisecroads.zip`), segments grouped into routes by their number (Business / Bypass / Spur pieces left out). Through villages TIGER often files a route under its street name, so routes count as meeting within ~600 m. Towns for Road Trip: Census towns in New England, Natural Earth populated places elsewhere (only a few in NJ, DE, MD). Other games work on roads too (Border Patrol asks which roads meet). Map files are stored in `src/` gzipped + base64 (Apps Script refused a 12 MB project); the app unpacks them with `DecompressionStream`.

Sources (in `build/sources/`, not needed at run time): Natural Earth 10m admin 0 / admin 1 / lakes (GeoJSON from github.com/nvkelso/natural-earth-vector), US Census 2023 cartographic county subdivisions (`cb_2023_<fips>_cousub_500k.zip`), and the `us-atlas` npm package (states, counties).

## Adding a map

- Another state's towns: download `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_<fips>_cousub_500k.zip` into `build/sources/` and add the fips to `TOWN_STATES` in `build-maps.mjs` (outside New England these are townships / census divisions).
- Another country's provinces: add an `a1Pack({...})` line (Natural Earth `admin` name, which name field, overrides, optional bbox).
- Then `node build/build-maps.mjs` (all, writes the catalog) or `node build/build-maps.mjs <id>` (one), check `build/preview.html`, `node build/pack-src.mjs`, bump `BUILD`, deploy.

## Commands

```bash
cd build && npm install                       # mapshaper, d3-geo, topojson, polylabel, us-atlas
node build/build-maps.mjs                     # ~1 minute, all 104 packs + catalog
node build/pack-src.mjs                       # copy packs into src/
node dev/server.js 5221                       # local preview
clasp push --force                            # from geo-quiz/ (clasp in C:\Users\Kyle\tools\npm)
clasp update-deployment AKfycbwC-l7vJJV2zKBUkfl1_UafEPQf4dE1xkMSqUyznj_nBFUks2XIBdH0MRxqK6hszUh5jQ --description "Geography Quiz X.Y"
```

Bump `BUILD` in `src/Code.js` with every deploy that changes maps: the app caches map packs per device by build.

In-app links go through `google.script.history` (no `<base target=_top>`, no plain hash navigation): inside the Apps Script frame those load a blank page.
