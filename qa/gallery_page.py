"""Builds the 2D gallery page from qa/gallery.mjs output: every hole as a small JPEG (data URI) in one HTML file.
Usage: python gallery_page.py <gallery dir> <out.html>"""
import base64, json, os, sys
import cv2

src, out = sys.argv[1], sys.argv[2]
index = json.load(open(os.path.join(src, 'index.json'), encoding='utf-8'))
data = []
for c in index:
    holes = []
    for h in c['holes']:
        im = cv2.imread(os.path.join(src, h['file']))
        if im is None:
            continue
        H, W = im.shape[:2]
        # the map without the bottom hole bar, 300 px wide
        im = im[: int(H * 0.86)]
        s = 300 / W
        im = cv2.resize(im, (300, int(im.shape[0] * s)), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode('.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 62])
        holes.append({'l': h['label'], 'p': h['par'], 'i': 'data:image/jpeg;base64,' + base64.b64encode(buf).decode()})
    data.append({'c': c['course'], 'h': holes})

page = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gallery_template.html'), encoding='utf-8').read()
html = page.replace('/*DATA*/[]', json.dumps(data, separators=(',', ':')))
open(out, 'w', encoding='utf-8').write(html)
print(sum(len(c['h']) for c in data), 'holes,', os.path.getsize(out) // 1024, 'KB')
