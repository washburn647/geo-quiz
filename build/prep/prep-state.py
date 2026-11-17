"""Prepares one state's physical-geography sources for build-maps.mjs:
rivers, lakes, populated places and summits, as small GeoJSON files in
build/sources/derived/us-<ab>-*.geojson. Those files are committed, so the map
build itself needs only Node. Re-run this only to change what is extracted.

Inputs (not committed, see build/prep/README.md):
  NHD state GeoPackage   (USGS National Hydrography Dataset)
  GNIS DomesticNames txt (USGS Geographic Names)
  cb_2023_<fips>_cousub_500k.zip (Census towns, already in build/sources)
  Terrarium elevation tiles in build/sources/dem (fetch-dem.py)

Usage: python prep-state.py <ab> <fips> <State Name> <epsg metres> <nhd.gpkg> <gnis.txt>
"""
import csv, json, math, os, re, sys, warnings
import geopandas as gpd, pandas as pd, pyogrio, shapely
from shapely.geometry import Point, box
from shapely.ops import linemerge, unary_union
warnings.filterwarnings('ignore')
ab, fips, STATE, EPSG, NHD, GNIS = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5], sys.argv[6]
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'sources')
OUT = os.path.join(SRC, 'derived'); os.makedirs(OUT, exist_ok=True)
FT = 3.28084

def write(name, gdf, keep):
    gdf = gdf.to_crs(4326)
    gdf.geometry = shapely.set_precision(gdf.geometry.values, 0.00001)
    feats = [{'type': 'Feature', 'properties': {k: (None if (isinstance(r[k], float) and math.isnan(r[k])) else r[k]) for k in keep},
              'geometry': shapely.geometry.mapping(r.geometry)} for _, r in gdf.iterrows() if r.geometry and not r.geometry.is_empty]
    p = os.path.join(OUT, f'us-{ab}-{name}.geojson')
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(p, 'w'), separators=(',', ':'), ensure_ascii=False)
    print(f'{name:9} {len(feats):5} features {os.path.getsize(p) / 1024:7.0f} KB')

# ---- towns and the state outline ----
towns = gpd.read_file(os.path.join(SRC, f'cb_2023_{fips}_cousub_500k.zip')).to_crs(EPSG)
towns = towns[~towns.NAME.str.contains('not defined', case=False)]
state = unary_union(towns.geometry.values)
near = state.buffer(1500)
wgs_box = gpd.GeoSeries([near.buffer(20000)], crs=EPSG).to_crs(4269).total_bounds

# ---- rivers: named flowlines, joined per river, cut to the state (+1.5 km so border rivers stay) ----
fl = pyogrio.read_dataframe(NHD, layer='NHDFlowline', bbox=tuple(wgs_box), columns=['gnis_id', 'gnis_name', 'ftype'])
fl = fl[fl.gnis_name.notna()].to_crs(EPSG)
fl.geometry = shapely.force_2d(fl.geometry.values)
fl = fl[fl.intersects(near)]
rows = []
for gid, grp in fl.groupby('gnis_id'):
    full = unary_union(grp.geometry.values)
    inside = full.intersection(near)
    if inside.is_empty: continue
    km_in = inside.length / 1000
    if km_in < 6: continue
    g = linemerge(inside) if inside.geom_type == 'MultiLineString' else inside
    rows.append({'gnis_id': str(gid), 'name': grp.gnis_name.iloc[0], 'km': round(km_in, 1), 'km_all': round(full.length / 1000, 1), 'geometry': g.simplify(12)})
rivers = gpd.GeoDataFrame(rows, crs=EPSG)
write('rivers', rivers, ['gnis_id', 'name', 'km', 'km_all'])

# ---- lakes and ponds: named, 0.15 km2 and up, touching the state; unnamed big ones kept for drawing ----
wb = pyogrio.read_dataframe(NHD, layer='NHDWaterbody', bbox=tuple(wgs_box), columns=['gnis_id', 'gnis_name', 'areasqkm', 'ftype'])
wb = wb[wb.ftype.isin([390, 436]) & (wb.areasqkm >= 0.15)].to_crs(EPSG)
wb.geometry = shapely.make_valid(shapely.force_2d(wb.geometry.values))
wb = wb[wb.intersects(near.buffer(15000))]
rows = []
for (gid, nm), grp in wb.groupby([wb.gnis_id.fillna(''), wb.gnis_name.fillna('')]):
    if not nm:
        for _, r in grp.iterrows(): rows.append({'gnis_id': '', 'name': '', 'km2': round(r.areasqkm, 2), 'instate': bool(r.geometry.intersects(state)), 'geometry': r.geometry.simplify(15)})
        continue
    g = unary_union(grp.geometry.values)
    rows.append({'gnis_id': str(gid), 'name': nm, 'km2': round(g.area / 1e6, 2), 'instate': bool(g.intersects(state)), 'geometry': g.simplify(15)})
