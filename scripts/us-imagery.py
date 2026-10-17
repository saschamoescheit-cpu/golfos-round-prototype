"""The best aerial imagery per US state and county (Sascha 17.10.2026: "per state the best source"): candidates from the
OSM editor layer index (osmlab/editor-layer-index, imagery.geojson – sources with an OSM-compatible licence), each one
checked live – it answers, allows the app's origin (CORS) and returns a real picture where it claims coverage – then
written as public/imagery/us.json for the app (loaded only for courses in the USA).

Usage: python scripts/us-imagery.py <imagery.geojson> <out json> [report.md]
Rank on the device (src/lib/imagery.ts): marked best by the index, then newest, then the finest zoom. Esri stays the
fallback (tiles failing → Esri)."""
import json, math, re, subprocess, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')
SRC, OUT = sys.argv[1:3]
REPORT = sys.argv[3] if len(sys.argv) > 3 else None
ORIGIN = 'https://saschamoescheit-cpu.github.io'
SKIP = re.compile(r'CIR|Infrared|NDVI|NAIP|imagico|USGS-Imagery|USGS Imagery|Color Infrared|Leaf-Off 6-Inch', re.I)
STATES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
    'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon',
    'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming', 'PR': 'Puerto Rico',
}


def template(p):
    """The index's URL as the app's tile template: {z}/{x}/{y} (scheme tms for {-y}), or {bbox-epsg-3857} for WMS/export."""
    u = p['url']
    u = re.sub(r'\{switch:([^,}]+)[^}]*\}', r'\1', u)  # one subdomain is enough
    scheme = 'xyz'
    if p['type'] == 'tms':
        if '{-y}' in u:
            u, scheme = u.replace('{-y}', '{y}'), 'tms'
        u = u.replace('{zoom}', '{z}')
        if not all(k in u for k in ('{z}', '{x}', '{y}')):
            return None, None
    else:
        projs = p.get('available_projections') or []
        if '{wkid}' not in u and projs and 'EPSG:3857' not in projs and 'EPSG:900913' not in projs:
            return None, None
        u = u.replace('{proj}', 'EPSG:3857').replace('{wkid}', '3857').replace('{bbox}', '{bbox-epsg-3857}')
        u = u.replace('{width}', '512').replace('{height}', '512')
        if '{' in u.replace('{bbox-epsg-3857}', ''):
            return None, None
    return u, scheme


def rings(geom):
    if not geom:
        return []
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    out = []
    for poly in polys:
        ring = np.array(poly[0], dtype=np.float64)
        # simplify to ~150 m (cv2 on a metre-ish grid): small enough for the app, edges fall back to Esri
        k = 1e4
        approx = cv2.approxPolyDP((ring * k).astype(np.int64).reshape(-1, 1, 2).astype(np.int32), 15, True).reshape(-1, 2) / k
        if len(approx) >= 3:
            out.append([[round(x, 4), round(y, 4)] for x, y in approx])
    return out


def inside(pt, ring):
    x, y = pt
    c = False
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def probe_points(rs, n=3):
    """Points well inside the coverage – a grid over the largest ring, the ones inside."""
    if not rs:
        return []
    ring = max(rs, key=len)
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    pts = []
    for fx in (0.5, 0.35, 0.65, 0.3, 0.7):
        for fy in (0.5, 0.35, 0.65, 0.3, 0.7):
            p = (min(xs) + fx * (max(xs) - min(xs)), min(ys) + fy * (max(ys) - min(ys)))
            if inside(p, ring):
                pts.append(p)
            if len(pts) >= n:
                return pts
    return pts


def tile_url(t, scheme, lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    r = math.radians(lat)
    y = int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)
    if '{bbox-epsg-3857}' in t:
        R = 2 * math.pi * 6378137
        res = R / 256 / n
        yy = n - y - 1
        bb = f'{x * 256 * res - R / 2},{yy * 256 * res - R / 2},{(x + 1) * 256 * res - R / 2},{(yy + 1) * 256 * res - R / 2}'
        return t.replace('{bbox-epsg-3857}', bb)
    if scheme == 'tms':
        y = n - y - 1
    return t.replace('{z}', str(z)).replace('{x}', str(x)).replace('{y}', str(y))


