import type { ReactNode } from 'react';

/** A block with its small title above it (Facelift 11.11.2026, docs/DESIGN.md: "span.eyebrow above each block, never a
 *  heading inside a card") – the eyebrow, then the card or the rows. The block is a region named by its title, so a screen
 *  reader still finds it by name. */
export function Block(props: { title: ReactNode; label?: string; children: ReactNode; className?: string }) {
  const label = props.label ?? (typeof props.title === 'string' ? props.title : undefined);
  return (
    <section className={`eb-block${props.className ? ` ${props.className}` : ''}`} aria-label={label}>
      <span className="eyebrow">{props.title}</span>
      {props.children}
    </section>
  );
}
