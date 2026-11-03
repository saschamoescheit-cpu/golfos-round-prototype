import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { cameraOn, soundForCamera } from '../lib/caddietalk';
import { reportError } from '../lib/errorlog';
import { codeFromText, setPendingAsk } from '../lib/friendlinks';
import { joinCodeFrom } from '../lib/sharedgame';

type Decode = (data: Uint8ClampedArray, width: number, height: number, o?: { inversionAttempts?: string }) => { data: string } | null;

/** jsQR, loaded only when scanning (src/vendor). The dev server runs it as a script (it sets self.jsQR), the built app
 *  as a module (its default export) – 03.11.2026: on the phone it found neither and said "no camera". */
async function decoder(): Promise<Decode> {
  const m = (await import('../vendor/jsqr.js')) as { default?: Decode };
  const d = typeof m.default === 'function' ? m.default : (self as unknown as { jsQR?: Decode }).jsQR;
  if (typeof d !== 'function') throw new Error('decoder');
  return d;
}

const isDenied = (e: unknown): boolean => /denied|NotAllowed|Permission/i.test(String((e as Error)?.name ?? '') + String((e as Error)?.message ?? ''));

/** The back camera – the sound set free first (iOS gives no picture while the page plays "playback"); a phone that
 *  does not take the wish for the back camera gets any camera. */
async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('none');
  soundForCamera();
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    if (isDenied(e)) throw e;
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

