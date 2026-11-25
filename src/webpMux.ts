// Layout follows the "Extended File Format" section of Google's WebP container specification.
const FRAME_CHUNK_TYPES = new Set(["ALPH", "VP8 ", "VP8L"]);
const VP8X_HAS_ANIMATION = 0x02;
const VP8X_HAS_ALPHA = 0x10;
const ANMF_DO_NOT_BLEND = 0x02;

type Bytes = Uint8Array<ArrayBuffer>;

interface Chunk {
  type: string;
  payload: Bytes;
}

/**
 * Joins still WebP images, all `size` pixels square, into one animated WebP that loops forever.
 * Frames are passed to the Blob as views, so the only full copy is the one the Blob makes.
 */
export function muxAnimatedWebp(
  images: readonly Bytes[],
  size: number,
  delayMs: number,
): Blob {
  const frames = images.map(frameChunks);
  const hasAlpha = frames.some((chunks) =>
    chunks.some((chunk) => chunk.type === "ALPH"),
  );
  const canvasFlags = VP8X_HAS_ANIMATION | (hasAlpha ? VP8X_HAS_ALPHA : 0);
  const reserved = uint24(0);
  const backgroundColor = uint32(0);
  const loopForever = uint16(0);

  const body = [
    ...chunkParts("VP8X", [
      uint8(canvasFlags),
      reserved,
      uint24(size - 1),
      uint24(size - 1),
    ]),
    ...chunkParts("ANIM", [backgroundColor, loopForever]),
    ...frames.flatMap((chunks) =>
      chunkParts("ANMF", [
        ...frameHeader(size, delayMs),
        ...chunks.flatMap((chunk) => chunkParts(chunk.type, [chunk.payload])),
      ]),
    ),
  ];
  const webp = ascii("WEBP");
  return new Blob(
    [ascii("RIFF"), uint32(webp.length + totalLength(body)), webp, ...body],
    { type: "image/webp" },
  );
}

function frameChunks(image: Bytes): Chunk[] {
  if (typeAt(image, 0) !== "RIFF" || typeAt(image, 8) !== "WEBP") {
    throw new Error("The browser produced an image that isn't a WebP.");
  }
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const chunks: Chunk[] = [];
  for (let offset = 12; offset + 8 <= image.length;) {
    const type = typeAt(image, offset);
    const length = view.getUint32(offset + 4, true);
    if (FRAME_CHUNK_TYPES.has(type)) {
      chunks.push({
        type,
        payload: image.subarray(offset + 8, offset + 8 + length),
      });
    }
    offset += 8 + length + (length % 2);
  }
  return chunks;
}

function frameHeader(size: number, delayMs: number): Bytes[] {
  const zeroOffset = uint24(0);
  return [
    zeroOffset,
    zeroOffset,
    uint24(size - 1),
    uint24(size - 1),
    uint24(delayMs),
    uint8(ANMF_DO_NOT_BLEND),
  ];
}

/** Odd-length payloads get a padding byte that the length field doesn't count. */
function chunkParts(type: string, payload: readonly Bytes[]): Bytes[] {
  const length = totalLength(payload);
  const parts = [ascii(type), uint32(length), ...payload];
  if (length % 2 === 1) parts.push(new Uint8Array(1));
  return parts;
}

function typeAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function ascii(text: string): Bytes {
  return new TextEncoder().encode(text);
}

function uint8(value: number): Bytes {
  return Uint8Array.of(value);
}

function uint16(value: number): Bytes {
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff);
}

function uint24(value: number): Bytes {
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff);
}

function uint32(value: number): Bytes {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function totalLength(parts: readonly Bytes[]): number {
  return parts.reduce((total, part) => total + part.length, 0);
}
