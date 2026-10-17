import { useMemo } from 'react';
import type { Round } from '../types';
import { career, playedCourses } from '../lib/history';
import { handicapIndex, playedHandicap } from '../lib/handicap';
import { shownName, loadProfile } from '../lib/profile';
import { BestsCard, TrendCard } from '../components/HistoryCards';
import { PlayedHcpStats } from '../components/PlayedHcp';
import { dec, tr } from '../lib/i18n';
import { statRounds, unsignedRounds } from '../lib/signing';
import { Avatar } from '../components/Avatar';

// Tab "My golf" (Sascha 14.10.2026, instead of BeBrassie's "Dashboard"): who you are as a golfer in a few numbers –
// handicap, average, what you played, how your holes end, your bests and where you are heading.

// in the app's colours (Sascha 17.10.2026): greens for under par, greys for par and over – lighter is better
export const RESULT_COLOURS = { eaglePlus: '#5f9a1e', birdie: '#9bc53d', par: '#dfe6ea', bogey: '#93a3ae', doublePlus: '#55636d' } as const;

export function RecordTab(props: { rounds: Round[]; onOpenRound: (r: Round) => void; onProfile: () => void }) {
  const finished = useMemo(() => statRounds(props.rounds).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [props.rounds]);
  const c = useMemo(() => career(finished), [finished]);
  const nine = finished.length > 0 && finished.filter((r) => r.holes.length <= 9).length * 2 > finished.length;
  const toPar = c.toParPer18 == null ? null : nine ? Math.round(c.toParPer18 * 5) / 10 : c.toParPer18;
  const profile = loadProfile();
  const name = shownName(profile);
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
          {/* the same picture as everywhere: the profile photo (Google or chosen), else the initial */}
          <Avatar name={name || '⛳'} me size={52} />
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
            <span className="hero-num">{toPar == null ? '–' : dec(`${toPar > 0 ? '+' : ''}${toPar.toFixed(1)}`)}</span>
            <span className="muted small">{nine ? tr('Ø to par (9 holes)', 'Ø zu Par (9 Loch)') : tr('Ø to par (18 holes)', 'Ø zu Par (18 Loch)')}</span>
          </div>
          <div>
            <span className="hero-num">{c.rounds}</span>
            <span className="muted small">{tr('Rounds', 'Runden')}</span>
          </div>
        </div>
      </section>

      {c.holes === 0 ? (
        <p className="muted">
          {unsignedRounds(props.rounds).length
            ? tr('Sign your finished rounds (scorecard → Sign) – your golf overview starts with the first signed one.', 'Signiere deine beendeten Runden (Scorekarte → Signieren) – dein Golf-Überblick beginnt mit der ersten signierten.')
            : tr('Finish a round – your golf overview starts here.', 'Beende eine Runde – hier beginnt dein Golf-Überblick.')}
        </p>
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
