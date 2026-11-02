import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';

type Decode = (data: Uint8ClampedArray, width: number, height: number, o?: { inversionAttempts?: string }) => { data: string } | null;

/** jsQR, loaded only when scanning (src/vendor – it sets self.jsQR). */
async function decoder(): Promise<Decode> {
  await import('../vendor/jsqr.js');
  return (self as unknown as { jsQR: Decode }).jsQR;
}

/**
 * The camera reads a QR code (Sascha 02.11.2026: "everyone a QR code of his own, as with PayPal – scanned under
 * Friends"): the back camera in a sheet; `onText` gets what the code says, once. Without a camera (denied, none):
 * says so – the code can still be typed.
 */
export function QrScan(props: { title: string; onText: (text: string) => boolean; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const onText = useRef(props.onText);
  onText.current = props.onText;
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let done = false;
    const canvas = document.createElement('canvas');
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('none');
        const [decode, s] = await Promise.all([decoder(), navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })]);
        stream = s;
        if (done) return s.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => null);
        const look = () => {
          if (done) return;
          if (v.videoWidth) {
            // a square from the middle, at most 640 px: quick enough on an older phone
            const side = Math.min(v.videoWidth, v.videoHeight);
            const n = Math.min(640, side);
            canvas.width = canvas.height = n;
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, n, n);
            const found = decode(ctx.getImageData(0, 0, n, n).data, n, n, { inversionAttempts: 'dontInvert' });
            if (found?.data) {
              if (onText.current(found.data)) {
                done = true;
                return;
              }
              setWrong(true);
            }
          }
          timer = window.setTimeout(look, 180);
        };
        look();
      } catch (e) {
        const denied = /denied|NotAllowed|Permission/i.test(String((e as Error)?.name ?? '') + String((e as Error)?.message ?? ''));
        setProblem(
          denied
            ? tr('The camera is not allowed – allow it in the settings, or type the code.', 'Die Kamera ist nicht erlaubt – in den Einstellungen erlauben oder den Code eingeben.')
            : tr('No camera here – type the code instead.', 'Keine Kamera verfügbar – gib den Code ein.'),
        );
      }
    })();
    return () => {
      done = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.title}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {problem ? (
          <p className="notice">{problem}</p>
        ) : (
          <div className="qr-scan">
            <video ref={video} playsInline muted autoPlay />
            <span className="qr-scan-frame" aria-hidden="true" />
          </div>
        )}
        <span className="muted small">
          {wrong
            ? tr('That is not a GolfOS friend code.', 'Das ist kein GolfOS-Freundes-Code.')
            : tr("Hold the camera over your friend's QR code (Friends → My friend code).", 'Halte die Kamera auf den QR-Code deines Freundes (Freunde → Mein Freundes-Code).')}
        </span>
      </section>
    </div>
  );
}
