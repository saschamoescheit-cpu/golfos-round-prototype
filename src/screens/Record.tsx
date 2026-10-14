import { useMemo } from 'react';
import type { Round } from '../types';
import { career, playedCourses } from '../lib/history';
import { handicapIndex, playedHandicap } from '../lib/handicap';
import { fullName, loadProfile } from '../lib/profile';
import { BestsCard, TrendCard } from '../components/HistoryCards';
import { PlayedHcpStats } from '../components/PlayedHcp';
import { dec, tr } from '../lib/i18n';

// Tab "My golf" (Sascha 14.10.2026, instead of BeBrassie's "Dashboard"): who you are as a golfer in a few numbers –
// handicap, average, what you played, how your holes end, your bests and where you are heading.

export const RESULT_COLOURS = { eaglePlus: '#5ec2ff', birdie: '#9bc53d', par: '#e8edf0', bogey: '#f6d48a', doublePlus: '#ff6b5e' } as const;

export function RecordTab(props: { rounds: Round[]; onOpenRound: (r: Round) => void; onProfile: () => void }) {
  const finished = useMemo(() => props.rounds.filter((r) => r.finishedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [props.rounds]);
  const c = useMemo(() => career(finished), [finished]);
  const profile = loadProfile();
  const name = fullName(profile);
  const estimate = useMemo(() => {
    const d = finished.flatMap((r) => {
      const p = playedHandicap(r);
      return p ? [p.differential] : [];
    });
    return handicapIndex(d);
  }, [finished]);
  const courses = playedCourses(finished).length;
  const hcp = profile.hcpIndex.trim() ? dec(profile.hcpIndex.trim()) : estimate ? dec(estimate.index.toFixed(1)) : '–';
  const hcpLabel = profile.hcpIndex.trim() ? tr('Handicap index', 'Handicap-Index') : estimate ? tr('Handicap (estimate)', 'Handicap (geschätzt)') : tr('Handicap index', 'Handicap-Index');
  const results: { k: keyof typeof RESULT_COLOURS; label: string }[] = [
    { k: 'eaglePlus', label: tr('Eagle+', 'Eagle+') },
    { k: 'birdie', label: 'Birdies' },
    { k: 'par', label: 'Pars' },
    { k: 'bogey', label: 'Bogeys' },
    { k: 'doublePlus', label: tr('Double+', 'Doppel+') },
  ];

  return (
    <>
      <h1 className="tab-title">{tr('My golf', 'Mein Golf')}</h1>
      <section className="card record-hero">
        <button type="button" className="record-who" onClick={props.onProfile}>
          <span className="avatar" aria-hidden="true">
            {(profile.firstName.trim()[0] ?? '') + (profile.lastName.trim()[0] ?? '') || '⛳'}
          </span>
          <span className="grow">
            <strong>{name || tr('Your profile', 'Dein Profil')}</strong>
            <span className="muted small">{profile.homeClub.trim() || tr('Add name, handicap and home club ›', 'Name, Handicap und Heimatclub eintragen ›')}</span>
          </span>
        </button>
        <div className="hero-nums">
          <div>
            <span className="hero-num">{hcp}</span>
            <span className="muted small">{hcpLabel}</span>
          </div>
          <div>
            <span className="hero-num">{c.toParPer18 == null ? '–' : dec(`${c.toParPer18 > 0 ? '+' : ''}${c.toParPer18.toFixed(1)}`)}</span>
            <span className="muted small">{tr('Ø to par (18 holes)', 'Ø zu Par (18 Loch)')}</span>
          </div>
          <div>
            <span className="hero-num">{c.rounds}</span>
            <span className="muted small">{tr('Rounds', 'Runden')}</span>
          </div>
        </div>
      </section>

      {c.holes === 0 ? (
        <p className="muted">{tr('Finish a round – your golf overview starts here.', 'Beende eine Runde – hier beginnt dein Golf-Überblick.')}</p>
      ) : (
        <>
          <section className="card stats-card">
            <h2>{tr('How your holes end', 'So enden deine Löcher')}</h2>
            <div className="mix-bar" role="img" aria-label={results.map((x) => `${x.label} ${c.mix[x.k]}`).join(', ')}>
              {results.map((x) =>
                c.mix[x.k] > 0 ? <span key={x.k} style={{ flexGrow: c.mix[x.k], background: RESULT_COLOURS[x.k] }} /> : null,
              )}
            </div>
            <div className="result-grid">
              {results.map((x) => (
                <div key={x.k}>
                  <span className="result-num">{c.mix[x.k]}</span>
                  <span className="muted small">
                    <i style={{ background: RESULT_COLOURS[x.k] }} />
                    {x.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="tile-row">
            <div className="tile">
              <span className="tile-num">{c.holes}</span>
              <span className="muted small">{tr('holes', 'Löcher')}</span>
            </div>
            <div className="tile">
              <span className="tile-num">{c.strokes}</span>
              <span className="muted small">{tr('strokes', 'Schläge')}</span>
            </div>
            <div className="tile">
              <span className="tile-num">{courses}</span>
              <span className="muted small">{courses === 1 ? tr('course', 'Platz') : tr('courses', 'Plätze')}</span>
            </div>
          </div>

          <BestsCard rounds={finished} onOpen={props.onOpenRound} />
          <TrendCard rounds={finished.slice(0, 20)} />
          <PlayedHcpStats rounds={finished} />
        </>
      )}
    </>
  );
}
