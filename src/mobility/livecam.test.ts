import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveCam, cameraWish, shapeOf } from './livecam';

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

  it('upright like the phone: a lying picture on an upright phone asks for other sizes, one after the other', () => {
    expect(shapeOf(720, 1280)).toBe('tall');
    expect(shapeOf(480, 640)).toBe('upright');
    expect(shapeOf(1280, 720)).toBe('wide');
    expect(cameraWish('environment').video).toMatchObject({ facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } });
    vi.stubGlobal('window', { innerWidth: 390, innerHeight: 844 });
    const s = stream();
    const applyConstraints = vi.fn(async () => undefined);
    (s as unknown as { track: Record<string, unknown> }).track.applyConstraints = applyConstraints;
    const stage = { setAttribute: vi.fn() };
    const v = { ...video(s), videoWidth: 1280, videoHeight: 720, parentElement: stage };
    const cam = new LiveCam(v as unknown as HTMLVideoElement, s);
    const t0 = performance.now();
    cam.check(t0 + 10);
    expect(stage.setAttribute).toHaveBeenCalledWith('data-shape', 'wide');
    expect(applyConstraints).toHaveBeenCalledTimes(1);
    cam.check(t0 + 300);
    expect(applyConstraints).toHaveBeenCalledTimes(1);
    cam.check(t0 + 900);
    expect(applyConstraints).toHaveBeenCalledTimes(2);
    // upright now: it fills the screen, nothing more is asked
    v.videoWidth = 720;
    v.videoHeight = 1280;
    cam.check(t0 + 1800);
    expect(stage.setAttribute).toHaveBeenLastCalledWith('data-shape', 'tall');
    expect(applyConstraints).toHaveBeenCalledTimes(2);
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
