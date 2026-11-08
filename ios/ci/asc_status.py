# How the TestFlight builds stand for the testers (Sascha 08.11.2026: "check whether the external group all have the
# current version – or at least that it is there for them"): the newest builds with Apple's state for the external
# testers (in review, approved, testing, expired), how often each was installed, and per external group which build it
# has and how many testers are in it. Counts only (a public repo): no names, no e-mail addresses.
# Usage: python3 ios/ci/asc_status.py
import json, os, time, urllib.error, urllib.parse, urllib.request
import jwt

BUNDLE = 'de.moescheit.golfos'


def token():
    now = int(time.time())
    return jwt.encode({'iss': os.environ['ASC_ISSUER_ID'], 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'},
                      os.environ['ASC_KEY_P8'], algorithm='ES256', headers={'kid': os.environ['ASC_KEY_ID'], 'typ': 'JWT'})


TOKEN = token()


def call(path, **q):
    url = 'https://api.appstoreconnect.apple.com' + path + ('?' + urllib.parse.urlencode(q) if q else '')
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + TOKEN})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, {'error': e.read()[:300].decode(errors='replace')}


def say(text, kind='notice'):
    print(f'::{kind}::{text}')
    print(text)


_, apps = call('/v1/apps', **{'filter[bundleId]': BUNDLE})
app = apps['data'][0]['id']

# the newest builds: state for the external testers, installs
_, builds = call('/v1/builds', **{'filter[app]': app, 'sort': '-uploadedDate', 'limit': 6, 'include': 'buildBetaDetail'})
details = {i['id']: i['attributes'] for i in builds.get('included', []) if i['type'] == 'buildBetaDetails'}
by_id = {}
for b in builds.get('data', []):
    a = b['attributes']
    det_id = ((b['relationships'].get('buildBetaDetail') or {}).get('data') or {}).get('id')
    det = details.get(det_id, {})
    _, use = call(f"/v1/builds/{b['id']}/metrics/betaBuildUsages")
    installs = sessions = invites = None
    for d in use.get('data', []):
        for p in d.get('dataPoints', []):
            v = p.get('values', {})
            installs = (installs or 0) + v.get('installCount', 0)
            sessions = (sessions or 0) + v.get('sessionCount', 0)
            invites = (invites or 0) + v.get('inviteCount', 0)
    by_id[b['id']] = a.get('version')
    say(f"build {a.get('version')} · uploaded {str(a.get('uploadedDate'))[:16]} · {a.get('processingState')}"
        f"{' · EXPIRED' if a.get('expired') else ''} · external: {det.get('externalBuildState')} · internal: {det.get('internalBuildState')}"
        f" · installs {installs if installs is not None else '?'} · sessions {sessions if sessions is not None else '?'}")

# the external groups: which builds they have, how many testers
_, groups = call(f'/v1/apps/{app}/betaGroups', limit=50)
external = [g for g in groups.get('data', []) if not g['attributes'].get('isInternalGroup')]
newest = builds['data'][0]['attributes'].get('version') if builds.get('data') else None
for n, g in enumerate(external, 1):
    _, has = call(f"/v1/betaGroups/{g['id']}/builds", limit=50)
    nums = sorted((int(x['attributes']['version']) for x in has.get('data', []) if str(x['attributes'].get('version', '')).isdigit()), reverse=True)
    _, testers = call(f"/v1/betaGroups/{g['id']}/betaTesters", limit=200)
    states = {}
    for t in testers.get('data', []):
        s = t['attributes'].get('state') or '?'
        states[s] = states.get(s, 0) + 1
    say(f"external group {n}: {len(testers.get('data', []))} testers ({', '.join(f'{k} {v}' for k, v in sorted(states.items()))})"
        f" · newest build in it: {nums[0] if nums else 'none'} (newest uploaded: {newest}) · public link: {'on' if g['attributes'].get('publicLinkEnabled') else 'off'}")
