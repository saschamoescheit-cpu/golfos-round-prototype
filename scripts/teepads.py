"""Every tee box of a hole, not only the back one (night 15./16.11.2026, Sascha for the USA trip: "das maximal mögliche an
Details" – OSM maps one tee per hole at the Legends, the 2D view showed one small oval where the aerial has four or five
boxes). A tee box is a raised, flat, mown pad: it is found in the USGS 3DEP bare-earth lidar (1 m) as a patch standing
0.25 m or more above its surroundings with a slope under 5 %, 40–1100 m², compact (a box or an oval, not a berm or a
path), on the first part of the hole (from 60 m behind the line's start to 40 % of the hole, at most 170 m), within 30 m
of the line – not on or by a green, bunker or water, not on a mapped tee already, and grass (not sand) on the aerial.
Each pad becomes a rounded outline in `tee`; the hole's own lines are not changed.

Florida only (3DEP 1 m lidar everywhere there; aerial as scripts/canopy.py: Osceola County 2026, else Esri).
Usage: python scripts/teepads.py [--dry] [--check dir] course.json [holes,comma,separated]
Then: python scripts/packgeo.py course.json"""
import json, math, os, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cv2  # noqa: E402
import numpy as np  # noqa: E402
from canopy import fetch, merc, unmerc, wms  # noqa: E402
from packgeo import unpack  # noqa: E402

DEM = ('https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage'
       '?bbox={b}&bboxSR=3857&imageSR=3857&size={w},{h}&format=tiff&pixelType=F32'
       '&interpolation=RSP_BilinearInterpolation&noData=-9999&f=image')
TMP = os.path.join(os.environ.get('TEMP', '.'), 'golfos_teepads.tif')
PX = 0.5  # ground metres per pixel
BACK, AHEAD_MAX, AHEAD_SHARE, SIDE = 60.0, 170.0, 0.4, 30.0
RAISE, SLOPE = 0.25, 0.05
AREA = (40.0, 1100.0)
TEX = 9.0  # median grey-level spread (7 px) of mown turf on the 0.5 m aerial; crowns and rough are coarser


def dem(x0, y0, x1, y1, w, h):
    url = DEM.format(b=f'{x0},{y0},{x1},{y1}', w=w, h=h)
    for attempt in range(5):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'GolfOS-prototype (tee boxes)'}), timeout=120).read()
            open(TMP, 'wb').write(data)
            a = cv2.imread(TMP, cv2.IMREAD_UNCHANGED)
            if a is not None and a.shape[:2] == (h, w):
                a = a.astype(np.float64)
                a[a < -1000] = np.nan
                return a
        except Exception as ex:  # noqa: BLE001
            print('   retry', attempt + 1, str(ex)[:80], flush=True)
        time.sleep(3 * (attempt + 1))
    return None


def seg_dist(p, line):
    best = 1e18
    for a, b in zip(line, line[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / ((dx * dx + dy * dy) or 1)))
        best = min(best, math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy))
    return best


