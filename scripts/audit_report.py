"""Caddie audit report (feature 020): turns scripts/audit-out/audit.json into one HTML page with a
yardage-book style map per hole. Usage: python scripts/audit_report.py <audit.json> <out.html>"""
import html
import json
import math
import sys

src, dst = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding='utf-8'))

WIND_DE = {'calm': 'Windstill', 'head': 'Gegenwind', 'tail': 'Rückenwind', 'from left': 'Wind von links', 'from right': 'Wind von rechts'}
WIND_SHORT = {'head': 'G', 'tail': 'R', 'from left': 'L', 'from right': 'Re'}
SPOT_DE = {'tee': 'Abschlag', '2nd centre': '2. Schlag Mitte', '2nd left': '2. Schlag 25 m links', '2nd right': '2. Schlag 25 m rechts', '3rd': '3. Schlag', 'missed short': '30 m vor dem Grün'}
KIND_DE = {'drive': 'Drive', 'approach': 'Fahne', 'layup': 'Vorlage', 'recovery': 'Ausweg'}
SEV_DE = {'error': 'Fehler', 'warn': 'Warnung', 'info': 'Hinweis'}
COURSE_ID = {}
FIRST_RUN = [
    ('Ziel verschiebt sich Richtung Aus (Seitenwind/Hang)', 73),
    ('Zielpunkt näher als 12 m an der Platzgrenze', 17),
    ('Ziel oder Landestelle im Wasser', 5),
    ('Ziel oder Landestelle im Bunker', 14),
    ('Wasser bis 15 m hinter der Landestelle', 17),
    ('Drive landet neben dem Fairway', 10),
    ('Vorlage, obwohl das Grün erreichbar ist*', 9),
]
NOW = [
    ('Ziel verschiebt sich Richtung Aus (Seitenwind/Hang)', 0),
    ('Zielpunkt näher als 12 m an der Platzgrenze', 0),
    ('Ziel oder Landestelle im Wasser', 0),
    ('Ziel oder Landestelle im Bunker', 0),
    ('Wasser bis 15 m hinter der Landestelle', 0),
    ('Drive landet neben dem Fairway', None),
    ('Vorlage, obwohl das Grün erreichbar ist*', 0),
]


def esc(s):
    return html.escape(str(s), quote=True)


def slug(s):
    return ''.join(ch.lower() if ch.isalnum() else '-' for ch in s).strip('-')


class Proj:
    """Local metres around the tee, rotated so the playing direction points up."""

    def __init__(self, tee, green):
        self.lon0, self.lat0 = tee
        self.k = math.cos(math.radians(self.lat0)) * 111320
        gx, gy = self.raw(green)
        b = math.atan2(gx, gy)  # bearing tee→green, from north, clockwise
        self.c, self.s = math.cos(b), math.sin(b)

    def raw(self, p):
        return ((p[0] - self.lon0) * self.k, (p[1] - self.lat0) * 111320)

    def __call__(self, p):
        x, y = self.raw(p)
        xr = x * self.c - y * self.s
        yr = x * self.s + y * self.c
        return (xr, -yr)


def path(points, proj, close=True):
    pts = [proj(p) for p in points]
    # thin out: keep a point when it is more than 1.5 m from the last kept one
    kept = []
    for q in pts:
        if not kept or abs(q[0] - kept[-1][0]) + abs(q[1] - kept[-1][1]) > 1.5:
            kept.append(q)
    if len(kept) < 2:
        return ''
    d = 'M' + ' L'.join(f'{x:.0f} {y:.0f}' for x, y in kept)
    return d + (' Z' if close else '')


