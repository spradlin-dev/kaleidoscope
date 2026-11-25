declare module "gifenc" {
  export type Palette = number[][];

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
  ): Uint8Array;

  export interface FrameOptions {
    /** Required on the first frame, where it becomes the palette for the whole file. */
    palette?: Palette;
    /** Milliseconds; stored in the file as whole hundredths of a second. */
    delay?: number;
    /** Read from the first frame only. 0 loops forever, -1 plays once. */
    repeat?: number;
  }

  export interface GifEncoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: FrameOptions,
    ): void;
    finish(): void;
    /** Shares the encoder's memory, so it is only valid until the next write. */
    bytesView(): Uint8Array<ArrayBuffer>;
  }

  export function GIFEncoder(): GifEncoder;
}
