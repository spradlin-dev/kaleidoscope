import { applyPalette, GIFEncoder, quantize } from "gifenc";
import {
  eachFrame,
  withFrames,
  type ExportFormat,
  type ExportJob,
  type ExportProgress,
  type RenderFrame,
} from "./exportFrames";
import type { Look } from "./scene";

const PALETTE_SAMPLE_FRAMES = 6;

export const gifFormat: ExportFormat = {
  label: "GIF",
  extension: "gif",
  loopsByItself: true,
  delayStepMs: 10,
  isAvailable: async () => true,
  encode: encodeGif,
};

async function encodeGif(
  look: Look,
  job: ExportJob,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const { size, frameCount, delayMs } = job;
  return withFrames(look, job, async (render) => {
    // Per-frame palettes would make flat areas flicker between frames.
    const palette = quantize(samplePixels(render, frameCount), 256);
    const gif = GIFEncoder();
    await eachFrame(frameCount, signal, (frame) => {
      gif.writeFrame(
        applyPalette(render(frame), palette),
        size,
        size,
        frame === 0
          ? { palette, delay: delayMs, repeat: 0 }
          : { delay: delayMs },
      );
      const framesDone = frame + 1;
      onProgress({
        framesDone,
        frameCount,
        estimatedBytes: (gif.bytesView().length / framesDone) * frameCount,
      });
    });
    gif.finish();
    return new Blob([gif.bytesView()], { type: "image/gif" });
  });
}

function samplePixels(render: RenderFrame, frameCount: number): Uint8Array {
  const frames = Array.from({ length: PALETTE_SAMPLE_FRAMES }, (_, i) =>
    render(Math.floor((i * frameCount) / PALETTE_SAMPLE_FRAMES)),
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
