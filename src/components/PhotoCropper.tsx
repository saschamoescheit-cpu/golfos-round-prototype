import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';

// The profile photo placed by hand (Sascha 17.10.2026: "position it, zoom in and out"): the picture in a round frame,
// moved with one finger, zoomed with two fingers or the mouse wheel (no slider, 20.10.2026); saved as a small square JPEG.
const FRAME = 260; // px on screen
const OUT = 160; // px of the saved photo

export function PhotoCropper(props: { src: string; onCancel: () => void; onSave: (dataUrl: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1); // 1 = the short side fills the frame
  const [at, setAt] = useState({ x: 0, y: 0 }); // offset of the picture's middle from the frame's middle, px
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; zoom: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = props.src;
  }, [props.src]);

  const base = img ? FRAME / Math.min(img.width, img.height) : 1; // scale at zoom 1
  const w = img ? img.width * base * zoom : FRAME;
  const h = img ? img.height * base * zoom : FRAME;
  // never a gap in the frame
  const clamp = (p: { x: number; y: number }, z = zoom) => {
    const ww = img ? img.width * base * z : FRAME;
    const hh = img ? img.height * base * z : FRAME;
    const mx = Math.max(0, (ww - FRAME) / 2);
    const my = Math.max(0, (hh - FRAME) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };
  const setZoomTo = (z: number) => {
    const nz = Math.min(4, Math.max(1, z));
    setZoom(nz);
    setAt((a) => clamp(a, nz));
  };

  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const move = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      setZoomTo((pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d);
    } else if (pointers.current.size === 1) {
      setAt((p) => clamp({ x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }));
    }
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const save = () => {
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = OUT;
    c.height = OUT;
    const s = OUT / FRAME;
    c.getContext('2d')!.drawImage(img, (FRAME / 2 + at.x - w / 2) * s, (FRAME / 2 + at.y - h / 2) * s, w * s, h * s);
    props.onSave(c.toDataURL('image/jpeg', 0.85));
  };

  return (
    <div className="sheet-backdrop" onClick={props.onCancel}>
      <section className="sheet photo-cropper" role="dialog" aria-label={tr('Place your photo', 'Profilbild anpassen')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Place your photo', 'Profilbild anpassen')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onCancel}>
            ✕
          </button>
        </div>
        <div
          className="crop-frame"
          style={{ width: FRAME, height: FRAME }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onWheel={(e) => setZoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
        >
          {img && (
            <img
              src={props.src}
              alt=""
              draggable={false}
              style={{ width: w, height: h, left: FRAME / 2 + at.x - w / 2, top: FRAME / 2 + at.y - h / 2 }}
            />
          )}
          <span className="crop-ring" aria-hidden="true" />
        </div>
        {/* zoom with two fingers (or the wheel) – no slider (Sascha 20.10.2026) */}
        <button type="button" className="btn-primary" disabled={!img} onClick={save}>
          {tr('Use photo', 'Bild übernehmen')}
        </button>
      </section>
    </div>
  );
}
