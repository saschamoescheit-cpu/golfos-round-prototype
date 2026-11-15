"""Tee boxes where a course has none mapped (night 14./15.11.2026, Sascha: "the 2D views of the US courses – every detail
there is"): StoneGate Cypress and Oaks, The Reserve and others have no tee areas in OSM, so the drawn hole (2D) starts in
the rough. Each hole line starts at its (back) tee – there a box 10 m wide and 24 m long, along the line's first stretch,
as the tee complexes on the Florida aerials are; only where no mapped tee lies within 25 m of the line's start.
Usage: python scripts/teeboxes.py [course.json …]"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from packgeo import unpack  # noqa: E402

WIDTH, LENGTH, NEAR = 10.0, 24.0, 25.0


def metres(lat):
    return 111320 * math.cos(math.radians(lat)), 110540


def box(line):
    (x0, y0), (x1, y1) = line[0], line[1]
    kx, ky = metres(y0)
    dx, dy = (x1 - x0) * kx, (y1 - y0) * ky
    n = math.hypot(dx, dy) or 1
    ux, uy = dx / n, dy / n  # along the line
    vx, vy = -uy, ux  # across
    pts = []
    for a, b in ((-2, -WIDTH / 2), (LENGTH - 2, -WIDTH / 2), (LENGTH - 2, WIDTH / 2), (-2, WIDTH / 2)):
        pts.append([round(x0 + (a * ux + b * vx) / kx, 7), round(y0 + (a * uy + b * vy) / ky, 7)])
    return pts + [pts[0]]


def near(p, ring):
    kx, ky = metres(p[1])
    return min(math.hypot((q[0] - p[0]) * kx, (q[1] - p[1]) * ky) for q in ring) <= NEAR


def run(path):
    geo = unpack(json.load(open(path, encoding='utf-8')))
    tees = geo.get('tee', [])
    added = 0
    for h in geo['holes']:
        line = h.get('line') or []
        if len(line) < 2 or any(near(line[0], r) for r in tees):
            continue
        tees.append(box(line))
        added += 1
    geo['tee'] = tees
    json.dump(geo, open(path, 'w', encoding='utf-8'), separators=(',', ':'))
    print(os.path.basename(path), ':', added, 'tee boxes added')


if __name__ == '__main__':
    for f in sys.argv[1:]:
        run(f)