def fetch(url):
    req = urllib.request.Request(url, headers={'Origin': ORIGIN, 'User-Agent': 'GolfOS-prototype (imagery check)'})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.headers.get('Access-Control-Allow-Origin'), r.headers.get('Content-Type', ''), r.read(), time.time() - t0
    except urllib.error.URLError as e:
        if 'CERTIFICATE' not in str(e):
            raise
    # Python misses intermediate certificates that browsers fetch themselves – ask curl (the system's TLS) instead
    out = subprocess.run(['curl', '-s', '-m', '30', '-D', '-', '-H', f'Origin: {ORIGIN}', '-o', '-', url], capture_output=True, timeout=40).stdout
    head, _, body = out.partition(b'\r\n\r\n')
    while head.startswith(b'HTTP/1.1 100') or head.startswith(b'HTTP/1.1 3'):
        head, _, body = body.partition(b'\r\n\r\n')
    hd = {k.strip().lower(): v.strip() for k, _, v in (ln.decode('latin-1').partition(':') for ln in head.split(b'\r\n')[1:])}
    status = int(head.split(b' ')[1]) if head.startswith(b'HTTP') else 0
    if status != 200:
        raise RuntimeError(f'HTTP {status} (curl)')
    return status, hd.get('access-control-allow-origin'), hd.get('content-type', ''), body, time.time() - t0


def check(c):
    """Live test at up to 3 points, zoom 18: answer, CORS, a real picture (not blank, not one colour)."""
    res = {'ok': False, 'why': '', 'sharp': 0, 'secs': 0}
    for lon, lat in c['probe']:
        url = tile_url(c['tiles'], c['scheme'], lon, lat, 18)
        try:
            st, cors, ctype, data, secs = fetch(url)
        except Exception as e:
            res['why'] = f'error {str(e)[:60]}'
            continue
        if cors not in ('*', ORIGIN):
            res['why'] = f'no CORS ({cors})'
            return res
        im = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if im is None:
            res['why'] = f'not an image ({ctype[:30]}, {len(data)} B)'
            continue
        g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
        if g.std() < 6:
            res['why'] = 'blank tile'
            continue
        res.update(ok=True, why='', sharp=round(float(cv2.Laplacian(g, cv2.CV_64F).var())), secs=round(secs, 1))
        return res
    return res


def main():
    d = json.load(open(SRC, encoding='utf-8'))
    cands = []
    for f in d['features']:
        p = f['properties']
        if p.get('country_code') != 'US' or p.get('overlay') or p.get('category') not in ('photo', None):
            continue
        if p.get('type') not in ('tms', 'wms') or SKIP.search(p.get('name', '') + ' ' + p.get('id', '')):
            continue
        t, scheme = template(p)
        if not t:
            continue
        rs = rings(f.get('geometry'))
        if not rs:
            continue
        year = int((re.search(r'\d{4}', p.get('end_date') or p.get('start_date') or '') or re.search(r'\d{4}', p['name']) or [0])[0]) if re.search(r'\d{4}', (p.get('end_date') or p.get('start_date') or p['name'])) else 0
        att = (p.get('attribution') or {}).get('text') or p['name']
        cands.append({'id': p['id'], 'name': p['name'], 'tiles': t, 'scheme': scheme, 'maxzoom': min(int(p.get('max_zoom') or 19), 21),
                      'year': year, 'best': bool(p.get('best')), 'attribution': f'Imagery © {att}', 'coverage': rs, 'probe': probe_points(rs)})
    print(len(cands), 'candidates')
    with ThreadPoolExecutor(12) as ex:
        results = list(ex.map(check, cands))
    keep, report = [], []
    for c, r in zip(cands, results):
        report.append((c, r))
        if r['ok']:
            keep.append({k: c[k] for k in ('id', 'name', 'tiles', 'scheme', 'maxzoom', 'year', 'best', 'attribution', 'coverage')})
    # one series, one entry: an older year of the same programme is dropped when a newer one covers the same place
    def series(x):
        return re.sub(r'[_ -]?(19|20)\d\d\w*', '', x['id']).lower()
    keep.sort(key=lambda x: (series(x), -x['year']))
    seen, final = set(), []
    for x in keep:
        s = series(x)
        if s in seen and not x['best']:
            continue
        seen.add(s)
        final.append(x)
    json.dump({'checked': time.strftime('%Y-%m-%d'), 'source': 'osmlab/editor-layer-index, each layer checked live', 'sources': final},
              open(OUT, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    print(len(final), 'sources kept,', sum(1 for _, r in report if not r['ok']), 'failed')
    if REPORT:
        with open(REPORT, 'w', encoding='utf-8') as fh:
            fh.write('| Quelle | Jahr | Ergebnis |\n|---|---|---|\n')
            for c, r in sorted(report, key=lambda cr: cr[0]['name']):
                fh.write(f"| {c['name']} | {c['year'] or '–'} | {'ok' if r['ok'] else r['why']} |\n")
    for c, r in sorted(report, key=lambda cr: cr[0]['name']):
        print(('OK  ' if r['ok'] else 'FAIL'), c['name'], '' if r['ok'] else r['why'])


main()
