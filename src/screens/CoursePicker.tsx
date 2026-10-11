import { useEffect, useRef, useState } from 'react';
import type { Course, CourseSummary } from '../types';
import { saveCachedCourse } from '../lib/storage';
import { loadCourse, nearbyCourses, searchCourses } from '../lib/courses';
import { Attribution, TopBar } from '../components/ui';

type NearbyState =
  | { status: 'locating' }
  | { status: 'loaded'; courses: CourseSummary[] }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export function CoursePicker(props: { onBack: () => void; onPicked: (c: Course) => void }) {
  const [nearby, setNearby] = useState<NearbyState>({ status: 'locating' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourseSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
          setNearby({ status: 'error', message: 'Could not load courses nearby. Check your connection or search by name.' });
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
    searchTimer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchCourses(query, position.current));
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
      setLoadError('The course servers are busy right now. Please try again in a minute.');
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
            {loadingId === c.id ? <span className="spinner" aria-label="Loading" /> : <span aria-hidden="true">›</span>}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="screen">
      <TopBar title="Choose course" onBack={props.onBack} />
      <div className="field">
        <label htmlFor="course-search">Search by name</label>
        <input
          id="course-search"
          className="input"
          type="search"
          placeholder="e.g. Hetzenhof"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>
      {loadError && <div className="error">{loadError}</div>}

      {results != null ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>Results</h2>
          {searching && <span className="spinner" aria-label="Searching" />}
          {!searching && results.length === 0 && <p className="muted">No golf course found. Try another spelling.</p>}
          {renderList(results)}
        </section>
      ) : (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>Nearby</h2>
          {nearby.status === 'locating' && (
            <div className="row" style={{ justifyContent: 'flex-start' }}>
              <span className="spinner" aria-hidden="true" />
              <span className="muted">Finding courses near you …</span>
            </div>
          )}
          {nearby.status === 'denied' && <p className="muted">Location is off. Search for your course by name.</p>}
          {nearby.status === 'error' && <div className="error">{nearby.message}</div>}
          {nearby.status === 'loaded' && nearby.courses.length === 0 && <p className="muted">No course within 40 km. Search by name instead.</p>}
          {nearby.status === 'loaded' && renderList(nearby.courses)}
        </section>
      )}
      <span className="spacer" />
      <Attribution />
    </main>
  );
}
