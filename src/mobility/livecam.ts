import { cameraOn } from '../lib/caddietalk';

// The camera picture stays live (Sascha 1.11.2026: "I still cannot see myself live – it looks like a photo"): the
// iPhone may pause the video or stop delivering pictures (the sound switched, a call, the page hidden a moment). Every
// picture checks it: a paused video plays again, a picture that stands still for 2.5 s gets a fresh camera.

type Facing = 'user' | 'environment';
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
    const dead = !track || track.readyState === 'ended';
    if ((dead || still > STILL_MS) && !this.reopening && now - this.lastReopen > 5000) void this.reopen(now);
    return !dead && still < 1000;
  }

  private async reopen(now: number) {
    this.reopening = true;
    this.lastReopen = now;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false });
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