def hole_svg(h):
    g = h['geometry']
    line = g['line']
    tee = line[0]
    green_c = line[-1]
    if g['green']:
        xs = sum(p[0] for p in g['green'][:-1]) / max(1, len(g['green']) - 1)
        ys = sum(p[1] for p in g['green'][:-1]) / max(1, len(g['green']) - 1)
        green_c = (xs, ys)
    pr = Proj(tee, green_c)
    pts = [pr(p) for p in line]
    for c in h['cases']:
        pts += [pr(c['from']), pr(c['aim']), pr(c['landing'])]
    if g['green']:
        pts += [pr(p) for p in g['green']]
    minx = min(p[0] for p in pts) - 35
    maxx = max(p[0] for p in pts) + 35
    miny = min(p[1] for p in pts) - 30
    maxy = max(p[1] for p in pts) + 30
    w = max(maxx - minx, 150)
    cx = (minx + maxx) / 2
    minx, maxx = cx - w / 2, cx + w / 2
    hgt = maxy - miny

    def inview(ring):
        for p in ring:
            x, y = pr(p)
            if minx - 60 <= x <= maxx + 60 and miny - 60 <= y <= maxy + 60:
                return True
        return False

    out = [f'<svg class="map" viewBox="{minx:.0f} {miny:.0f} {w:.0f} {hgt:.0f}" role="img" aria-label="Karte Loch {esc(h["hole"])}">']
    cid = f'c{slug(h["courseId"])}{slug(h["hole"])}'
    out.append(f'<defs><clipPath id="{cid}"><rect x="{minx:.0f}" y="{miny:.0f}" width="{w:.0f}" height="{hgt:.0f}"/></clipPath></defs>')
    out.append(f'<rect x="{minx:.0f}" y="{miny:.0f}" width="{w:.0f}" height="{hgt:.0f}" class="m-rough"/>')
    out.append(f'<g clip-path="url(#{cid})">')
    for r in g['trees']:
        if inview(r):
            out.append(f'<path class="m-trees" d="{path(r, pr)}"/>')
    for r in g['fairways']:
        out.append(f'<path class="m-fw" d="{path(r, pr)}"/>')
    for r in g['tees']:
        out.append(f'<path class="m-tee" d="{path(r, pr)}"/>')
    for r in g['water']:
        out.append(f'<path class="m-water" d="{path(r, pr)}"/>')
    for r in g['bunkers']:
        out.append(f'<path class="m-bunker" d="{path(r, pr)}"/>')
    if g['green']:
        out.append(f'<path class="m-green" d="{path(g["green"], pr)}"/>')
    for r in g['boundary']:
        if inview(r):
            out.append(f'<path class="m-ob" d="{path(r, pr)}"/>')
    out.append(f'<path class="m-line" d="{path(line, pr, False)}"/>')
    # 2nd shots (calm): where from, where to aim
    for c in h['cases']:
        if c['wind'] != 'calm' or c['spot'] == 'tee':
            continue
        fx, fy = pr(c['from'])
        ax, ay = pr(c['aim'])
        out.append(f'<line class="m-shot2" x1="{fx:.0f}" y1="{fy:.0f}" x2="{ax:.0f}" y2="{ay:.0f}"/>')
        out.append(f'<circle class="m-ball" cx="{fx:.0f}" cy="{fy:.0f}" r="3.2"/>')
        bad = any(f['severity'] != 'info' for f in c['findings'])
        out.append(f'<circle class="m-aim2{" bad" if bad else ""}" cx="{ax:.0f}" cy="{ay:.0f}" r="3.6"/>')
    # tee shot in the four winds (small letters) and calm (big gold)
    tx, ty = pr(tee)
    for c in h['cases']:
        if c['spot'] != 'tee':
            continue
        ax, ay = pr(c['aim'])
        bad = any(f['severity'] != 'info' for f in c['findings'])
        if c['wind'] == 'calm':
            out.append(f'<line class="m-shot" x1="{tx:.0f}" y1="{ty:.0f}" x2="{ax:.0f}" y2="{ay:.0f}"/>')
            out.append(f'<circle class="m-aim{" bad" if bad else ""}" cx="{ax:.0f}" cy="{ay:.0f}" r="5.5"/>')
        else:
            out.append(f'<text class="m-wind{" bad" if bad else ""}" x="{ax:.0f}" y="{ay + 3:.0f}">{WIND_SHORT[c["wind"]]}</text>')
    out.append('</g>')
    # 50 m scale
    sx, sy = minx + 8, maxy - 10
    out.append(f'<line class="m-scale" x1="{sx:.0f}" y1="{sy:.0f}" x2="{sx + 50:.0f}" y2="{sy:.0f}"/><text class="m-scale-t" x="{sx:.0f}" y="{sy - 4:.0f}">50 m</text>')
    out.append('</svg>')
    return ''.join(out)


