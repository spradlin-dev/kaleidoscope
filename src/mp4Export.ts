import {
  eachFrame,
  withFrames,
  type ExportFormat,
  type ExportJob,
  type ExportProgress,
} from "./exportFrames";
import type { Look } from "./scene";

type Media = typeof import("mediabunny");

export const mp4Format: ExportFormat = {
  label: "MP4 video",
  extension: "mp4",
  loopsByItself: false,
  delayStepMs: 1,
  // Only checks that the browser has an H.264 encoder at all, without downloading the video library;
  // encode() checks the real size and frame rate.
  isAvailable: async () => {
    if (typeof VideoEncoder === "undefined") return false;
    const { supported } = await VideoEncoder.isConfigSupported({
      codec: "avc1.42001f",
      width: 360,
      height: 360,
    });
    return supported === true;
  },
  encode: encodeMp4,
};

interface VideoWriter {
  addFrame(
    pixels: Uint8Array<ArrayBuffer>,
    timestamp: number,
    duration: number,
  ): Promise<void>;
  /** Null until the encoder has produced its first frames. */
  averageFrameBytes(): number | null;
  finish(): Promise<Blob>;
  cancel(): Promise<void>;
}

async function encodeMp4(
  look: Look,
  job: ExportJob,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const { frameCount, delayMs } = job;
  const video = await startVideo(await loadMedia(), job.size, 1000 / delayMs);
  try {
    await withFrames(look, job, (render) =>
      eachFrame(frameCount, signal, async (frame) => {
        await video.addFrame(
          render(frame),
          (frame * delayMs) / 1000,
          delayMs / 1000,
        );
        const average = video.averageFrameBytes();
        onProgress({
          framesDone: frame + 1,
          frameCount,
          estimatedBytes: average === null ? null : average * frameCount,
        });
      }),
    );
    return await video.finish();
  } catch (error) {
    await video.cancel();
    throw error;
  }
}

async function loadMedia(): Promise<Media> {
  try {
    return await import("mediabunny");
  } catch (error) {
    // After the site is updated, a page left open can point at a video-library file that no longer exists.
    throw new Error(
      "The video tools couldn't load. Reload the page and try again.",
      { cause: error },
    );
  }
}

async function startVideo(
  media: Media,
  size: number,
  frameRate: number,
): Promise<VideoWriter> {
  const quality = new media.Quality("high");
  const settings = { width: size, height: size, frameRate, quality };
  if (!(await media.canEncodeVideo("avc", settings))) {
    throw new Error(
      "This browser can't make an MP4 with these settings. Try a smaller size or fewer frames per second.",
    );
  }

  let bytes = 0;
  let packets = 0;
  const source = new media.VideoSampleSource({
    codec: "avc",
    quality,
    onEncodedPacket: (packet) => {
      bytes += packet.byteLength;
      packets += 1;
    },
  });
  const output = new media.Output({
    format: new media.Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new media.BufferTarget(),
  });
  // Frees the encoder after a failure; the original error is the one worth showing.
  const cancel = () => output.cancel().catch(() => undefined);
  output.addVideoTrack(source, { frameRate });
  try {
    await output.start();
  } catch (error) {
    await cancel();
    throw error;
  }

  return {
    async addFrame(pixels, timestamp, duration) {
      const sample = new media.VideoSample(pixels, {
        format: "RGBA",
        codedWidth: size,
        codedHeight: size,
        timestamp,
        duration,
      });
      try {
        await source.add(sample);
      } finally {
        sample.close();
      }
    },
    averageFrameBytes: () => (packets > 0 ? bytes / packets : null),
    async finish() {
      await output.finalize();
      const buffer = output.target.buffer;
      if (!buffer) throw new Error("The video file was not created.");
      return new Blob([buffer], { type: "video/mp4" });
    },
    cancel,
  };
}
