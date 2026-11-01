import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveCam } from './livecam';

const stream = (state: 'live' | 'ended' = 'live') => {
  const track = { readyState: state, stop: vi.fn() };
  return { getVideoTracks: () => [track], getTracks: () => [track], track } as unknown as MediaStream & { track: typeof track };
};
/** a video whose clock runs while `moving` */
const video = (s: MediaStream) => {
  const v = { paused: false, currentTime: 0, srcObject: s as MediaStream | null, play: vi.fn(async () => void (v.paused = false)) };
  return v;
};

afterEach(() => vi.unstubAllGlobals());

describe('the camera picture stays live', () => {
  it('a paused video plays again, at most once a second', () => {
    const v = video(stream());
    const cam = new LiveCam(v as unknown as HTMLVideoElement, v.srcObject!);
    v.paused = true;
    v.play.mockImplementation(async () => undefined);
    cam.check(5000);
    cam.check(5500);
    expect(v.play).toHaveBeenCalledTimes(1);
    cam.check(6100);
    expect(v.play).toHaveBeenCalledTimes(2);
  });

  it('a picture that stands still is not used, and after 2.5 s a fresh camera comes', async () => {
    const fresh = stream();
    const getUserMedia = vi.fn(async () => fresh);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const first = stream();
    const v = video(first);
    const t0 = performance.now();
    const cam = new LiveCam(v as unknown as HTMLVideoElement, first);
    v.currentTime = 1;
    expect(cam.check(t0 + 100)).toBe(true);
    expect(cam.check(t0 + 1200)).toBe(false); // the clock stood still for 1.1 s
    expect(getUserMedia).not.toHaveBeenCalled();
    cam.check(t0 + 2700);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(v.srcObject).toBe(fresh));
    // the session's stream is not stopped here; the fresh one is, at the end
    cam.stop();
    expect((first as unknown as { track: { stop: () => void } }).track.stop).not.toHaveBeenCalled();
    expect((fresh as unknown as { track: { stop: () => void } }).track.stop).toHaveBeenCalled();
  });

  it('an ended camera is opened again at once', () => {
    const getUserMedia = vi.fn(async () => stream());
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const v = video(stream('ended'));
    const cam = new LiveCam(v as unknown as HTMLVideoElement, v.srcObject!);
    expect(cam.check(performance.now())).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