def strip_tone(line):
    for t in ('[warn] ', '[plan] ', '[mental] ', '[muted] '):
        if line.startswith(t):
            return t[1:-2], line[len(t):]
    return 'why', line


def hole_card(h):
    fs = [(c, f) for c in h['cases'] for f in c['findings']]
    worst = 'error' if any(f['severity'] == 'error' for _, f in fs) else 'warn' if any(f['severity'] == 'warn' for _, f in fs) else 'info' if fs else 'ok'
    chips = ''.join(f'<li class="chip {f["severity"]}">{SEV_DE[f["severity"]]}: {esc(f["text"])} <span class="where">({SPOT_DE.get(c["spot"], c["spot"])}, {WIND_DE[c["wind"]]})</span></li>' for c, f in fs)
    tee_calm = next(c for c in h['cases'] if c['spot'] == 'tee' and c['wind'] == 'calm')
    lines = ''.join(f'<li class="t-{tone}">{esc(t)}</li>' for tone, t in (strip_tone(x) for x in tee_calm['lines']) if tone != 'mental')
    rows = []
    for c in h['cases']:
        if c['spot'] != 'tee':
            continue
        aim = next((t for tone, t in (strip_tone(x) for x in c['lines']) if t.startswith('Aim')), '–')
        rows.append(f'<tr><th scope="row">{WIND_DE[c["wind"]]}</th><td>{esc(c["club"])}</td><td class="num">{c["distance"]}</td><td class="num">{c["playsLike"]}</td><td>{KIND_DE.get(c["kind"], c["kind"])}</td><td class="aimtxt">{esc(aim)}</td></tr>')
    second = next((c for c in h['cases'] if c['spot'] in ('2nd centre', 'missed short') and c['wind'] == 'calm'), None)
    sec = ''
    if second:
        first = next((t for tone, t in (strip_tone(x) for x in second['lines']) if tone in ('warn', 'plan')), '')
        sec = f'<p class="second"><span class="lbl">{SPOT_DE[second["spot"]]}, windstill:</span> {esc(second["club"])} · {second["distance"]} m, spielt sich wie {second["playsLike"]} m. {esc(first)}</p>'
    tees = 'Gelb' if h['courseId'] != 'osm:relation/1130271' else 'Gelb'
    return f'''<article class="hole {worst}" id="{slug(h["course"])}-{slug(h["hole"])}" data-state="{worst}">
<header class="hole-h"><h3>Loch {esc(h["hole"])}</h3><span class="meta">Par {h["par"]} · {h["lengthM"]} m ab {tees}</span><span class="state {worst}">{ {"ok": "unauffällig", "info": "Hinweis", "warn": "Warnung", "error": "Fehler"}[worst] }</span></header>
<div class="hole-b">
<figure>{hole_svg(h)}</figure>
<div class="txt">
<p class="lbl">Abschlag, windstill – was der Caddie sagt</p>
<ul class="says">{lines}</ul>
<div class="tbl"><table><thead><tr><th scope="col">Abschlag bei</th><th scope="col">Schläger</th><th scope="col" class="num">m</th><th scope="col" class="num">spielt wie</th><th scope="col">Art</th><th scope="col">Ziel</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>
{sec}
{f'<ul class="chips">{chips}</ul>' if chips else ''}
</div></div></article>'''


courses = []
for h in data:
    if h['course'] not in courses:
        courses.append(h['course'])
