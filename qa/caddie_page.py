"""Builds the Hetzenhof caddie workshop page: per hole the 2D image (qa/gallery.mjs), the caddie's advice and the
birdie book facts (scripts/caddiebook.ts). Usage: python caddie_page.py <caddie json> <gallery dir> <out.html>"""
import base64, json, os, sys
import cv2

cj, gdir, out = sys.argv[1:4]
holes = json.load(open(cj, encoding='utf-8'))
files = {}
for c in json.load(open(os.path.join(gdir, 'index.json'), encoding='utf-8')):
    for h in c['holes']:
        files.setdefault(h['label'], h['file'])
for h in holes:
    f = files.get(h['hole'])
    im = cv2.imread(os.path.join(gdir, f)) if f else None
    if im is None:
        continue
    im = im[int(im.shape[0] * 0.02): int(im.shape[0] * 0.86)]
    im = cv2.resize(im, (300, int(im.shape[0] * 300 / im.shape[1])), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode('.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 70])
    h['img'] = 'data:image/jpeg;base64,' + base64.b64encode(buf).decode()
page = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'caddie_template.html'), encoding='utf-8').read()
open(out, 'w', encoding='utf-8').write(page.replace('/*DATA*/[]', json.dumps(holes, ensure_ascii=False, separators=(',', ':'))))
print(len(holes), 'holes,', sum(1 for h in holes if 'img' in h), 'images,', os.path.getsize(out) // 1024, 'KB')
