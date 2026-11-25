import {
  MAX_POLYGON_POINTS,
  type CellInstance,
  type PieceShape,
} from "./cellPass";
import { hexToRgb, shiftShade, type Rgb } from "./color";
import { between, createRandom, wholeTurns, type Random } from "./random";

const TAU = Math.PI * 2;
const MAX_BLUR = 0.1;
const MAX_BORDER_WIDTH = 0.025;
const MAX_SATURATION_CHANGE = 0.4;
const MAX_BRIGHTNESS_CHANGE = 0.25;
const NEAREST_SCALE = 1.25;
const FARTHEST_SCALE = 0.75;
const GLOW_BLOB_COUNT = 10;
const GLOW_SEED_OFFSET = 0x9e3779b9;
const GLOW_SHAPE = { kind: "glow" } as const;

interface Wave {
  amplitude: number;
  turns: number;
  phase: number;
}

export interface Piece {
  shape: PieceShape;
  /** A 0–1 fraction, not an index, so it stays valid when the palette shrinks. */
  colorSlot: number;
  /** -1 to 1, scaled by the look's shade variety. */
  saturationShift: number;
  /** -1 to 1, scaled by the look's shade variety. */
  brightnessShift: number;
  size: number;
  alpha: number;
  homeX: number;
  homeY: number;
  orbits: Wave[];
  spinTurns: number;
  startAngle: number;
  /** Center of the piece's depth movement: 0 is nearest, 1 is farthest. */
  baseDepth: number;
  depthWave: Wave;
}

export interface GlowBlob {
  colorSlot: number;
  radius: number;
  alpha: number;
  homeX: number;
  homeY: number;
  wave: Wave;
}

export interface CellLook {
  pieces: readonly Piece[];
  blobs: readonly GlowBlob[];
  palette: readonly string[];
  /** 0 to 1. */
  shadeVariety: number;
  /** 0 to 1. */
  glow: number;
  /** Depth that stays sharp, from 0 (nearest) to 1 (farthest). */
  focus: number;
  /** 0 to 1. */
  blur: number;
  borderColor: string;
  /** 0 to 1. */
  borderWidth: number;
}

type ColorAt = (slot: number) => Rgb;

export function createPieces(seed: number, count: number): Piece[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => createPiece(random));
}

export function createGlowBlobs(seed: number): GlowBlob[] {
  // Its own random stream, so changing the piece count leaves the glow where it is.
  const random = createRandom(seed ^ GLOW_SEED_OFFSET);
  return Array.from({ length: GLOW_BLOB_COUNT }, () => {
    const [homeX, homeY] = randomHome(random, 0.95);
    return {
      colorSlot: random(),
      radius: between(random, 0.45, 0.9),
      alpha: between(random, 0.4, 0.8),
      homeX,
      homeY,
      wave: createWave(random, 0.1, 0.3, 1),
    };
  });
}

function createPiece(random: Random): Piece {
  const [homeX, homeY] = randomHome(random, 0.9);
  const depthSwing = between(random, 0.05, 0.25);
  return {
    shape: createShape(random),
    colorSlot: random(),
    saturationShift: between(random, -1, 1),
    brightnessShift: between(random, -1, 1),
    size: between(random, 0.025, 0.1),
    alpha: between(random, 0.55, 0.9),
    homeX,
    homeY,
    orbits: [
      createWave(random, 0.04, 0.16, 2),
      createWave(random, 0.01, 0.06, 3),
    ],
    spinTurns: wholeTurns(random, 2),
    startAngle: random() * TAU,
    // The swing is also the margin from each end, so the moving depth stays between 0 and 1.
    baseDepth: between(random, depthSwing, 1 - depthSwing),
    depthWave: {
      amplitude: depthSwing,
      turns: wholeTurns(random, 1),
      phase: random() * TAU,
    },
  };
}

function randomHome(random: Random, maxDistance: number): [number, number] {
  // Square root spreads points evenly by area instead of bunching them at the center.
  const distance = Math.sqrt(random()) * maxDistance;
  const direction = random() * TAU;
  return [Math.cos(direction) * distance, Math.sin(direction) * distance];
}