n_cases = sum(len(h['cases']) for h in data)
all_f = [(h, c, f) for h in data for c in h['cases'] for f in c['findings']]
n_err = sum(1 for *_, f in all_f if f['severity'] == 'error')
n_warn = sum(1 for *_, f in all_f if f['severity'] == 'warn')
n_info = sum(1 for *_, f in all_f if f['severity'] == 'info')
off_fw = sum(1 for *_, f in all_f if f['code'] == 'drive-off-fairway')

rows_cmp = []
for (label, before), (_, after) in zip(FIRST_RUN, NOW):
    a = off_fw if after is None else after
    rows_cmp.append(f'<tr><th scope="row">{esc(label)}</th><td class="num">{before}</td><td class="num {"zero" if a == 0 else "some"}">{a}</td></tr>')

remaining = ''.join(
    f'<li><a href="#{slug(h["course"])}-{slug(h["hole"])}">{esc(h["course"])} {esc(h["hole"])}</a> · {SPOT_DE.get(c["spot"], c["spot"])}, {WIND_DE[c["wind"]]}: {esc(f["text"])}</li>'
    for h, c, f in all_f)

sections = []
for name in courses:
    holes = [h for h in data if h['course'] == name]
    cards = ''.join(hole_card(h) for h in holes)
    sections.append(f'<section class="course" id="{slug(name)}" data-course="{slug(name)}"><h2>{esc(name)} <span class="cnt">{len(holes)} Löcher</span></h2><div class="holes">{cards}</div></section>')

tabs = ''.join(f'<button type="button" class="tab" data-target="{slug(n)}" aria-pressed="false">{esc(n.replace("Golf de ", "").replace("Golfclub ", ""))}</button>' for n in courses)

