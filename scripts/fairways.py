"""Fairways from the aerial image (Sascha 15.10.2026: the 2D view at maximum detail – OSM maps many fairways only in
part, e.g. Hetzenhof 1A). Per course the script learns what mown fairway looks like from the fairway pieces that ARE in
OSM (colour and smoothness), and what the rough beside them looks like; along every hole (up to 40 m from its line)
the fairway areas are then read from the image. Written as `fairwayAuto` {hole ref: rings} into
src/data/courses/*.json – for drawing only (the caddie and the stats keep the OSM fairways).

Imagery: Baden-Württemberg LGL DOP20 (dl-de/by-2-0), Spain PNOA (IGN, CC BY 4.0).
Usage: python scripts/fairways.py [course.json …]   (needs opencv-python, numpy)
"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cv2  # noqa: E402
import numpy as np  # noqa: E402
from canopy import DATA, fetch, merc, unmerc, wms  # noqa: E402

CHUNK = 1000
CORRIDOR = 40  # m either side of the hole line


def mosaic(template, x0, y0, x1, y1, step):
    W, H = int((x1 - x0) / step), int((y1 - y0) / step)
    img = np.zeros((H, W, 3), np.uint8)
    for cy in range(0, H, CHUNK):
        for cx in range(0, W, CHUNK):
            w, h = min(CHUNK, W - cx), min(CHUNK, H - cy)
            img[cy:cy + h, cx:cx + w] = fetch(template, x0 + cx * step, y1 - (cy + h) * step, x0 + (cx + w) * step, y1 - cy * step, w, h)
    return img


def features(img, mpp):
    px = lambda m: max(3, int(round(m / mpp)) | 1)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    smooth = cv2.blur(lab, (px(1.5), px(1.5)))
    L = lab[..., 0]
    mean = cv2.blur(L, (px(2.0), px(2.0)))
    std = np.sqrt(np.maximum(cv2.blur(L * L, (px(2.0), px(2.0))) - mean * mean, 0))
    return np.dstack([smooth, std[..., None]])  # L, a, b, texture


def run(path):
    geo = json.load(open(path, encoding='utf-8'))
    holes = [h for h in geo['holes'] if len(h['line']) >= 2]
    pts = [p for h in holes for p in h['line']]
    lon_c = sum(p[0] for p in pts) / len(pts)
    lat_c = sum(p[1] for p in pts) / len(pts)
    mpp, template = wms(lon_c, lat_c)
    if not template:
        print(os.path.basename(path), ': no imagery')
        return
    k = 1 / math.cos(math.radians(lat_c))
    step = mpp * k
    px = lambda m: max(3, int(round(m / mpp)) | 1)
    tiles = []
    pos, neg = [], []
    for h in holes:
        xs, ys = zip(*[merc(*p) for p in h['line']])
        pad = (CORRIDOR + 25) * k
        x0, y0, x1, y1 = min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad
        img = mosaic(template, x0, y0, x1, y1, step)
        H, W = img.shape[:2]
        to_px = lambda p, x0=x0, y1=y1: (int((merc(*p)[0] - x0) / step), int((y1 - merc(*p)[1]) / step))
        poly = lambda ring: np.array([to_px(p) for p in ring], np.int32)
        corridor = np.zeros((H, W), np.uint8)
        cv2.polylines(corridor, [poly(h['line'])], False, 255, int(2 * CORRIDOR / mpp))
        # the first 40 m in front of the tee and the green surround are no fairway
        cv2.circle(corridor, to_px(h['line'][0]), int(40 / mpp), 0, -1)
        fw = np.zeros((H, W), np.uint8)
        for r in geo.get('fairway', []):
            cv2.fillPoly(fw, [poly(r)], 255)
        other = np.zeros((H, W), np.uint8)
        for kind in ('green', 'tee', 'bunker', 'water', 'canopy'):
            for r in geo.get(kind, []):
                cv2.fillPoly(other, [poly(r)], 255)
        other = cv2.dilate(other, np.ones((px(1.5), px(1.5)), np.uint8))
        f = features(img, mpp)
        inner = cv2.erode(fw, np.ones((px(3), px(3)), np.uint8))
        far = (cv2.dilate(fw, np.ones((px(10), px(10)), np.uint8)) == 0) & (corridor > 0) & (other == 0)
        p_, n_ = f[(inner > 0) & (other == 0)], f[far]
        if len(p_):
            pos.append(p_[:: max(1, len(p_) // 4000)])
        if len(n_):
            neg.append(n_[:: max(1, len(n_) // 4000)])
        tiles.append((h, img.shape, f, corridor, other, fw, x0, y1))
    if not pos or not neg:
        print(os.path.basename(path), ': no OSM fairways to learn from')
        return
    P, N = np.concatenate(pos), np.concatenate(neg)
    model = []
    for X in (P, N):
        mu = X.mean(0)
        cov = np.cov(X.T) + np.eye(4) * 1e-3
        model.append((mu, np.linalg.inv(cov), np.linalg.slogdet(cov)[1]))

    def score(F, m):
        mu, icov, logdet = m
        d = F - mu
        return -0.5 * (np.einsum('...i,ij,...j->...', d, icov, d) + logdet)

    out = {}
    total = 0
    for (h, shape, f, corridor, other, fw, x0, y1) in tiles:
        is_fw = (score(f, model[0]) > score(f, model[1])) & (corridor > 0) & (other == 0)
        mask = is_fw.astype(np.uint8) * 255
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px(3), px(3))))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px(5), px(5))))
        mask = mask | fw  # the mapped fairway always counts
        mask[corridor == 0] = 0
        line_mask = np.zeros(shape[:2], np.uint8)
        line_px = np.array([(int((merc(*p)[0] - x0) / step), int((y1 - merc(*p)[1]) / step)) for p in h['line']], np.int32)
        cv2.polylines(line_mask, [line_px], False, 255, int(30 / mpp))  # a fairway piece must reach within 15 m of the line
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        rings = []
        for c in contours:
            if cv2.contourArea(c) * mpp * mpp < 150:
                continue
            blob = np.zeros(shape[:2], np.uint8)
            cv2.drawContours(blob, [c], -1, 255, -1)
            if not (blob & line_mask).any():
                continue
            c = cv2.approxPolyDP(c, 0.5 / mpp, True)
            ring = [[round(v, 6) for v in unmerc(x0 + x * step, y1 - y * step)] for (x, y) in c[:, 0, :]]
            ring.append(ring[0])
            rings.append(ring)
        out[h['ref']] = rings
        total += len(rings)
    geo['fairwayAuto'] = out
    json.dump(geo, open(path, 'w', encoding='utf-8'), separators=(',', ':'))
    print(os.path.basename(path), ':', total, 'fairway areas on', len(out), 'holes')


if __name__ == '__main__':
    files = sys.argv[1:] or sorted(os.path.join(DATA, f) for f in os.listdir(DATA) if f.endswith('.json'))
    for f in files:
        try:
            run(f)
        except Exception as e:  # noqa: BLE001
            print(os.path.basename(f), ': failed –', e)
