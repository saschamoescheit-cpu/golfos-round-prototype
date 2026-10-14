"""Trees, bushes and woods for the drawn hole (2D view, Sascha 15.10.2026: "trees are missing in 2D – BeBrassie shows
them"): OpenStreetMap has only a part of them, so they are read from the aerial image itself. Trees are darker and more
textured than grass; inside the course (outline + 15 m) and outside fairways, greens, tees, bunkers and water every
such patch of at least 7 m² becomes a canopy outline. Written as `canopy` into src/data/courses/*.json.

Imagery: Baden-Württemberg LGL DOP20 (dl-de/by-2-0), Spain PNOA (IGN, CC BY 4.0).
Usage: python scripts/canopy.py [course.json …]   (needs opencv-python, numpy)
"""
import json, math, os, sys, urllib.request
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from packgeo import unpack  # noqa: E402 – course files may be packed (scripts/packgeo.py)

R = 6378137.0
# full resolution of the imagery (Sascha 15.10.2026: "maximum detail"): LGL DOP20 0.2 m, PNOA 0.25 m
M_PER_PX = 0.4  # set per course in run()
CHUNK = 1000  # pixels per WMS request
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'src', 'data', 'courses')


def merc(lon, lat):
    return math.radians(lon) * R, math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R


def unmerc(x, y):
    return math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)


def wms(lon, lat):
    """WMS template and its ground resolution (m per pixel)."""
    if 7.5 <= lon <= 10.5 and 47.53 <= lat <= 49.8:
        return 0.2, ('https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap'
                '&LAYERS=IMAGES_DOP_20_RGB&STYLES=&CRS=EPSG:3857&BBOX={b}&WIDTH={w}&HEIGHT={h}&FORMAT=image/jpeg')
    if -10 <= lon <= 4.5 and 35 <= lat <= 44:
        return 0.25, ('https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap'
                '&LAYERS=OI.OrthoimageCoverage&STYLES=&CRS=EPSG:3857&BBOX={b}&WIDTH={w}&HEIGHT={h}&FORMAT=image/jpeg')
    return None, None


def fetch(template, x0, y0, x1, y1, w, h):
    url = template.format(b=f'{x0},{y0},{x1},{y1}', w=w, h=h)
    req = urllib.request.Request(url, headers={'User-Agent': 'GolfOS-prototype/1.0'})
    data = urllib.request.urlopen(req, timeout=90).read()
    im = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if im is None:
        raise RuntimeError('no image: ' + data[:200].decode('latin1'))
    return im


def run(path):
    global M_PER_PX
    geo = unpack(json.load(open(path, encoding='utf-8')))
    pts = [p for h in geo['holes'] for p in h['line']] + [p for r in geo.get('boundary', []) for p in r]
    lon_c = sum(p[0] for p in pts) / len(pts)
    lat_c = sum(p[1] for p in pts) / len(pts)
    M_PER_PX, template = wms(lon_c, lat_c)
    if not template:
        print(os.path.basename(path), ': no imagery')
        return
    k = 1 / math.cos(math.radians(lat_c))  # mercator metres per ground metre
    step = M_PER_PX * k
    xs, ys = zip(*[merc(*p) for p in pts])
    pad = 60 * k
    x0, y0, x1, y1 = min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad
    W, H = int((x1 - x0) / step), int((y1 - y0) / step)
    img = np.zeros((H, W, 3), np.uint8)
    for cy in range(0, H, CHUNK):
        for cx in range(0, W, CHUNK):
            w, h = min(CHUNK, W - cx), min(CHUNK, H - cy)
            bx0, bx1 = x0 + cx * step, x0 + (cx + w) * step
            by1, by0 = y1 - cy * step, y1 - (cy + h) * step
            img[cy:cy + h, cx:cx + w] = fetch(template, bx0, by0, bx1, by1, w, h)
    to_px = lambda p: (int((merc(*p)[0] - x0) / step), int((y1 - merc(*p)[1]) / step))
    poly = lambda ring: np.array([to_px(p) for p in ring], np.int32)

    # where trees may be drawn: the course (outline + 40 m), not on fairways, greens, tees, bunkers, water
    area = np.zeros((H, W), np.uint8)
    if geo.get('boundary'):
        for r in geo['boundary']:
            cv2.fillPoly(area, [poly(r)], 255)
        area = cv2.dilate(area, np.ones((int(30 / M_PER_PX) | 1,) * 2, np.uint8))  # outline + 15 m
    else:
        for hl in geo['holes']:
            cv2.polylines(area, [poly(hl['line'])], False, 255, int(160 / M_PER_PX))
    for kind in ('fairway', 'green', 'tee', 'bunker'):
        for r in geo.get(kind, []):
            cv2.fillPoly(area, [poly(r)], 0)
    # water with 8 m around it: the dark shore of a pond mapped a little small is no tree (Son Gual)
    wet = np.zeros((H, W), np.uint8)
    for r in geo.get('water', []):
        cv2.fillPoly(wet, [poly(r)], 255)
    wet = cv2.dilate(wet, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(16 / M_PER_PX) | 1,) * 2))
    area[wet > 0] = 0

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    V = hsv[..., 2].astype(int)
    b, g, r = [img[..., c].astype(int) for c in range(3)]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    px = lambda m: max(3, int(round(m / M_PER_PX)) | 1)  # an odd kernel size for `m` metres
    mean = cv2.blur(gray, (px(3.6), px(3.6)))
    var = cv2.blur(gray * gray, (px(3.6), px(3.6))) - mean * mean
    # dark and green (the crowns), or very dark (their shadows), with texture; the threshold follows the image
    dark_level = min(95, np.percentile(V[area > 0], 30) if (area > 0).any() else 95)
    green = (g >= r) & (g >= b - 5)
    mask = (((V < dark_level) & green) | (V < 0.6 * dark_level)) & (var > 60)
    mask = (mask & (area > 0)).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((px(2.0), px(2.0)), np.uint8))
    # opening with a 2.6 m disc: tree crowns (and small single trees) stay, thin dark field rows go
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px(2.6), px(2.6))))
    mask[area == 0] = 0

    min_px = 7 / (M_PER_PX * M_PER_PX)  # from about one small tree (7 m²)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    canopy = []
    for c in contours:
        if cv2.contourArea(c) < min_px:
            continue
        c = cv2.approxPolyDP(c, 0.45 / M_PER_PX, True)  # crown outlines within half a metre
        if len(c) < 3:
            continue
        ring = []
        for (px, py) in c[:, 0, :]:
            lon, lat = unmerc(x0 + px * step, y1 - py * step)
            ring.append([round(lon, 6), round(lat, 6)])
        ring.append(ring[0])
        canopy.append(ring)
    geo['canopy'] = canopy
    json.dump(geo, open(path, 'w', encoding='utf-8'), separators=(',', ':'))
    cv2.imwrite(os.path.join(os.environ.get('CANOPY_DEBUG', '.'), os.path.basename(path) + '.jpg'),
                cv2.resize(np.where(mask[..., None] > 0, (0.5 * img + 0.5 * np.array([255, 0, 255])).astype(np.uint8), img), (W // 3, H // 3)))
    print(os.path.basename(path), ':', len(canopy), 'canopy outlines,', f'{W}x{H} px, dark level {dark_level:.0f}')


if __name__ == '__main__':
    files = sys.argv[1:] or sorted(os.path.join(DATA, f) for f in os.listdir(DATA) if f.endswith('.json'))
    for f in files:
        try:
            run(f)
        except Exception as e:  # noqa: BLE001 – one course failing must not stop the others
            print(os.path.basename(f), ': failed –', e)
