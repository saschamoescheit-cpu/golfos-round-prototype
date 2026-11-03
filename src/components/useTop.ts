import { useEffect } from 'react';

/** A screen opened starts at its top (Sascha 03.11.2026: "a pool set up – its QR code shown at the bottom, I have to
 *  scroll up; every page must start at the top"): the page scrolled before (the setup) does not carry over. `key`: a
 *  screen showing another one in place (another pool, another tournament). */
export function useTop(key?: unknown): void {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [key]);
}
