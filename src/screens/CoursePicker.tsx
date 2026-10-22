import { useEffect, useRef, useState } from 'react';
import type { Course, CourseSummary } from '../types';
import { loadCachedCourse, loadRounds, saveCachedCourse } from '../lib/storage';
import { loadCourse, nearbyCourses, searchBundled, searchCourses, quickSearch } from '../lib/courses';
import { Attribution, TopBar } from '../components/ui';
import { tr } from '../lib/i18n';

type NearbyState =
  | { status: 'locating' }
  | { status: 'loaded'; courses: CourseSummary[] }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export function CoursePicker(props: { onBack: () => void; onPicked: (c: Course) => void }) {
  const [nearby, setNearby] = useState<NearbyState>({ status: 'locating' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourseSummary[] | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // the courses played last – one tap instead of a search (usability, night 16./17.10.2026)
  const [recent] = useState<CourseSummary[]>(() => {
    const seen = new Set<string>();
    const out: CourseSummary[] = [];
    for (const r of loadRounds().sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      if (seen.has(r.courseId) || r.preview) continue;
      seen.add(r.courseId);
      const c = loadCachedCourse(r.courseId);
      if (c) out.push({ id: c.id, source: c.source, name: c.name, lat: c.lat, lon: c.lon });
      if (out.length === 3) break;
    }
    return out;
  });
  const searchTimer = useRef<number>();
  const position = useRef<{ lat: number; lon: number }>();

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setNearby({ status: 'denied' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        position.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        try {
          const courses = await nearbyCourses(pos.coords.latitude, pos.coords.longitude);
          setNearby({ status: 'loaded', courses: courses.slice(0, 12) });
        } catch {
          setNearby({ status: 'error', message: tr('Could not load courses nearby. Check your connection or search by name.', 'Plätze in der Nähe konnten nicht geladen werden. Prüfe die Verbindung oder suche nach dem Namen.') });
        }
      },
      () => setNearby({ status: 'denied' }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    window.clearTimeout(searchTimer.current);
    if (query.trim().length < 3) {
      setResults(null);
      return;
    }
    // Bundled courses show at once (also offline); the course databases add the rest a moment later.
    setResults(searchBundled(query));
    setSearchError(false);
    searchTimer.current = window.setTimeout(async () => {
      setSearching(true);
      // every German course in the app at once – the course databases add theirs a moment later (22.10.2026)
      quickSearch(query)
        .then((r) => setResults((cur) => (cur && cur.length > r.length ? cur : r)))
        .catch(() => undefined);
      try {
        setResults(await searchCourses(query, position.current));
      } catch {
        setSearchError(true); // keep the bundled hits
      } finally {
        setSearching(false);
      }
    }, 450);
  }, [query]);

  const pick = async (c: CourseSummary) => {
    setLoadingId(c.id);
    setLoadError(null);
    try {
      const course = await loadCourse(c);
      // Fewer than 9 numbered holes (e.g. Son Antem: 36 hole lines in OSM, but without numbers) is no usable round.
      if (course.holes.length < 9) {
        // No (usable) hole data in the database yet: play 18 holes anyway. Par and stroke index are entered on the hole
        // (remembered for the course), the hole map is set up on the satellite image.
        const holes = Array.from({ length: 18 }, (_, k) => ({ ref: String(k + 1), loop: 'Main', number: k + 1, par: null, strokeIndex: [] }));
        const playable = { ...course, holes, loops: ['Main'] };
        saveCachedCourse(playable);
        props.onPicked(playable);
      } else {
        props.onPicked(course);
      }
    } catch {
      setLoadError(tr('The course servers are busy right now. Please try again in a minute.', 'Die Platz-Server sind gerade ausgelastet. Bitte versuche es in einer Minute noch einmal.'));
    } finally {
      setLoadingId(null);
    }
  };

  const renderList = (list: CourseSummary[]) => (
    <ul className="list">
      {list.map((c) => (
        <li key={c.id}>
          <button type="button" className="list-item" onClick={() => pick(c)} disabled={loadingId != null}>
            <span className="grow">
              <span className="title">{c.name}</span>
              <span className="muted small">
                {[c.distanceKm != null ? `${c.distanceKm.toFixed(1)} km` : null, c.place].filter(Boolean).join(' · ') ||
                  (c.source === 'osm' ? 'OpenStreetMap' : 'OpenGolfAPI')}
              </span>
            </span>
            {loadingId === c.id ? <span className="spinner" aria-label={tr('Loading', 'Lädt')} /> : <span aria-hidden="true">›</span>}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="screen">
      <TopBar title={tr('Choose course', 'Platz wählen')} onBack={props.onBack} />
      <div className="field">
        <label htmlFor="course-search">{tr('Search by name', 'Nach Namen suchen')}</label>
        <input
          id="course-search"
          className="input"
          type="search"
          placeholder={tr('e.g. Hetzenhof', 'z. B. Hetzenhof')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>
      {loadError && <div className="error">{loadError}</div>}

      {results != null ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>{tr('Results', 'Ergebnisse')}</h2>
          {searching && <span className="spinner" aria-label={tr('Searching', 'Sucht')} />}
          {searchError && (
            <p className="muted small" style={{ margin: 0 }}>
              {tr('The online course search is not reachable right now – showing the courses that come with the app.', 'Die Online-Platzsuche ist gerade nicht erreichbar – angezeigt werden die Plätze, die in der App stecken.')}
            </p>
          )}
          {!searching && !searchError && results.length === 0 && <p className="muted">{tr('No golf course found. Try another spelling.', 'Kein Golfplatz gefunden. Versuche eine andere Schreibweise.')}</p>}
          {renderList(results)}
        </section>
      ) : (
        <>
        {recent.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2>{tr('Played last', 'Zuletzt gespielt')}</h2>
            {renderList(recent)}
          </section>
        )}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>{tr('Nearby', 'In der Nähe')}</h2>
          {nearby.status === 'locating' && (
            <div className="row" style={{ justifyContent: 'flex-start' }}>
              <span className="spinner" aria-hidden="true" />
              <span className="muted">{tr('Finding courses near you …', 'Suche Plätze in deiner Nähe …')}</span>
            </div>
          )}
          {nearby.status === 'denied' && <p className="muted">{tr('Location is off. Search for your course by name.', 'Standort ist aus. Suche deinen Platz nach dem Namen.')}</p>}
          {nearby.status === 'error' && <div className="error">{nearby.message}</div>}
          {nearby.status === 'loaded' && nearby.courses.length === 0 && <p className="muted">{tr('No course within 40 km. Search by name instead.', 'Kein Platz im Umkreis von 40 km. Suche stattdessen nach dem Namen.')}</p>}
          {nearby.status === 'loaded' && renderList(nearby.courses)}
        </section>
        </>
      )}
      <span className="spacer" />
      <Attribution />
    </main>
  );
}

