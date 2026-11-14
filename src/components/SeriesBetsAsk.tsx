import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { answerSeries, seriesAsks, type NewRound, type PoolAsk } from '../lib/seriesbets';
import { PickSheet, SettingsList, TickRow } from './Settings';

/** A round added to a tournament series while bets run over it (Sascha 14.11.2026): the host of the pool asked which of
 *  the running bets count it – each kind of bet a tick, ticked when it counts the round as things are. "Übernehmen"
 *  changes the pool on the server; ✕ leaves everything as it is. */
export function SeriesBetsAsk() {
  const [ask, setAsk] = useState<{ round: NewRound; pools: PoolAsk[] } | null>(null);
  const [yes, setYes] = useState<Record<string, Set<string>>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ round: NewRound; others: { day: string }[] }>).detail;
      if (!d?.round) return;
      const pools = seriesAsks(d.round, d.others ?? []);
      if (!pools.length) return;
      setYes(Object.fromEntries(pools.map((p) => [p.code, new Set(p.groups.filter((g) => g.counts).map((g) => g.key))])));
      setMsg(null);
      setAsk({ round: d.round, pools });
    };
    window.addEventListener('golfos:series-round-added', on);
    return () => window.removeEventListener('golfos:series-round-added', on);
  }, []);
  if (!ask) return null;
  const { round } = ask;
  const day = `${round.day.slice(8, 10)}.${round.day.slice(5, 7)}.`;
  const save = async () => {
    setBusy(true);
    const ok = (await Promise.all(ask.pools.map((p) => answerSeries(p.code, round, p.groups, yes[p.code] ?? new Set())))).every(Boolean);
    setBusy(false);
    if (ok) setAsk(null);
    else setMsg(tr('Not saved – no connection. Try again.', 'Nicht gespeichert – keine Verbindung. Nochmal versuchen.'));
  };
  return (
    <PickSheet<string> title={tr('New round in the series', 'Neue Runde in der Serie')} options={[]} current="" onPick={() => undefined} onClose={() => setAsk(null)} onSave={busy ? undefined : () => void save()} saveLabel={tr('Apply', 'Übernehmen')}>
      <p className="muted small series-bets-q">
        {tr(`${round.course} · ${day} – which running bets count it?`, `${round.course} · ${day} – für welche laufenden Wetten zählt sie?`)}
      </p>
      {ask.pools.map((p) => (
        <div key={p.code} className="series-bets-pool">
          <span className="eyebrow">{p.name}</span>
          <SettingsList label={p.name}>
            {p.groups.map((g) => (
              <TickRow
                key={g.key}
                label={g.label}
                text={g.who.join(', ')}
                on={yes[p.code]?.has(g.key) ?? false}
                onChange={(on) =>
                  setYes((y) => {
                    const s = new Set(y[p.code] ?? []);
                    if (on) s.add(g.key);
                    else s.delete(g.key);
                    return { ...y, [p.code]: s };
                  })
                }
              />
            ))}
          </SettingsList>
        </div>
      ))}
      {msg && (
        <span className="small good-text" role="alert">
          {msg}
        </span>
      )}
    </PickSheet>
  );
}
