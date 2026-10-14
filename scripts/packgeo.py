"""Packs the bulky parts of the bundled course files (night run 15./16.10.2026: the tree crowns made a course up to
1.1 MB – every phone loads all courses for offline play). Tree crowns are cropped to 70 m around the hole lines (the
2D view shows 60 m) and, like the fairways from the aerial image, stored as encoded polylines (Google's algorithm,
1e-6 degrees, lon before lat) under `enc` – decoded by the app when a course is loaded (src/lib/polyline.ts).
Run after scripts/canopy.py and scripts/fairways.py (both read packed files too).
Usage: python scripts/packgeo.py [course.json …]"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'src', 'data', 'courses')
KEEP_M = 70


def encode(ring):
    out, plon, plat = [], 0, 0
    for lon, lat in ring:
        ilon, ilat = round(lon * 1e6), round(lat * 1e6)
        for v in (ilon - plon, ilat - plat):
            v = ~(v << 1) if v < 0 else v << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1f)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        plon, plat = ilon, ilat
    return ''.join(out)


def decode(s):
    pts, i, lon, lat = [], 0, 0, 0
    while i < len(s):
        vals = []
        for _ in range(2):
            shift = res = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                res |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            vals.append(~(res >> 1) if res & 1 else res >> 1)
        lon += vals[0]
        lat += vals[1]
        pts.append([round(lon / 1e6, 6), round(lat / 1e6, 6)])
    return pts


def unpack(geo):
    """The plain form (for the scripts that read or rewrite the files)."""
    enc = geo.pop('enc', None)
    if enc:
        if 'canopy' in enc:
            geo['canopy'] = [decode(s) for s in enc['canopy']]
        if 'fairwayAuto' in enc:
            geo['fairwayAuto'] = {k: [decode(s) for s in v] for k, v in enc['fairwayAuto'].items()}
    return geo


def near_holes(geo, ring, m):
    lat0 = ring[0][1]
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110540
    segs = [(a, b) for h in geo['holes'] for a, b in zip(h['line'], h['line'][1:])]
    for p in ring[:: max(1, len(ring) // 6)]:
        for a, b in segs:
            ax, ay = (a[0] - p[0]) * kx, (a[1] - p[1]) * ky
            bx, by = (b[0] - p[0]) * kx, (b[1] - p[1]) * ky
            dx, dy = bx - ax, by - ay
            t = max(0, min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy or 1)))
            if math.hypot(ax + t * dx, ay + t * dy) <= m:
                return True
    return False


def pack(path):
    geo = unpack(json.load(open(path, encoding='utf-8')))
    before = os.path.getsize(path)
    enc = {}
    if geo.get('canopy'):
        kept = [r for r in geo.pop('canopy') if near_holes(geo, r, KEEP_M)]
        enc['canopy'] = [encode(r) for r in kept]
    if geo.get('fairwayAuto'):
        enc['fairwayAuto'] = {k: [encode(r) for r in v] for k, v in geo.pop('fairwayAuto').items()}
    if enc:
        geo['enc'] = enc
    json.dump(geo, open(path, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    print(os.path.basename(path), ':', before // 1024, '→', os.path.getsize(path) // 1024, 'KB,', len(enc.get('canopy', [])), 'crowns kept')


if __name__ == '__main__':
    for f in sys.argv[1:] or sorted(os.path.join(DATA, f) for f in os.listdir(DATA) if f.endswith('.json')):
        pack(f)