lakes = gpd.GeoDataFrame(rows, crs=EPSG)
write('lakes', lakes, ['gnis_id', 'name', 'km2', 'instate'])

# ---- names: populated places and summits ----
recs = [r for r in csv.DictReader(open(GNIS, encoding='utf-8-sig'), delimiter='|') if r['state_name'] == STATE]
def pts(cls):
    rs = [r for r in recs if r['feature_class'] == cls and '(historical)' not in r['feature_name'] and float(r['prim_lat_dec'] or 0)]
    return gpd.GeoDataFrame([{'gnis_id': r['feature_id'], 'name': r['feature_name'], 'county': r['county_name']} for r in rs],
                            geometry=[Point(float(r['prim_long_dec']), float(r['prim_lat_dec'])) for r in rs], crs=4269).to_crs(EPSG)
def tidy(n): return re.sub(r'^Saint ', 'St. ', n)
civil = [r['feature_name'] for r in recs if r['feature_class'] == 'Civil']
cities = {re.sub(r' \(historical\)$', '', n)[len('City of '):] for n in civil if n.startswith('City of ')}
villages = {re.sub(r' \(historical\)$', '', n)[len('Village of '):] for n in civil if n.startswith('Village of ') and '(historical)' not in n}
cdps = set()
for r in recs:
    if r['feature_class'] == 'Census' and '(historical)' not in r['feature_name']:
        cdps.update(re.sub(r' Census Designated Place$', '', r['feature_name']).split('-'))
pp = pts('Populated Place')
pp = gpd.sjoin(pp, towns[['NAME', 'NAMELSADCO', 'geometry']], how='left', predicate='within').drop(columns='index_right')
pp['town'] = pp.NAME.fillna(''); pp['county'] = pp.NAMELSADCO.fillna(pp.county).str.replace(' County', '')
pp['tier'] = [('city' if n in cities else 'village' if n in villages else 'cdp' if n in cdps else 'hamlet') for n in pp.name]
write('places', pp, ['gnis_id', 'name', 'town', 'county', 'tier'])

# summits, with elevation read off the terrain tiles (highest cell within ~80 m of the named point)
from PIL import Image
import numpy as np
Z = 12; DEM = os.path.join(SRC, 'dem', str(Z)); _tiles = {}
def tile(x, y):
    if (x, y) not in _tiles:
        p = os.path.join(DEM, str(x), f'{y}.png')
        if not os.path.exists(p): _tiles[(x, y)] = None
        else:
            a = np.asarray(Image.open(p).convert('RGB'), dtype=np.float64)
            _tiles[(x, y)] = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
        if len(_tiles) > 400: _tiles.pop(next(iter(_tiles)))
    return _tiles[(x, y)]
def elev(lon, lat, rad=3):
    fx = (lon + 180) / 360 * 2 ** Z * 256
    fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2 ** Z * 256
    best = None
    for dy in range(-rad, rad + 1):
        for dx in range(-rad, rad + 1):
            px, py = int(fx) + dx, int(fy) + dy
            t = tile(px // 256, py // 256)
            if t is None: continue
            v = t[py % 256, px % 256]
            if best is None or v > best: best = v
    return best
sm = pts('Summit')
ll = sm.to_crs(4326)
sm['ft'] = [(lambda m: None if m is None else int(round(m * FT)))(elev(p.x, p.y)) for p in ll.geometry]
sm = gpd.sjoin(sm, towns[['NAME', 'NAMELSADCO', 'geometry']], how='left', predicate='within').drop(columns='index_right')
sm['town'] = sm.NAME.fillna(''); sm['county'] = sm.NAMELSADCO.fillna(sm.county).str.replace(' County', '')
# isolation: distance to the nearest higher named summit, for picking landmark hills
xy = np.array([[p.x, p.y] for p in sm.geometry]); ft = sm.ft.fillna(0).values
iso = []
for i in range(len(sm)):
    higher = ft > ft[i]
    iso.append(round(float(np.min(np.hypot(*(xy[higher] - xy[i]).T))) / 1000, 1) if higher.any() else 999)
sm['iso_km'] = iso
write('summits', sm, ['gnis_id', 'name', 'town', 'county', 'ft', 'iso_km'])
