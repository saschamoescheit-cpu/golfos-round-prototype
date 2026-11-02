# TestFlight status from App Store Connect (02.11.2026: "did inviting the testers work?") – builds and their beta
# review, the tester groups with their builds and how many testers are invited / accepted / installed. Only counts:
# the annotations of this public repo carry no names or e-mail addresses.
import collections, json, os, time, urllib.error, urllib.parse, urllib.request
import jwt

BUNDLE = 'de.moescheit.golfos'
now = int(time.time())
token = jwt.encode({'iss': os.environ['ASC_ISSUER_ID'], 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'},
                   os.environ['ASC_KEY_P8'], algorithm='ES256', headers={'kid': os.environ['ASC_KEY_ID'], 'typ': 'JWT'})


def note(kind, lines):
    print(f'::{kind}::' + '%0A'.join(lines))


def get(path, **q):
    url = 'https://api.appstoreconnect.apple.com' + path + ('?' + urllib.parse.urlencode(q) if q else '')
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token})))
    except urllib.error.HTTPError as e:
        note('warning', [f'{path}: {e.code} {e.read()[:300].decode(errors="replace")}'])
        return {'data': [], 'included': []}


apps = get('/v1/apps', **{'filter[bundleId]': BUNDLE})['data']
if not apps:
    note('error', [f'no app {BUNDLE}'])
    raise SystemExit(1)
app = apps[0]['id']

b = get('/v1/builds', **{'filter[app]': app, 'sort': '-uploadedDate', 'limit': 6,
                          'include': 'buildBetaDetail,betaAppReviewSubmission,preReleaseVersion'})
inc = {(i['type'], i['id']): i['attributes'] for i in b.get('included', [])}
rel = lambda d, r: ((d['relationships'].get(r) or {}).get('data') or {})
lines = ['Builds (newest first):']
for d in b['data']:
    a = d['attributes']
    det = inc.get(('buildBetaDetails', rel(d, 'buildBetaDetail').get('id')), {})
    rev = inc.get(('betaAppReviewSubmissions', rel(d, 'betaAppReviewSubmission').get('id')), {})
    ver = inc.get(('preReleaseVersions', rel(d, 'preReleaseVersion').get('id')), {}).get('version', '?')
    lines.append(f"{ver} ({a.get('version')}) uploaded {(a.get('uploadedDate') or '')[:16]} processing={a.get('processingState')}"
                 f" expired={a.get('expired')} internal={det.get('internalBuildState')} external={det.get('externalBuildState')}"
                 f" review={rev.get('betaReviewState', '-')} submitted={(rev.get('submittedDate') or '-')[:16]}")
note('notice', lines)

for g in get(f'/v1/apps/{app}/betaGroups', limit=50)['data']:
    a = g['attributes']
    testers = get(f"/v1/betaGroups/{g['id']}/betaTesters", limit=200)['data']
    states = collections.Counter((t['attributes'].get('state') or '?') for t in testers)
    invites = collections.Counter((t['attributes'].get('inviteType') or '?') for t in testers)
    builds = [x['attributes'].get('version') for x in get(f"/v1/betaGroups/{g['id']}/builds", limit=20)['data']]
    note('notice', [f"Group '{a.get('name')}' internal={a.get('isInternalGroup')} publicLink={a.get('publicLinkEnabled')}",
                    f"testers={len(testers)} states={dict(states)} invites={dict(invites)}",
                    f"builds={builds}"])