/** A photo of the code: read at two sizes (a phone photo is large; jsQR finds a small code better scaled down). */
async function readPhoto(file: File, decode: Decode): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    for (const max of [1000, 600, 1600]) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, w, h);
      const found = decode(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
      if (found?.data) return found.data;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The camera reads a QR code (Sascha 02.11.2026: "everyone a QR code of his own, as with PayPal – scanned under
 * Friends"): the back camera in a sheet; `onText` gets what the code says, once. Without a camera (denied, none) or
 * when it gives no picture (03.11.2026, the iPhone app: "the camera does not start at all"): says so – a photo of the
 * code (the phone's own camera) or typing the code still work.
 */
export function QrScan(props: {
  title: string;
  /** true: taken – false: not a code this sheet wants (`wrong` says so) */
  onText: (text: string) => boolean;
  onClose: () => void;
  /** the line under the camera; default: the friend code */
  hint?: string;
  /** said when a QR code is not the one wanted */
  wrong?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const onText = useRef(props.onText);
  onText.current = props.onText;
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let done = false;
    const canvas = document.createElement('canvas');
    const stop = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };
    const attach = async (v: HTMLVideoElement, s: MediaStream) => {
      stream = s;
      cameraOn(s);
      v.srcObject = s;
      await v.play().catch(() => null);
    };
    void (async () => {
      try {
        const s = await openCamera();
        if (done) return s.getTracks().forEach((t) => t.stop());
        const decode = await decoder();
        const v = video.current;
        if (!v) return s.getTracks().forEach((t) => t.stop());
        await attach(v, s);
        const started = performance.now();
        let reopened = false;
        const look = async () => {
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
                stop();
                return;
              }
              setWrong(true);
            }
          } else {
            // no picture yet: play again; after 4 s a fresh camera, once; after 9 s it says so
            const waited = performance.now() - started;
            if (v.paused) void v.play().catch(() => null);
            if (waited > 4000 && !reopened) {
              reopened = true;
              stop();
              const again = await openCamera().catch(() => null);
              if (done) return again?.getTracks().forEach((t) => t.stop());
              if (again) await attach(v, again);
            } else if (waited > 9000) {
              reportError('promise', new Error(`qr camera: no picture (${stream?.getVideoTracks()[0]?.readyState ?? 'no track'})`));
              stop();
              setProblem(tr('The camera gives no picture – take a photo of the code instead, or type it.', 'Die Kamera zeigt kein Bild – nimm stattdessen ein Foto vom Code auf oder gib ihn ein.'));
              return;
            }
          }
          timer = window.setTimeout(() => void look(), 180);
        };
        void look();
      } catch (e) {
        stop();
        if (!isDenied(e)) reportError('promise', new Error(`qr camera: ${String((e as Error)?.name ?? '')} ${String((e as Error)?.message ?? '')}`.trim()));
        setProblem(
          isDenied(e)
            ? tr('The camera is not allowed – allow it in the settings, take a photo of the code, or type it.', 'Die Kamera ist nicht erlaubt – in den Einstellungen erlauben, ein Foto vom Code aufnehmen oder ihn eingeben.')
            : (e as Error)?.message === 'decoder'
              ? tr('The scanner could not start – type the code instead.', 'Der Scanner startet nicht – gib den Code ein.')
              : tr('The camera does not start here – take a photo of the code instead, or type it.', 'Die Kamera startet hier nicht – nimm stattdessen ein Foto vom Code auf oder gib ihn ein.'),
        );
      }
    })();
    return () => {
      done = true;
      window.clearTimeout(timer);
      stop();
    };
  }, []);

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoNote(tr('Reading the photo …', 'Foto wird gelesen …'));
    try {
      const text = await readPhoto(file, await decoder());
      if (!text) setPhotoNote(tr('No QR code found in the photo – hold the phone closer and try again.', 'Kein QR-Code auf dem Foto erkannt – näher ran und nochmal.'));
      else if (!onText.current(text)) setPhotoNote((props.wrong ?? tr('That is not a GolfOS friend code.', 'Das ist kein GolfOS-Freundes-Code.')));
      else setPhotoNote(null);
    } catch (e) {
      reportError('promise', new Error(`qr photo: ${String((e as Error)?.message ?? e)}`));
      setPhotoNote(tr('The photo could not be read – type the code instead.', 'Das Foto ließ sich nicht lesen – gib den Code ein.'));
    }
  };

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
            ? (props.wrong ?? tr('That is not a GolfOS friend code.', 'Das ist kein GolfOS-Freundes-Code.'))
            : (props.hint ?? tr("Hold the camera over your friend's QR code (Friends → My friend code).", 'Halte die Kamera auf den QR-Code deines Freundes (Freunde → Mein Freundes-Code).'))}
        </span>
        {/* the phone's own camera: always works, also where the live picture does not (the iPhone app) */}
        <input ref={photo} type="file" accept="image/*" capture="environment" hidden aria-label={tr('Photo of the QR code', 'Foto vom QR-Code')} onChange={(e) => void fromPhoto(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        <button type="button" className={problem ? 'btn-primary' : 'btn-secondary'} onClick={() => photo.current?.click()}>
          {tr('Take a photo of the code', 'Foto vom Code aufnehmen')}
        </button>
        {photoNote && <span className="small good-text">{photoNote}</span>}
      </section>
    </div>
  );
}

/**
 * "QR-Code scannen" under the code field of "Runde beitreten" / "Spiel beitreten" (Sascha 03.11.2026: "only typing a
 * code – scanning the QR code is needed here too"): the code of the round, game, pool or tournament from its QR code;
 * a friend's QR code opens his friend request.
 */
export function ScanCodeButton(props: { onCode: (code: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-secondary scan-code-btn" disabled={props.disabled} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
          <path d="M4 12h16" />
        </svg>
        {tr('Scan QR code', 'QR-Code scannen')}
      </button>
      {open && (
        <QrScan
          title={tr('Scan QR code', 'QR-Code scannen')}
          hint={tr('Hold the camera over the QR code of the round or the game (on the host\'s phone).', 'Halte die Kamera auf den QR-Code der Runde oder des Spiels (auf dem Handy des Gastgebers).')}
          wrong={tr('That is not a GolfOS code.', 'Das ist kein GolfOS-Code.')}
          onText={(text) => {
            if (/#friend=|:\/\/friend\//.test(text)) {
              const f = codeFromText(text);
              if (!f) return false;
              setOpen(false);
              setPendingAsk(f);
              return true;
            }
            const c = joinCodeFrom(text);
            if (!c) return false;
            setOpen(false);
            props.onCode(c);
            return true;
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
