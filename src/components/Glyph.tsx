// Small symbols inside text and buttons – SVG, never a text sign or emoji (DESIGN: icons are SVG; night 10./11.11.2026:
// ✎, ★ and ⇄ were text signs). They take the size and colour of the text around them.

const glyph = (path: React.ReactNode, filled = false) => (
  <svg className="glyph" width="1em" height="1em" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

/** edit – the pen */
export const PenGlyph = () => glyph(<path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10zM14 7l3 3" />);
/** a favourite – the star */
export const StarGlyph = () => glyph(<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />, true);
/** another module – the two arrows */
export const SwapGlyph = () => glyph(<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" />);
/** fits – the tick */
export const CheckGlyph = () => glyph(<path d="M5 12.5l4.5 4.5L19 7.5" />);
/** cut – the cross */
export const CrossGlyph = () => glyph(<path d="M6 6l12 12M18 6L6 18" />);
