import type { Lm } from './measure';

// The pose model in the browser (MediaPipe Pose Landmarker, as in the Coach prototype): the WASM runtime and the model
// come from the app itself (public/mediapipe – copied from node_modules by scripts/mediapipe-assets.mjs – and
// public/models), so no picture and no request leaves the phone. Loaded only when a camera test starts; the service
// worker keeps the files after the first use (vite.config.ts).
// Ideengebung für Ben: the native app would use the same model (MediaPipe for iOS) or Apple Vision body pose.

type Landmarker = {
  detectForVideo(video: HTMLVideoElement, ts: number): { landmarks?: Lm[][] };
  close(): void;
};

const base = () => (import.meta.env?.BASE_URL ?? './').replace(/\/?$/, '/');

/** WebAssembly SIMD (iOS 16.4+) – the shipped runtime needs it. */
export function wasmSimdSupported(): boolean {
  try {
    // the smallest module that uses a v128 instruction
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

let shared: Promise<Landmarker> | null = null;
let lastTs = -1;

/** The model, loaded once per visit (≈ 9 MB model + 13 MB runtime the first time, then from the cache). */
export function loadPose(): Promise<Landmarker> {
  if (shared) return shared;
  shared = (async () => {
    if (!wasmSimdSupported()) throw new Error('simd');
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(`${base()}mediapipe`);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: `${base()}models/pose_landmarker_full.task`, delegate },
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      return (await PoseLandmarker.createFromOptions(fileset, options('GPU'))) as unknown as Landmarker;
    } catch {
      // older phones / no WebGL: slower, but works
      return (await PoseLandmarker.createFromOptions(fileset, options('CPU'))) as unknown as Landmarker;
    }
  })();
  shared.catch(() => (shared = null));
  return shared;
}

/** The body points in the current video picture (null: nobody seen). */
export function detect(lm: Landmarker, video: HTMLVideoElement): Lm[] | null {
  const now = performance.now();
  const ts = now <= lastTs ? lastTs + 1 : now; // MediaPipe needs increasing times
  lastTs = ts;
  const res = lm.detectForVideo(video, ts);
  const p = res.landmarks?.[0];
  return p ? p.map((l) => ({ x: l.x, y: l.y, z: l.z, v: (l as { visibility?: number }).visibility ?? 1 })) : null;
}