function createWave(
  random: Random,
  minAmplitude: number,
  maxAmplitude: number,
  maxTurns: number,
): Wave {
  return {
    amplitude: between(random, minAmplitude, maxAmplitude),
    turns: wholeTurns(random, maxTurns),
    phase: random() * TAU,
  };
}

function createShape(random: Random): PieceShape {
  const roll = random();
  if (roll < 0.2) return { kind: "disc" };
  if (roll < 0.35) return { kind: "ring" };

  const sides = 3 + Math.floor(random() * (MAX_POLYGON_POINTS - 2));
  const stretch = between(random, 0.45, 1);
  const points = Array.from({ length: sides }, (_, i): [number, number] => {
    const angle = ((i + random() * 0.7) / sides) * TAU;
    const reach = between(random, 0.6, 1);
    return [Math.cos(angle) * reach, Math.sin(angle) * reach * stretch];
  });
  return { kind: "polygon", points };
}

function drift(
  x: number,
  y: number,
  waves: readonly Wave[],
  loopAngle: number,
): [number, number] {
  let driftedX = x;
  let driftedY = y;
  for (const wave of waves) {
    const angle = wave.turns * loopAngle + wave.phase;
    driftedX += Math.cos(angle) * wave.amplitude;
    driftedY += Math.sin(angle) * wave.amplitude;
  }
  return [driftedX, driftedY];
}

function depthAt(piece: Piece, loopAngle: number): number {
  const wave = piece.depthWave;
  return (
    piece.baseDepth +
    wave.amplitude * Math.sin(wave.turns * loopAngle + wave.phase)
  );
}

function perspectiveScale(depth: number): number {
  return NEAREST_SCALE + (FARTHEST_SCALE - NEAREST_SCALE) * depth;
}

function pieceColor(piece: Piece, base: Rgb, variety: number): Rgb {
  return shiftShade(
    base,
    1 + piece.saturationShift * variety * MAX_SATURATION_CHANGE,
    piece.brightnessShift * variety * MAX_BRIGHTNESS_CHANGE,
  );
}

function glowInstances(
  look: CellLook,
  loopAngle: number,
  colorAt: ColorAt,
): CellInstance[] {
  return look.blobs.map((blob) => {
    const [x, y] = drift(blob.homeX, blob.homeY, [blob.wave], loopAngle);
    return {
      x,
      y,
      rotation: 0,
      scale: blob.radius,
      color: colorAt(blob.colorSlot),
      alpha: blob.alpha * look.glow,
      blur: 0,
      borderColor: [0, 0, 0],
      borderWidth: 0,
      shape: GLOW_SHAPE,
    };
  });
}

/** Farthest first, so nearer pieces are drawn over them. */
function pieceInstances(
  look: CellLook,
  loopAngle: number,
  colorAt: ColorAt,
): CellInstance[] {
  const borderColor = hexToRgb(look.borderColor);
  return look.pieces
    .map((piece) => ({ piece, depth: depthAt(piece, loopAngle) }))
    .sort((a, b) => b.depth - a.depth)
    .map(({ piece, depth }) => {
      const [x, y] = drift(piece.homeX, piece.homeY, piece.orbits, loopAngle);
      const perspective = perspectiveScale(depth);
      return {
        x,
        y,
        rotation: piece.startAngle + piece.spinTurns * loopAngle,
        scale: piece.size * perspective,
        color: pieceColor(piece, colorAt(piece.colorSlot), look.shadeVariety),
        alpha: piece.alpha,
        blur: look.blur * Math.abs(depth - look.focus) * MAX_BLUR,
        borderColor,
        borderWidth: look.borderWidth * MAX_BORDER_WIDTH * perspective,
        shape: piece.shape,
      };
    });
}

/** Every motion must complete whole cycles per loop so that t = 1 looks exactly like t = 0. */
export function cellInstances(look: CellLook, t: number): CellInstance[] {
  const loopAngle = t * TAU;
  const colors = look.palette.map(hexToRgb);
  const colorAt: ColorAt = (slot) => colors[Math.floor(slot * colors.length)];
  return [
    ...glowInstances(look, loopAngle, colorAt),
    ...pieceInstances(look, loopAngle, colorAt),
  ];
}
