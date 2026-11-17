"""Downloads Terrarium elevation tiles (AWS Open Data, Mapzen/Tilezen) for a lon/lat box.
Usage: python fetch-dem.py <west> <south> <east> <north> [zoom=12]
Tiles land in build/sources/dem/<z>/<x>/<y>.png; existing ones are skipped."""
import math, os, sys, urllib.request, concurrent.futures as cf
w, s, e, n = map(float, sys.argv[1:5]); z = int(sys.argv[5]) if len(sys.argv) > 5 else 12
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sources', 'dem')
def tx(lon): return int((lon + 180) / 360 * 2 ** z)
def ty(lat): return int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2 ** z)
jobs = [(x, y) for x in range(tx(w), tx(e) + 1) for y in range(ty(n), ty(s) + 1)]
def get(xy):
    x, y = xy
    p = os.path.join(OUT, str(z), str(x), f'{y}.png')
    if os.path.exists(p) and os.path.getsize(p) > 0: return 0
    os.makedirs(os.path.dirname(p), exist_ok=True)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', timeout=60) as r: data = r.read()
            open(p, 'wb').write(data); return 1
        except Exception as ex: err = ex
    print('failed', x, y, err); return 0
with cf.ThreadPoolExecutor(12) as ex: got = sum(ex.map(get, jobs))
print(len(jobs), 'tiles,', got, 'downloaded')
