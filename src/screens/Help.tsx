import { useState } from 'react';
import { Segmented, TopBar } from '../components/ui';
import { tr } from '../lib/i18n';
import { FAQ, HELP_TOUR, HELP_VIDEOS, helpPosterUrl, helpVideoUrl, type HelpVideo } from '../lib/help';

// "Hilfe" from the profile (Sascha 23.10.2026): the tutorial as videos and the frequent questions – in two tabs (no
// one-pager). Every answer shows the chapter that explains it; a video plays from the round symbol at the bottom right of
// its picture, as everywhere in the app.

export type HelpTab = 'videos' | 'faq';

function PlayMark() {
  return (
    <span className="help-play" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5.5v13l10.5-6.5z" />
      </svg>
    </span>
  );
}

function Thumb(props: { v: HelpVideo; onPlay: (v: HelpVideo) => void; small?: boolean }) {
  return (
    <button type="button" className={`help-thumb${props.small ? ' small' : ''}`} onClick={() => props.onPlay(props.v)} aria-label={tr(`Play video: ${props.v.title()}`, `Video abspielen: ${props.v.title()}`)}>
      <img src={helpPosterUrl(props.v.id)} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
      <PlayMark />
    </button>
  );
}

export function Help(props: { onBack: () => void; tab?: HelpTab }) {
  const [tab, setTab] = useState<HelpTab>(props.tab ?? 'videos');
  const [open, setOpen] = useState<string | null>(null);
  const [playing, setPlaying] = useState<HelpVideo | null>(null);
  const byId = (id: string) => (id === HELP_TOUR.id ? HELP_TOUR : HELP_VIDEOS.find((v) => v.id === id) ?? HELP_TOUR);
  return (
    <main className="screen help">
      <TopBar title={tr('Help', 'Hilfe')} onBack={props.onBack} backLabel={tr('Back to the profile', 'Zurück zum Profil')} />
      <Segmented<HelpTab>
        label={tr('Help', 'Hilfe')}
        value={tab}
        onChange={(v) => v && setTab(v)}
        options={[
          { value: 'videos', label: tr('Videos', 'Videos') },
          { value: 'faq', label: tr('Questions', 'Häufige Fragen') },
        ]}
      />
      {tab === 'videos' && (
        <div className="help-videos">
          {[HELP_TOUR, ...HELP_VIDEOS].map((v, k) => (
            <div key={v.id} className={`card help-video${k === 0 ? ' tour' : ''}`}>
              <Thumb v={v} onPlay={setPlaying} />
              <div className="help-video-text">
                <span className="help-video-no muted small">{k === 0 ? tr('All in one', 'Alles am Stück') : tr(`Chapter ${k}`, `Kapitel ${k}`)} · {v.length}</span>
                <strong>{v.title()}</strong>
                <span className="muted small">{v.about()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'faq' && (
        <div className="help-faq">
          {FAQ.map((t) => (
            <section key={t.id} className="card stats-card">
              <h2>{t.title()}</h2>
              <div className="faq-list">
                {t.items.map((f) => {
                  const key = `${t.id}:${f.q()}`;
                  const isOpen = open === key;
                  return (
                    <div key={key} className={`faq-item${isOpen ? ' open' : ''}`}>
                      <button type="button" className="faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
                        <span>{f.q()}</span>
                        <span className="faq-chev" aria-hidden="true">›</span>
                      </button>
                      {isOpen && (
                        <div className="faq-a">
                          <p>{f.a()}</p>
                          <div className="faq-video">
                            <Thumb v={byId(f.video)} onPlay={setPlaying} small />
                            <span className="muted small">
                              {tr('In the video', 'Im Video')}: <strong>{byId(f.video).title()}</strong>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {playing && (
        <div className="help-player" role="dialog" aria-label={playing.title()}>
          <div className="help-player-head">
            <strong>{playing.title()}</strong>
            <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setPlaying(null)}>
              ✕
            </button>
          </div>
          <video src={helpVideoUrl(playing.id)} poster={helpPosterUrl(playing.id)} controls autoPlay playsInline />
        </div>
      )}
    </main>
  );
}
