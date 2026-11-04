# A build for the external testers too (Sascha 04.11.2026: "Chris still has the app of 02.11. and gets no updates"):
# TestFlight gives a new build to the internal group by itself, an external group only when the build is added to it
# and sent to Apple's beta review. This waits until the build is processed, adds it to every external group and
# submits it for review – after the first approval Apple usually lets later builds of the version through at once.
# Only counts in the output (a public repo): no names, no e-mail addresses.
# Usage: python3 ios/ci/asc_distribute.py [build number – default the newest] [--wait seconds]
import json, os, sys, time, urllib.error, urllib.parse, urllib.request
import jwt

BUNDLE = 'de.moescheit.golfos'
args = [a for a in sys.argv[1:] if not a.startswith('--')]
want = args[0] if args else None
wait = int(sys.argv[sys.argv.index('--wait') + 1]) if '--wait' in sys.argv else 0
token_at = 0
token = ''


def auth():
    global token, token_at
    now = int(time.time())
    if now - token_at > 600:
        token = jwt.encode({'iss': os.environ['ASC_ISSUER_ID'], 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'},
                           os.environ['ASC_KEY_P8'], algorithm='ES256', headers={'kid': os.environ['ASC_KEY_ID'], 'typ': 'JWT'})
        token_at = now
    return token


def note(kind, text):
    print(f'::{kind}::{text}')


def call(method, path, body=None, **q):
    url = 'https://api.appstoreconnect.apple.com' + path + ('?' + urllib.parse.urlencode(q) if q else '')
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + auth(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, {'error': e.read()[:400].decode(errors='replace')}


st, apps = call('GET', '/v1/apps', **{'filter[bundleId]': BUNDLE})
if not apps.get('data'):
    note('error', f'no app {BUNDLE} ({st})')
    sys.exit(1)
app = apps['data'][0]['id']


def find_build():
    q = {'filter[app]': app, 'sort': '-uploadedDate', 'limit': 10, 'include': 'buildBetaDetail'}
    if want:
        q['filter[version]'] = want
    _, b = call('GET', '/v1/builds', **q)
    if not b.get('data'):
        return None, None
    d = b['data'][0]
    det_id = ((d['relationships'].get('buildBetaDetail') or {}).get('data') or {}).get('id')
    det = next((i['attributes'] for i in b.get('included', []) if i['type'] == 'buildBetaDetails' and i['id'] == det_id), {})
    return d, det


# processed? (a fresh upload takes about 10–30 min)
deadline = time.time() + wait
while True:
    build, det = find_build()
    state = build['attributes'].get('processingState') if build else None
    if state == 'VALID' or time.time() >= deadline:
        break
    time.sleep(30)
if not build or state != 'VALID':
    note('warning', f'build {want or "newest"} not processed yet ({state}) – not given to the external testers; run again later')
    sys.exit(0)
num = build['attributes'].get('version')

_, groups = call('GET', f'/v1/apps/{app}/betaGroups', limit=50)
external = [g for g in groups.get('data', []) if not g['attributes'].get('isInternalGroup')]
added = 0
for g in external:
    _, has = call('GET', f"/v1/betaGroups/{g['id']}/builds", limit=50)
    if any(x['id'] == build['id'] for x in has.get('data', [])):
        continue
    st, res = call('POST', f"/v1/betaGroups/{g['id']}/relationships/builds", {'data': [{'type': 'builds', 'id': build['id']}]})
    if st in (200, 201, 204):
        added += 1
    else:
        note('warning', f"build {num} to an external group: {st} {res.get('error', '')[:200]}")

# the beta review – only when not yet submitted
ext = det.get('externalBuildState')
if ext == 'READY_FOR_BETA_SUBMISSION':
    st, res = call('POST', '/v1/betaAppReviewSubmissions', {'data': {'type': 'betaAppReviewSubmissions', 'relationships': {'build': {'data': {'type': 'builds', 'id': build['id']}}}}})
    review = 'submitted' if st in (200, 201) else f"not submitted: {st} {res.get('error', '')[:200]}"
else:
    review = f'state {ext}'
note('notice', f'build {num}: given to {added} of {len(external)} external group(s) (the others had it already) · beta review {review}')
