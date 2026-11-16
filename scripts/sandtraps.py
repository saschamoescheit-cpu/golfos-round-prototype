"""Bunkers from the aerial and the lidar where OSM maps none (night 15./16.11.2026, Sascha: "das maximal mögliche an
Details" – StoneGate Cypress had not one bunker in the 2D view; lidar/us_bunkers.py found none there, its test for green
grass round the sand fails on the winter-brown turf of the Esri image). A bunker is bright, unsaturated sand (brighter
than the turf round it by a clear margin) that lies LOWER than its surroundings in the USGS 3DEP bare-earth lidar (a
bunker is dug in: 0.15 m and more below its edge, and has turf round it) – a roof, a pool deck, a path or a pale patch of turf is not.
20–1500 m², compact, within 50 m of a hole line and inside the course outline, not on a green, water, tee or a bunker already mapped.

Florida only (3DEP 1 m lidar; aerial as scripts/canopy.py: Osceola County 2026, else Esri – FL_IMAGERY=esri).
Usage: python scripts/sandtraps.py [--dry] [--check dir] course.json [holes,comma,separated]
Then: python scripts/packgeo.py course.json"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cv2  # noqa: E402
import numpy as np  # noqa: E402
from canopy import fetch, merc, unmerc, wms  # noqa: E402
from packgeo import unpack  # noqa: E402
from teepads import dem  # noqa: E402

PX = 0.4  # ground metres per pixel
SIDE = 50.0
AREA = (20.0, 1500.0)
SINK = 0.15  # m below the ring round it


def run(path, only=None, dry=False, check=None):
    geo = unpack(json.load(open(path, encoding='utf-8')))
    pts = [p for h in geo['holes'] for p in h['line']]
    lat_c = sum(p[1] for p in pts) / len(pts)
    _, tmpl = wms(sum(p[0] for p in pts) / len(pts), lat_c)
    k = 1 / math.cos(math.radians(lat_c))
    bunkers = geo.setdefault('bunker', [])
    added = []
    for hole in geo['holes']:
        if only and hole['ref'] not in only:
            continue
        line = [merc(*p) for p in hole['line']]
        m = (SIDE + 20) * k
        X0 = min(p[0] for p in line) - m; X1 = max(p[0] for p in line) + m
        Y0 = min(p[1] for p in line) - m; Y1 = max(p[1] for p in line) + m
        W = int((X1 - X0) / k / PX); H = int((Y1 - Y0) / k / PX)
        img = np.zeros((H, W, 3), np.uint8)
        step = 1500
        for y0 in range(0, H, step):
            for x0 in range(0, W, step):
                w, h = min(step, W - x0), min(step, H - y0)
                img[y0:y0 + h, x0:x0 + w] = cv2.resize(fetch(tmpl, X0 + (X1 - X0) * x0 / W, Y1 - (Y1 - Y0) * (y0 + h) / H,
                                                             X0 + (X1 - X0) * (x0 + w) / W, Y1 - (Y1 - Y0) * y0 / H, w, h), (w, h))
        z = dem(X0, Y0, X1, Y1, W, H)
        if z is None:
            print(hole['ref'], 'no lidar')
            continue
        zf = cv2.GaussianBlur(np.where(np.isnan(z), np.nanmedian(z), z).astype(np.float32), (0, 0), 0.6 / PX)
        px = lambda p: [(p[0] - X0) / (X1 - X0) * W, (Y1 - p[1]) / (Y1 - Y0) * H]  # noqa: E731
        ring_px = lambda r: np.array([px(merc(*q)) for q in r], np.int32)  # noqa: E731
        corr = np.zeros((H, W), np.uint8)
        cv2.polylines(corr, [np.array([px(p) for p in line], np.int32)], False, 1, int(2 * SIDE / PX))
        block = np.zeros((H, W), np.uint8)
        for key, grow in (('green', 0), ('water', 2), ('tee', 1), ('bunker', 2)):
            for r in geo.get(key, []):
                cv2.fillPoly(block, [ring_px(r)], 1)
                if grow:
                    cv2.polylines(block, [ring_px(r)], True, 1, int(2 * grow / PX))
        # inside the course: its OSM outline and 10 m (a verge by the road, a back yard is not a bunker)
        if geo.get('boundary'):
            inside = np.zeros((H, W), np.uint8)
            for r in geo['boundary']:
                cv2.fillPoly(inside, [ring_px(r)], 1)
            corr &= cv2.dilate(inside, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(20 / PX) | 1,) * 2))
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        V = hsv[:, :, 2].astype(np.float32); S = hsv[:, :, 1].astype(np.float32)
        # brighter than the ground 15 m round it, and unsaturated: sand on green or on winter-brown turf alike
        ground = cv2.blur(V, (int(30 / PX) | 1,) * 2)
        sand = ((V > ground + 28) & (V > 165) & (S < 70)).astype(np.uint8)
        sand = cv2.morphologyEx(sand, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        sand = cv2.morphologyEx(sand, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        sand &= (corr > 0).astype(np.uint8)
        # the sand's darker rim (shade, wet sand) belongs to it: grown from the bright core by up to 2.5 m
        loose = ((V > ground + 10) & (S < 85)).astype(np.uint8)
        grown = cv2.dilate(sand, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(5 / PX) | 1,) * 2)) & loose
        sand = cv2.morphologyEx(sand | grown, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        n, lbl, stats, cent = cv2.connectedComponentsWithStats(sand)
        found = []
        for c in range(1, n):
            area = stats[c, cv2.CC_STAT_AREA] * PX * PX
            if not AREA[0] <= area <= AREA[1]:
                continue
            bx, by, bw, bh = stats[c, 0], stats[c, 1], stats[c, 2], stats[c, 3]
            g = int(6 / PX)
            x0, y0, x1, y1 = max(0, bx - g), max(0, by - g), min(W, bx + bw + g), min(H, by + bh + g)
            comp = (lbl[y0:y1, x0:x1] == c).astype(np.uint8)
            fill = np.zeros_like(comp)
            cs0, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            cv2.drawContours(fill, cs0, -1, 1, -1)  # holes (a tuft, a rake's shadow) filled
            comp = fill
            on = comp > 0
            if block[y0:y1, x0:x1][on].mean() > 0.2:
                continue
            cs, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE, offset=(x0, y0))
            big = max(cs, key=cv2.contourArea)
            per = cv2.arcLength(big, True)
            round_ = 4 * math.pi * cv2.contourArea(big) / (per * per) if per else 0
            (_, _), (rw, rh), _ = cv2.minAreaRect(big)
            boxy = cv2.contourArea(big) / max(1.0, rw * rh)
            ring = cv2.dilate(comp, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(5 / PX) | 1,) * 2)) - cv2.dilate(comp, np.ones((3, 3), np.uint8))
            zz = zf[y0:y1, x0:x1]
            sink = float(np.median(zz[ring > 0]) - np.median(zz[on])) if ring.any() else 0.0
            hh = hsv[y0:y1, x0:x1]
            turf = (hh[:, :, 0] >= 15) & (hh[:, :, 0] <= 95) & (hh[:, :, 1] >= 30) & (hh[:, :, 2] < 235)
            grass = float(turf[ring > 0].mean()) if ring.any() else 0.0
            info = dict(at=(int(cent[c][0]), int(cent[c][1])), m2=round(area), sink=round(sink, 2), round=round(round_, 2), grass=round(grass, 2),
                        boxy=round(boxy, 2), v=int(np.median(V[y0:y1, x0:x1][on])), s=int(np.median(S[y0:y1, x0:x1][on])))
            why = ('strip' if round_ < 0.2 else 'box (a roof, a court)' if boxy > 0.9 and area > 60 else
                   'not dug in' if sink < SINK else 'no turf round it' if grass < 0.7 else 'dull' if info['v'] < 170 and (info['s'] > 50 or area < 100) else '')
            if os.environ.get('DEBUG'):
                print('   ', why or 'BUNKER', info)
            if why:
                continue
            c2 = cv2.approxPolyDP(big, 0.5 / PX, True)[:, 0, :]
            if len(c2) < 4:
                continue
            ll = [[round(a, 7), round(b, 7)] for a, b in (unmerc(X0 + (x + 0.5) / W * (X1 - X0), Y1 - (y + 0.5) / H * (Y1 - Y0)) for x, y in c2)]
            found.append(ll + [ll[0]])
            cv2.fillPoly(block, [big], 1)  # the next hole's corridor overlaps: not twice
        print(f"{hole['ref']}: {len(found)} bunkers", flush=True)
        added += found
        bunkers += found
        if check:
            os.makedirs(check, exist_ok=True)
            ov = img.copy()
            for r in found:
                cv2.polylines(ov, [ring_px(r)], True, (0, 0, 255), 2)
            cv2.imwrite(os.path.join(check, f"b{int(hole['ref']):02d}.jpg"), ov, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not dry:
        json.dump(geo, open(path, 'w', encoding='utf-8'), separators=(',', ':'))
    print(os.path.basename(path), ':', len(added), 'bunkers added', '(dry run)' if dry else '')
    return added


if __name__ == '__main__':
    args = sys.argv[1:]
    dry = '--dry' in args
    check = None
    if '--check' in args:
        check = args[args.index('--check') + 1]
        args = [a for a in args if a != check]
    args = [a for a in args if not a.startswith('--')]
    run(args[0], args[1].split(',') if len(args) > 1 else None, dry, check)
