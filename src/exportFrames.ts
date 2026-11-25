import { Scene, type Look } from "./scene";

export interface ExportOptions {
  size: number;
  fps: number;
  seconds: number;
}

export interface ExportProgress {
  framesDone: number;
  frameCount: number;
  /** Null until enough has been encoded to guess. */
  estimatedBytes: number | null;
}

export interface ExportJob {
  size: number;
  frameCount: number;
  delayMs: number;
}

export interface ExportFormat {
  label: string;
  extension: string;
  loopsByItself: boolean;
  /** The smallest step in frame delay that the file can store. */
  delayStepMs: number;
  isAvailable(): Promise<boolean>;
  encode(
    look: Look,
    job: ExportJob,
    onProgress: (progress: ExportProgress) => void,
    signal: AbortSignal,
  ): Promise<Blob>;
}

export type RenderFrame = (frame: number) => Uint8Array<ArrayBuffer>;

/** Counting frames from the delay as stored keeps the loop as close to `seconds` as whole frames allow. */
export function planExport(
  options: ExportOptions,
  delayStepMs: number,
): ExportJob {
  const delayMs = Math.max(
    delayStepMs,
    Math.round(1000 / options.fps / delayStepMs) * delayStepMs,
  );
  return {
    size: options.size,
    frameCount: Math.round((options.seconds * 1000) / delayMs),
    delayMs,
  };
}

export async function withFrames<T>(
  look: Look,
  job: ExportJob,
  work: (render: RenderFrame) => Promise<T>,
): Promise<T> {
  const scene = new Scene(document.createElement("canvas"));
  try {
    scene.resize(job.size);
    // The last frame must stop one step short of t = 1, or the loop point shows the same picture twice.
    return await work((frame) => scene.capture(look, frame / job.frameCount));
  } finally {
    scene.dispose();
  }
}

/** Runs `step` for each frame, letting the page repaint and react to Cancel in between. */
export async function eachFrame(
  frameCount: number,
  signal: AbortSignal,
  step: (frame: number) => void | Promise<void>,
): Promise<void> {
  for (let frame = 0; frame < frameCount; frame++) {
    signal.throwIfAborted();
    await step(frame);
    await yieldToBrowser();
  }
  signal.throwIfAborted();
}

function yieldToBrowser(): Promise<void> {
  // Browsers throttle timers in background tabs to about one per second; message events are not throttled.
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}
