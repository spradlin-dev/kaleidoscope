import {
  eachFrame,
  withFrames,
  type ExportFormat,
  type ExportJob,
  type ExportProgress,
} from "./exportFrames";
import type { Look } from "./scene";
import { muxAnimatedWebp } from "./webpMux";

const WEBP_QUALITY = 0.9;

export const webpFormat: ExportFormat = {
  label: "Animated WebP",
  extension: "webp",
  loopsByItself: true,
  delayStepMs: 1,
  isAvailable: async () =>
    document
      .createElement("canvas")
      .toDataURL("image/webp")
      .startsWith("data:image/webp"),
  encode: encodeWebp,
};

async function encodeWebp(
  look: Look,
  job: ExportJob,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const { size, frameCount, delayMs } = job;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser does not support 2D canvas drawing.");
  }

  const images: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  await withFrames(look, job, (render) =>
    eachFrame(frameCount, signal, async (frame) => {
      const pixels = render(frame);
      const rgba = new Uint8ClampedArray(
        pixels.buffer,
        pixels.byteOffset,
        pixels.byteLength,
      );
      context.putImageData(new ImageData(rgba, size), 0, 0);
      const image = await encodeCanvas(canvas);
      images.push(image);
      bytes += image.length;
      onProgress({
        framesDone: frame + 1,
        frameCount,
        estimatedBytes: (bytes / (frame + 1)) * frameCount,
      });
    }),
  );
  return muxAnimatedWebp(images, size, delayMs);
}

async function encodeCanvas(
  canvas: HTMLCanvasElement,
): Promise<Uint8Array<ArrayBuffer>> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  );
  if (!blob || blob.type !== "image/webp") {
    throw new Error("This browser can't save WebP images.");
  }
  return new Uint8Array(await blob.arrayBuffer());
}
