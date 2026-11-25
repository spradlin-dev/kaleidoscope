import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { Scene, type Look } from "./scene";

const PALETTE_SAMPLE_FRAMES = 6;

export interface GifOptions {
  size: number;
  fps: number;
  seconds: number;
}

export interface ExportProgress {
  framesDone: number;
  frameCount: number;
  estimatedBytes: number;
}

function frameDelayCentiseconds(fps: number): number {
  return Math.round(100 / fps);
}

export function gifFrameCount(options: GifOptions): number {
  // Counted from the stored delay, which GIF rounds to whole hundredths of a second, so the loop length stays as close to `seconds` as whole frames allow.
  return Math.round(
    (options.seconds * 100) / frameDelayCentiseconds(options.fps),
  );
}

export async function exportGif(
  look: Look,
  options: GifOptions,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const scene = new Scene(document.createElement("canvas"));
  try {
    scene.resize(options.size);
    const frameCount = gifFrameCount(options);
    // The last frame must stop one step short of t = 1, or the loop point shows the same picture twice.
    const renderFrame = (frame: number): Uint8Array =>
      scene.capture(look, frame / frameCount);

    // Per-frame palettes would make flat areas flicker between frames.
    const palette = quantize(samplePixels(renderFrame, frameCount), 256);
    const gif = GIFEncoder();
    const delay = frameDelayCentiseconds(options.fps) * 10;

    for (let frame = 0; frame < frameCount; frame++) {
      const index = applyPalette(renderFrame(frame), palette);
      gif.writeFrame(
        index,
        options.size,
        options.size,
        frame === 0 ? { palette, delay, repeat: 0 } : { delay },
      );
      const framesDone = frame + 1;
      onProgress({
        framesDone,
        frameCount,
        estimatedBytes: (gif.bytesView().length / framesDone) * frameCount,
      });
      await yieldToBrowser();
      signal.throwIfAborted();
    }

    gif.finish();
    return new Blob([gif.bytesView()], { type: "image/gif" });
  } finally {
    scene.dispose();
  }
}

function samplePixels(
  renderFrame: (frame: number) => Uint8Array,
  frameCount: number,
): Uint8Array {
  const frames = Array.from({ length: PALETTE_SAMPLE_FRAMES }, (_, i) =>
    renderFrame(Math.floor((i * frameCount) / PALETTE_SAMPLE_FRAMES)),
  );
  const combined = new Uint8Array(
    frames.reduce((total, pixels) => total + pixels.length, 0),
  );
  let offset = 0;
  for (const pixels of frames) {
    combined.set(pixels, offset);
    offset += pixels.length;
  }
  return combined;
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
