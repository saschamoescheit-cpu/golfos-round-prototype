import { cameraOn } from '../lib/caddietalk';

// The camera picture stays live (Sascha 1.11.2026: "I still cannot see myself live – it looks like a photo"): the
// iPhone may pause the video or stop delivering pictures (the sound switched, a call, the page hidden a moment). Every
// picture checks it: a paused video plays again, a picture that stands still for 2.5 s gets a fresh camera.
//
// Upright like the phone's own camera (Sascha 1.11.2026: "only a landscape cut of the camera – I never get fully into
// the picture; the whole screen has to be the camera, as when I film a video"): the iPhone reads the size wished for in
// the sensor's landscape terms and turns the picture itself – asked for 1280 × 720 it gives 720 × 1280 when held
// upright; some iPhones give the landscape cut anyway, so while the phone stands upright and the picture lies, other
// sizes are asked for one after the other. An upright picture fills the screen (data-shape="tall" on the stage).

type Facing = 'user' | 'environment';

/** What every camera of Agility asks for. */
export const cameraWish = (facing: Facing = 'user'): MediaStreamConstraints => ({
  video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
});
const UPRIGHT: MediaTrackConstraints[] = [
  { width: { ideal: 720 }, height: { ideal: 1280 } },
  { aspectRatio: { ideal: 9 / 16 } },
  { width: { ideal: 1280 }, height: { ideal: 720 } },
  { aspectRatio: { ideal: 16 / 9 } },
];
/** "tall": upright and about as narrow as the screen – it fills it; "upright": wider (3:4); "wide": lying */
export const shapeOf = (w: number, h: number): 'tall' | 'upright' | 'wide' => (h > w ? (w / h <= 0.66 ? 'tall' : 'upright') : 'wide');
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };

const STILL_MS = 2500;

export class LiveCam {
  private lastFrame: number;
  private lastTime = -1;
  private lastPlay = 0;
  private lastReopen = -Infinity;
  private reopening = false;
  private own: MediaStream | null = null;
  private stopped = false;
  private shapeTry = 0;
  private shapeAt = -Infinity;

  constructor(
    private v: FrameVideo,
    stream: MediaStream,
    private facing: Facing = 'user',
  ) {
    cameraOn(stream);
    this.lastFrame = performance.now();
    this.watchFrames();
  }

  /** Every new picture the camera delivers (Safari 15.4+); else the clock of the video tells. */
  private watchFrames() {
    if (!this.v.requestVideoFrameCallback) return;
    const next = () => {
      if (this.stopped) return;
      this.lastFrame = performance.now();
      this.v.requestVideoFrameCallback!(next);
    };
    this.v.requestVideoFrameCallback(next);
  }

  /** Call with every picture: false while the picture stands still (then it is no use to look for the player). */
  check(now: number): boolean {
    const v = this.v;
    if (v.paused && now - this.lastPlay > 1000) {
      this.lastPlay = now;
      void v.play().catch(() => undefined);
    }
    if (!v.requestVideoFrameCallback && v.currentTime !== this.lastTime) {
      this.lastTime = v.currentTime;
      this.lastFrame = now;
    }
    const still = now - this.lastFrame;
    const track = (v.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (track && v.videoWidth) this.upright(track, now);
    const dead = !track || track.readyState === 'ended';
    if ((dead || still > STILL_MS) && !this.reopening && now - this.lastReopen > 5000) void this.reopen(now);
    return !dead && still < 1000;
  }

  /** The picture as the phone is held: lying on an upright phone, the next size is asked for (once every 0.8 s). */
  private upright(track: MediaStreamTrack, now: number) {
    const v = this.v;
    const shape = shapeOf(v.videoWidth, v.videoHeight);
    v.parentElement?.setAttribute('data-shape', shape);
    const standing = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
    if (!standing || shape !== 'wide' || this.shapeTry >= UPRIGHT.length || now - this.shapeAt < 800 || !track.applyConstraints) return;
    this.shapeAt = now;
    void track.applyConstraints(UPRIGHT[this.shapeTry++]).catch(() => undefined);
  }

  private async reopen(now: number) {
    this.reopening = true;
    this.lastReopen = now;
    try {
      const s = await navigator.mediaDevices.getUserMedia(cameraWish(this.facing));
      if (this.stopped) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      cameraOn(s);
      this.v.srcObject = s;
      await this.v.play().catch(() => undefined);
      // the stream a session shares stays the session's; the one opened here is closed here
      this.own?.getTracks().forEach((t) => t.stop());
      this.own = s;
      this.lastFrame = performance.now();
    } catch {
      /* no camera now: tried again in 5 s */
    } finally {
      this.reopening = false;
    }
  }

  stop() {
    this.stopped = true;
    this.own?.getTracks().forEach((t) => t.stop());
  }
}
