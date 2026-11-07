import type { ReactNode } from 'react';

/** One of the most important hints of the app – the whole card green, heading and text, as "Tipp für die nächste
 *  Runde" (Sascha 07.11.2026: "the most important hints like this – the other hints as they are"). The ordinary
 *  hints stay grey small lines; this only for what one must know to go on (e.g. "Am Turniertag"). */
export function KeyHint(props: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card stats-card next-round-card key-hint${props.className ? ` ${props.className}` : ''}`}>
      <h2>{props.title}</h2>
      <p className="next-round">{props.children}</p>
    </section>
  );
}