def run(path, only=None, dry=False, check=None, near=None):
    geo = unpack(json.load(open(path, encoding='utf-8')))
    tees_before = list(geo.get('tee', []))
    cands = {}
    pts = [p for h in geo['holes'] for p in h['line']]
    lat_c = sum(p[1] for p in pts) / len(pts)
    _, tmpl = wms(sum(p[0] for p in pts) / len(pts), lat_c)
    k = 1 / math.cos(math.radians(lat_c))  # mercator metres per ground metre
    tees = geo.get('tee', [])
    added = []
    for hole in geo['holes']:
        if only and hole['ref'] not in only:
            continue
        line = [merc(*p) for p in hole['line']]
        length = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(line, line[1:])) / k
        ahead = min(AHEAD_MAX, length * AHEAD_SHARE)
        # the stretch searched: the line from BACK m behind its start to `ahead` m along it
        (ax, ay), (bx, by) = line[0], line[1]
        d = math.hypot(bx - ax, by - ay) or 1
        back = (ax - (bx - ax) / d * BACK * k, ay - (by - ay) / d * BACK * k)
        stretch, run_m = [back, line[0]], 0.0
        for a, b in zip(line, line[1:]):
            seg = math.hypot(b[0] - a[0], b[1] - a[1]) / k
            if run_m + seg >= ahead:
                t = (ahead - run_m) / seg
                stretch.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
                break
            stretch.append(b)
            run_m += seg
        m = (SIDE + 25) * k
        X0 = min(p[0] for p in stretch) - m; X1 = max(p[0] for p in stretch) + m
        Y0 = min(p[1] for p in stretch) - m; Y1 = max(p[1] for p in stretch) + m
        W = int((X1 - X0) / k / PX); H = int((Y1 - Y0) / k / PX)
        z = dem(X0, Y0, X1, Y1, W, H)
        if z is None:
            print(hole['ref'], 'no lidar')
            continue
        img = fetch(tmpl, X0, Y0, X1, Y1, W, H)
        px = lambda p: [(p[0] - X0) / (X1 - X0) * W, (Y1 - p[1]) / (Y1 - Y0) * H]  # noqa: E731
        ring_px = lambda r: np.array([px(merc(*q)) for q in r], np.int32)  # noqa: E731
        zf = np.where(np.isnan(z), np.nanmedian(z), z).astype(np.float32)
        zs = cv2.GaussianBlur(zf, (0, 0), 1.0 / PX)
        # surroundings: the 20th percentile in a 36 m window ≈ the ground the pad stands on
        small = cv2.resize(zf, (max(1, W // 4), max(1, H // 4)), interpolation=cv2.INTER_AREA)
        from scipy.ndimage import percentile_filter  # noqa: E402
        bg = cv2.resize(percentile_filter(small, 20, size=int(36 / PX / 4) | 1), (W, H), interpolation=cv2.INTER_LINEAR)
        gy, gx = np.gradient(zs, PX)
        slope = np.hypot(gx, gy)
        raised = (zs - bg > RAISE) & (slope < SLOPE)
        # where to look: by the stretch of the line
        corr = np.zeros((H, W), np.uint8)
        cv2.polylines(corr, [np.array([px(p) for p in stretch], np.int32)], False, 1, int(2 * SIDE / PX))
        # not on greens, bunkers, water, tees already mapped
        block = np.zeros((H, W), np.uint8)
        for key, grow in (('green', 10), ('bunker', 2), ('water', 3), ('tee', 2), ('fairway', 0)):
            for r in geo.get(key, []):
                cv2.fillPoly(block, [ring_px(r)], 1)
                cv2.polylines(block, [ring_px(r)], True, 1, int(2 * grow / PX))
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        sand = (hsv[:, :, 2] > 190) & (hsv[:, :, 1] < 60)
        # tree crowns already read off the aerial (scripts/canopy.py): a raised patch under trees is a berm, not a tee
        crowns = np.zeros((H, W), np.uint8)
        for r in geo.get('canopy', []):
            q = ring_px(r)
            if cv2.contourArea(q) * PX * PX < 5000:  # a wood's outline (a ring round whole holes) is not filled
                cv2.fillPoly(crowns, [q], 1)
        grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
        tex = np.sqrt(np.maximum(cv2.blur(grey * grey, (7, 7)) - cv2.blur(grey, (7, 7)) ** 2, 0))
        mown = ((cv2.blur(tex, (5, 5)) < TEX * 1.2) & (crowns == 0)).astype(np.uint8)
        mown = cv2.morphologyEx(mown, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        found, taken = [], np.zeros((H, W), np.uint8)
        # several levels: two boxes side by side merge at 0.25 m and part higher up – the compact parts are taken
        for level in (RAISE, 0.4, 0.55, 0.75):
          mask = ((zs - bg > level) & (slope < SLOPE) & (corr > 0) & (block == 0) & (mown > 0) & (taken == 0)).astype(np.uint8)
          mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
          mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
          n, lbl, stats, cent = cv2.connectedComponentsWithStats(mask)
          for c in range(1, n):
              area = stats[c, cv2.CC_STAT_AREA] * PX * PX
              if not AREA[0] <= area <= AREA[1]:
                  continue
              comp = (lbl == c).astype(np.uint8)
              cs, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
              big = max(cs, key=cv2.contourArea)
              (_, _), (rw, rh), _ = cv2.minAreaRect(big)
              short, long_ = sorted((rw * PX, rh * PX))
              fill = cv2.contourArea(big) / max(1.0, rw * rh)
              on = comp > 0
              ys_, xs_ = np.nonzero(comp)
              A = np.c_[xs_ * PX, ys_ * PX, np.ones(len(xs_))]
              coef, *_ = np.linalg.lstsq(A, zs[ys_, xs_], rcond=None)
              flat = float(np.std(zs[ys_, xs_] - A @ coef))
              info = dict(at=(int(cent[c][0]), int(cent[c][1])), m2=round(area), up=round(float(np.median((zs - bg)[on])), 2),
                          size=(round(short, 1), round(long_, 1)), fill=round(fill, 2), flat=round(flat, 3),
                          crowns=round(float(crowns[on].mean()), 2), tex=round(float(np.median(tex[on])), 1), sand=round(float(sand[on].mean()), 2),
                          hue=int(np.median(hsv[:, :, 0][on])), sat=int(np.median(hsv[:, :, 1][on])))
              cm = (X0 + cent[c][0] / W * (X1 - X0), Y1 - cent[c][1] / H * (Y1 - Y0))
              own = min(seg_dist(cm, stretch), seg_dist(cm, line))
              other = min((seg_dist(cm, [merc(*q) for q in h2['line']]) for h2 in geo['holes'] if h2 is not hole), default=1e18)
              why = ('other hole' if other + 5 * k < own else 'narrow' if short < 5 else 'long' if long_ / short > 4 else 'ragged' if fill < 0.6 else
                     'sand' if info['sand'] > 0.3 else 'not flat' if flat > 0.12 else 'trees' if info['crowns'] > 0.35 else
                     'rough' if info['tex'] > TEX else
                     'not green' if not (30 <= info['hue'] <= 90 and info['sat'] >= 45) else '')
              if os.environ.get('DEBUG'):
                  print('   ', why or 'TEE', level, info)
              # --near M (night 20./21.11.2026, Cypress and Reserve: dams by the lakes and mounds in the fairway passed the
              # checks above): only the boxes of the tee complex – within M m of a mapped tee, at most 300 m², not long
              if not why and near:
                  mapped = [np.mean([merc(*q) for q in r], axis=0) for r in tees_before]
                  dist = min((math.hypot(cm[0] - t[0], cm[1] - t[1]) / k for t in mapped), default=1e9)
                  why = 'far' if dist > near else 'big' if area > 300 else 'oblong' if long_ / short > 2.5 else ''
              if why:
                  continue
              ring = cv2.approxPolyDP(cv2.convexHull(big), 0.6 / PX, True)[:, 0, :]  # a box or an oval: its hull
              if len(ring) < 4:
                  continue
              ll = [list(unmerc(X0 + (x + 0.5) / W * (X1 - X0), Y1 - (y + 0.5) / H * (Y1 - Y0))) for x, y in ring]
              ll = [[round(a, 7), round(b, 7)] for a, b in ll]
              found.append((ll + [ll[0]], area, float(np.nanmedian((zs - bg)[comp > 0]))))
              taken = cv2.dilate(np.maximum(taken, comp), np.ones((5, 5), np.uint8))
        print(f"{hole['ref']}: {len(found)} tee pads " + ' '.join(f'{a:.0f}m²/+{h:.2f}' for _, a, h in found), flush=True)
        for ring, _, _ in found:
            added.append(ring)
            tees.append(ring)
        cands[hole['ref']] = [r for r, _, _ in found]
        if check:
            os.makedirs(check, exist_ok=True)
            ov = img.copy()
            for r in tees_before:
                cv2.polylines(ov, [ring_px(r)], True, (255, 0, 255), 2)
            for n_, (r, _, _) in enumerate(found, 1):
                q = ring_px(r)
                cv2.polylines(ov, [q], True, (0, 255, 255), 2)
                # numbered, so a pad can be named for the decision (the candidates in tees.json beside the images)
                x_, y_ = int(q[:, 0].max()) + 3, int(q[:, 1].min()) + 12
                cv2.putText(ov, str(n_), (x_, y_), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3)
                cv2.putText(ov, str(n_), (x_, y_), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
            rel = np.clip((zs - bg) / 1.0 * 255, 0, 255).astype(np.uint8)
            cv2.imwrite(os.path.join(check, f"tee{int(hole['ref']):02d}.jpg"),
                        np.hstack([ov, cv2.cvtColor(rel, cv2.COLOR_GRAY2BGR), cv2.cvtColor((mown * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)]))
    geo['tee'] = tees
    if check:
        json.dump(cands, open(os.path.join(check, 'tees.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    if not dry:
        json.dump(geo, open(path, 'w', encoding='utf-8'), separators=(',', ':'))
    print(os.path.basename(path), ':', len(added), 'tee pads added', '(dry run)' if dry else '')
    return added


if __name__ == '__main__':
    args = sys.argv[1:]
    dry = '--dry' in args
    check = near = None
    if '--check' in args:
        check = args[args.index('--check') + 1]
        args = [a for a in args if a != check]
    if '--near' in args:
        near = float(args[args.index('--near') + 1])
        args = [a for a in args if a != args[args.index('--near') + 1]]
    args = [a for a in args if not a.startswith('--')]
    run(args[0], args[1].split(',') if len(args) > 1 else None, dry, check, near)