page = f'''<title>Caddie-Prüfbericht</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Public+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a yardage book – summary on top, then one card per hole with the map left and the caddie's words right. */
:root {{
  --paper: #f2f4ee; --card: #fbfcf8; --ink: #17221b; --ink-2: #4d5b51; --rule: #d5dccf;
  --course: #1f5a3c; --flag: #c8412f; --amber: #a86a00; --info: #3f6c8f;
  --rough: #c9d8b4; --fw: #9ccb6e; --green: #63b84a; --sand: #e7d49b; --water: #6aa9d6; --trees: #5f8a4a; --teebox: #b9dc93; --ob: #c8412f; --gold: #e2a612; --line: #ffffff;
  --display: "Barlow Condensed", "Arial Narrow", sans-serif; --body: "Public Sans", "Segoe UI", system-ui, sans-serif; --mono: "IBM Plex Mono", ui-monospace, Consolas, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --paper: #111813; --card: #18211b; --ink: #e7eee6; --ink-2: #a7b6aa; --rule: #2c3a30;
  --course: #7cc79a; --flag: #ff7a66; --amber: #f0b54a; --info: #8ab9dc;
  --rough: #31432c; --fw: #4f7d36; --green: #6cc552; --sand: #9b8a57; --water: #2f6f9c; --trees: #23391d; --teebox: #5d8a3c; --ob: #ff7a66; --gold: #f2bb2a; --line: #e9f0e6;
  color-scheme: dark; }} }}
:root[data-theme="dark"] {{
  --paper: #111813; --card: #18211b; --ink: #e7eee6; --ink-2: #a7b6aa; --rule: #2c3a30;
  --course: #7cc79a; --flag: #ff7a66; --amber: #f0b54a; --info: #8ab9dc;
  --rough: #31432c; --fw: #4f7d36; --green: #6cc552; --sand: #9b8a57; --water: #2f6f9c; --trees: #23391d; --teebox: #5d8a3c; --ob: #ff7a66; --gold: #f2bb2a; --line: #e9f0e6;
  color-scheme: dark; }}
* {{ box-sizing: border-box; }}
body {{ background: var(--paper); color: var(--ink); font: 15px/1.5 var(--body); }}
.wrap {{ max-width: 1120px; margin: 0 auto; padding-inline: 20px; padding-block: 28px 64px; display: grid; gap: 28px; }}
h1, h2, h3 {{ font-family: var(--display); font-weight: 700; letter-spacing: 0.2px; text-wrap: balance; margin: 0; }}
h1 {{ font-size: clamp(34px, 6vw, 52px); line-height: 1; color: var(--course); }}
h2 {{ font-size: 30px; display: flex; gap: 12px; align-items: baseline; border-bottom: 2px solid var(--course); padding-bottom: 6px; }}
h2 .cnt {{ font: 500 14px var(--body); color: var(--ink-2); }}
.lede {{ max-width: 68ch; margin: 8px 0 0; color: var(--ink-2); font-size: 16px; }}
.facts {{ display: flex; flex-wrap: wrap; gap: 8px 22px; margin: 14px 0 0; padding: 0; list-style: none; font: 500 13px var(--mono); color: var(--ink-2); }}
.facts b {{ color: var(--ink); font-weight: 500; }}
.two {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }}
.panel {{ background: var(--card); border: 1px solid var(--rule); border-radius: 6px; padding: 18px; min-width: 0; }}
.panel h2 {{ font-size: 24px; border: 0; padding: 0; margin-bottom: 10px; }}
table {{ border-collapse: collapse; width: 100%; font-size: 14px; }}
th, td {{ text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--rule); vertical-align: top; }}
thead th {{ font: 600 11px var(--body); text-transform: uppercase; letter-spacing: 0.6px; color: var(--ink-2); }}
.num {{ text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }}
td.zero {{ color: var(--course); font-weight: 600; }}
td.some {{ color: var(--amber); font-weight: 600; }}
.foot {{ font-size: 13px; color: var(--ink-2); margin: 10px 0 0; }}
ol.rules {{ margin: 0; padding-left: 20px; display: grid; gap: 8px; }}
ol.rules li::marker {{ font-family: var(--mono); color: var(--course); }}
ol.rules b {{ font-weight: 600; }}
.ask {{ display: inline-block; margin-left: 6px; font: 600 11px var(--body); text-transform: uppercase; letter-spacing: 0.5px; color: var(--amber); }}
ul.rem {{ margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14px; }}
a {{ color: var(--course); }}
.legend {{ display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; padding: 0; list-style: none; font-size: 13px; color: var(--ink-2); }}
.legend i {{ display: inline-block; width: 14px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }}
.bar {{ position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; background: var(--paper); padding-block: 10px; border-bottom: 1px solid var(--rule); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }}
.tab, .flt {{ font: 600 14px var(--body); border: 1px solid var(--rule); background: var(--card); color: var(--ink); border-radius: 999px; padding: 6px 14px; cursor: pointer; }}
.tab[aria-pressed="true"] {{ background: var(--course); color: var(--paper); border-color: var(--course); }}
.flt {{ margin-left: auto; }}
.flt[aria-pressed="true"] {{ border-color: var(--amber); color: var(--amber); }}
.tab:focus-visible, .flt:focus-visible, a:focus-visible {{ outline: 2px solid var(--gold); outline-offset: 2px; }}
.course {{ display: grid; gap: 18px; }}
.holes {{ display: grid; gap: 18px; }}
.hole {{ background: var(--card); border: 1px solid var(--rule); border-radius: 6px; overflow: hidden; }}
.hole.warn {{ border-color: var(--amber); }}
.hole.error {{ border-color: var(--flag); }}
.hole-h {{ display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; padding: 12px 16px; border-bottom: 1px solid var(--rule); }}
.hole-h h3 {{ font-size: 26px; }}
.meta {{ font: 500 13px var(--mono); color: var(--ink-2); }}
.state {{ margin-left: auto; font: 600 11px var(--body); text-transform: uppercase; letter-spacing: 0.6px; padding: 2px 8px; border-radius: 3px; color: var(--course); border: 1px solid currentColor; }}
.state.info {{ color: var(--info); }} .state.warn {{ color: var(--amber); }} .state.error {{ color: var(--flag); }}
.hole-b {{ display: grid; grid-template-columns: minmax(150px, 240px) 1fr; gap: 18px; padding: 14px 16px 16px; }}
@media (max-width: 640px) {{ .hole-b {{ grid-template-columns: 1fr; }} figure {{ max-width: 260px; }} }}
figure {{ margin: 0; }}
.map {{ width: 100%; height: auto; max-height: 520px; display: block; border-radius: 4px; }}
.txt {{ min-width: 0; display: grid; gap: 10px; align-content: start; }}
.lbl {{ margin: 0; font: 600 11px var(--body); text-transform: uppercase; letter-spacing: 0.6px; color: var(--ink-2); }}
.says {{ margin: 0; padding: 0; list-style: none; display: grid; gap: 3px; }}
.says li {{ padding-left: 10px; border-left: 3px solid var(--rule); }}
.says .t-warn {{ border-color: var(--flag); }} .says .t-plan {{ border-color: var(--course); }} .says .t-why {{ color: var(--ink-2); font-size: 14px; }}
.tbl {{ overflow-x: auto; }}
.tbl table {{ font-size: 13px; min-width: 520px; }}
.tbl th[scope="row"] {{ font-weight: 600; white-space: nowrap; }}
.aimtxt {{ color: var(--ink-2); }}
.second {{ margin: 0; font-size: 14px; }}
.second .lbl {{ display: inline; }}
.chips {{ margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }}
.chip {{ font-size: 13px; padding: 4px 8px; border-radius: 3px; background: var(--paper); border-left: 3px solid var(--info); }}
.chip.warn {{ border-color: var(--amber); }} .chip.error {{ border-color: var(--flag); }}
.where {{ color: var(--ink-2); }}
.m-rough {{ fill: var(--rough); }} .m-trees {{ fill: var(--trees); }} .m-fw {{ fill: var(--fw); }} .m-tee {{ fill: var(--teebox); }}
.m-water {{ fill: var(--water); }} .m-bunker {{ fill: var(--sand); }} .m-green {{ fill: var(--green); stroke: var(--line); stroke-width: 0.8; }}
.m-ob {{ fill: none; stroke: var(--ob); stroke-width: 2.2; stroke-dasharray: 6 4; }}
.m-line {{ fill: none; stroke: var(--line); stroke-width: 1.2; stroke-dasharray: 4 4; opacity: 0.8; }}
.m-shot {{ stroke: var(--gold); stroke-width: 1.6; }}
.m-shot2 {{ stroke: var(--ink); stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.7; }}
.m-aim {{ fill: var(--gold); stroke: var(--ink); stroke-width: 1.2; }}
.m-aim2 {{ fill: var(--gold); stroke: var(--ink); stroke-width: 1; }}
.m-aim.bad, .m-aim2.bad {{ fill: var(--flag); }}
.m-ball {{ fill: var(--line); stroke: var(--ink); stroke-width: 1; }}
.m-wind {{ font: 600 9px var(--mono); fill: var(--ink); text-anchor: middle; paint-order: stroke; stroke: var(--gold); stroke-width: 2.4px; }}
.m-wind.bad {{ stroke: var(--flag); }}
.m-scale {{ stroke: var(--ink); stroke-width: 2; }}
.m-scale-t {{ font: 500 9px var(--mono); fill: var(--ink); }}
.empty {{ padding: 16px; color: var(--ink-2); }}
@media (prefers-reduced-motion: no-preference) {{ html {{ scroll-behavior: smooth; }} }}
</style>
<div class="wrap">
<header>
<h1>Caddie-Prüfbericht</h1>
<p class="lede">Der KI-Caddie hat jedes Loch der fünf Testplätze von mehreren Stellen und bei fünf Wetterlagen gespielt. Ein Prüfprogramm hat jede Empfehlung gegen die Platzkarte gehalten. Was falsch war, ist in der App behoben; was ein Golfprofi entscheiden sollte, steht unten für Chris.</p>
<ul class="facts"><li><b>{len(data)}</b> Löcher</li><li><b>{n_cases}</b> Situationen</li><li><b>{n_err}</b> Fehler</li><li><b>{n_warn}</b> Warnungen</li><li><b>{n_info}</b> Hinweise</li><li>Stand 11.10.2026</li></ul>
</header>

<div class="two">
<section class="panel" aria-labelledby="h-cmp">
<h2 id="h-cmp">Vorher und nachher</h2>
<table><thead><tr><th scope="col">Prüfung</th><th scope="col" class="num">Erster Lauf</th><th scope="col" class="num">Jetzt</th></tr></thead><tbody>{"".join(rows_cmp)}</tbody></table>
<p class="foot">* Diese 9 Fälle waren ein Fehler der Prüfung selbst: Sie hatte den Gegenwind nicht eingerechnet. Die übrigen Fälle waren echte Schwächen des Caddies und sind behoben. Die Drives neben dem Fairway kommen nur bei Gegenwind vor, wenn das Fairway erst nach der Flugweite beginnt.</p>
</section>
<section class="panel" aria-labelledby="h-set">
<h2 id="h-set">So wurde getestet</h2>
<ul class="rem">
<li>Schlägerweiten (Carry) eines mittleren Handicaps: Driver 200, Holz 3 185, Holz 5 172, Hybrid 165, Eisen 4–9 von 160 bis 110 m, PW 100, Wedges 85/70/55 m.</li>
<li>Wetter: windstill bei 20 °C sowie 20 km/h (Böen 30) von vorn, von hinten, von links und von rechts bei 15 °C.</li>
<li>Stellen: Abschlag (gelb), bei Par 4/5 die Landezone des Drives und je 25 m links und rechts davon, bei Par 5 zusätzlich der dritte Schlag; bei Par 3 ein Ball 30 m vor dem Grün.</li>
<li>Fahne in Grünmitte. Lochnotizen wie in der App (Hetzenhof 1A: Aus links und rechts).</li>
</ul>
</section>
</div>

<section class="panel" aria-labelledby="h-rules">
<h2 id="h-rules">Neue Regeln des Caddies – bitte prüfen, Chris</h2>
<ol class="rules">
<li><b>Abstand zum Aus:</b> Landestelle und Zielpunkt bleiben mindestens 20 m innerhalb der Platzgrenze. Bringt der Wind den Ball nicht zurück, ist er trotzdem im Spiel.<span class="ask">20 m richtig?</span></li>
<li><b>Seitenwind oder Hang Richtung Aus:</b> Der Vorhalt wird halbiert oder entfällt, wenn der Zielpunkt sonst näher als 20 m an die Grenze käme. Der Caddie sagt dann „only 6 m left – out of bounds“ oder „centre – out of bounds left“.</li>
<li><b>Wasser:</b> Die Landestelle liegt nicht im Wasser, und bis 15 m dahinter ist kein Wasser (Ausrollen). Wasser bis 12 m davor vermeidet er, wenn es geht.<span class="ask">15 / 12 m richtig?</span></li>
<li><b>Bunker und Bäume:</b> Weder Landestelle noch Zielpunkt liegen im Bunker oder im Wald. Am Hang landet der Ball am Zielpunkt und rollt erst dann weiter, darum zählt beides.</li>
<li><b>Lieber zur Seite als kürzer:</b> Der Caddie verschiebt die Landestelle erst bis 20 m zur Seite, dann bis 45 m kürzer (ein kleinerer Schläger). Beim Drive zieht er das Fairway vor.<span class="ask">Reihenfolge so richtig?</span></li>
<li><b>Annäherung:</b> Die Fahne bleibt das Ziel. Der Windvorhalt geht nicht ins Wasser und nicht näher ans Aus, als die Fahne selbst liegt.</li>
<li><b>Lochnotizen:</b> Aus, das nicht auf der Karte steht (z. B. Hetzenhof 1A), kennt der Caddie nur aus den Notizen. Zu dieser Seite zielt er nie.</li>
<li><b>Bäume im Weg:</b> Der Ausweg führt nie ins Wasser oder ins Aus.</li>
</ol>
</section>

<section class="panel" aria-labelledby="h-rem">
<h2 id="h-rem">Was noch auffällt</h2>
<ul class="rem">{remaining or '<li>Nichts.</li>'}</ul>
<p class="foot">Hinweise sind keine Fehler: Bei Gegenwind ist die Landestelle manchmal nur im Rough oder knapp hinter Wasser möglich. Ein Profi würde hier vielleicht einen anderen Schläger wählen.</p>
</section>

<section aria-labelledby="h-legend" class="panel">
<h2 id="h-legend">Karte lesen</h2>
<ul class="legend">
<li><i style="background:var(--fw)"></i>Fairway</li><li><i style="background:var(--green)"></i>Grün</li><li><i style="background:var(--sand)"></i>Bunker</li><li><i style="background:var(--water)"></i>Wasser</li><li><i style="background:var(--trees)"></i>Wald</li><li><i style="background:none;border:2px dashed var(--ob)"></i>Platzgrenze (Aus)</li>
<li><i style="background:var(--gold);border-radius:50%"></i>Zielpunkt Abschlag, windstill</li><li>G / R / L / Re: Zielpunkt bei Gegen-, Rücken-, Links- und Rechtswind</li><li><i style="background:var(--line);border:1px solid var(--ink);border-radius:50%"></i>Ball beim 2. Schlag, gestrichelt zum Ziel</li><li><i style="background:var(--flag);border-radius:50%"></i>Ziel mit Befund</li>
</ul>
<p class="foot">Die Karte ist so gedreht, dass vom Abschlag (unten) zum Grün (oben) gespielt wird. Die Caddie-Sätze stehen auf Englisch, so wie sie heute in der App erscheinen.</p>
</section>

<nav class="bar" aria-label="Plätze">{tabs}<button type="button" class="flt" id="flt" aria-pressed="false">Nur Löcher mit Befund</button></nav>
{"".join(sections)}
<p class="empty" id="none" hidden>Auf diesem Platz hat kein Loch einen Befund.</p>
</div>
<script>
(function () {{
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var flt = document.getElementById('flt');
  var none = document.getElementById('none');
  var current = null;
  try {{ current = localStorage.getItem('audit.course'); }} catch (e) {{}}
  if (location.hash) {{
    var t = document.getElementById(location.hash.slice(1));
    var sec = t && t.closest ? t.closest('.course') : null;
    if (sec) current = sec.id;
  }}
  if (!current || !document.getElementById(current)) current = tabs[0].getAttribute('data-target');
  function render() {{
    var onlyIssues = flt.getAttribute('aria-pressed') === 'true';
    var shown = 0;
    tabs.forEach(function (b) {{ b.setAttribute('aria-pressed', String(b.getAttribute('data-target') === current)); }});
    document.querySelectorAll('.course').forEach(function (s) {{
      s.hidden = s.id !== current;
      s.querySelectorAll('.hole').forEach(function (h) {{
        var hide = onlyIssues && h.getAttribute('data-state') === 'ok';
        h.hidden = hide;
        if (!s.hidden && !hide) shown++;
      }});
    }});
    none.hidden = shown > 0;
  }}
  tabs.forEach(function (b) {{ b.addEventListener('click', function () {{
    current = b.getAttribute('data-target');
    try {{ localStorage.setItem('audit.course', current); }} catch (e) {{}}
    render();
  }}); }});
  flt.addEventListener('click', function () {{ flt.setAttribute('aria-pressed', String(flt.getAttribute('aria-pressed') !== 'true')); render(); }});
  document.querySelectorAll('ul.rem a').forEach(function (a) {{ a.addEventListener('click', function () {{
    var t = document.getElementById(a.getAttribute('href').slice(1));
    var sec = t && t.closest('.course');
    if (sec) {{ current = sec.id; flt.setAttribute('aria-pressed', 'false'); render(); }}
  }}); }});
  render();
}})();
</script>
'''
open(dst, 'w', encoding='utf-8', newline='\n').write(page)
print('written', dst, round(len(page.encode('utf-8')) / 1024), 'KB')
