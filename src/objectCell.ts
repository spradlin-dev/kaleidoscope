import { between, createRandom, wholeTurns, type Random } from "./random";

const TAU = Math.PI * 2;

type Shape =
  | { kind: "disc" }
  | { kind: "ring" }
  | { kind: "polygon"; points: [number, number][] };

interface Orbit {
  radius: number;
  turns: number;
  phase: number;
}

export interface Piece {
  shape: Shape;
  /** A 0–1 fraction, not an index, so it stays valid when the palette shrinks. */
  colorSlot: number;
  size: number;
  alpha: number;
  homeX: number;
  homeY: number;
  orbits: Orbit[];
  spinTurns: number;
  startAngle: number;
}

export interface CellLook {
  pieces: readonly Piece[];
  palette: readonly string[];
  background: string;
}

export function createPieces(seed: number, count: number): Piece[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => createPiece(random));
}

function createPiece(random: Random): Piece {
  // Square root spreads pieces evenly by area instead of bunching them at the center.
  const distance = Math.sqrt(random()) * 0.9;
  const direction = random() * TAU;
  return {
    shape: createShape(random),
    colorSlot: random(),
    size: between(random, 0.025, 0.1),
    alpha: between(random, 0.55, 0.9),
    homeX: Math.cos(direction) * distance,
    homeY: Math.sin(direction) * distance,
    orbits: [
      createOrbit(random, 0.04, 0.16, 2),
      createOrbit(random, 0.01, 0.06, 3),
    ],
    spinTurns: wholeTurns(random, 2),
    startAngle: random() * TAU,
  };
}

function createOrbit(
  random: Random,
  minRadius: number,
  maxRadius: number,
  maxTurns: number,
): Orbit {
  return {
    radius: between(random, minRadius, maxRadius),
    turns: wholeTurns(random, maxTurns),
    phase: random() * TAU,
  };
}

function createShape(random: Random): Shape {
  const roll = random();
  if (roll < 0.2) return { kind: "disc" };
  if (roll < 0.35) return { kind: "ring" };

  const sides = 3 + Math.floor(random() * 4);
  const stretch = between(random, 0.45, 1);
  const points = Array.from({ length: sides }, (_, i): [number, number] => {
    const angle = ((i + random() * 0.7) / sides) * TAU;
    const reach = between(random, 0.6, 1);
    return [Math.cos(angle) * reach, Math.sin(angle) * reach * stretch];
  });
  return { kind: "polygon", points };
}

/** Every motion must complete whole cycles per loop so that t = 1 looks exactly like t = 0. */
export function drawCell(
  context: CanvasRenderingContext2D,
  look: CellLook,
  t: number,
): void {
  const { width, height } = context.canvas;
  const half = width / 2;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.fillStyle = look.background;
  context.fillRect(0, 0, width, height);

  const loopAngle = t * TAU;
  for (const piece of look.pieces) {
    let x = piece.homeX;
    let y = piece.homeY;
    for (const orbit of piece.orbits) {
      const angle = orbit.turns * loopAngle + orbit.phase;
      x += Math.cos(angle) * orbit.radius;
      y += Math.sin(angle) * orbit.radius;
    }

    context.setTransform(half, 0, 0, half, half, half);
    context.translate(x, y);
    context.rotate(piece.startAngle + piece.spinTurns * loopAngle);
    context.scale(piece.size, piece.size);
    context.globalAlpha = piece.alpha;
    drawShape(
      context,
      piece.shape,
      look.palette[Math.floor(piece.colorSlot * look.palette.length)],
    );
  }
}

function drawShape(
  context: CanvasRenderingContext2D,
  shape: Shape,
  color: string,
): void {
  context.beginPath();
  if (shape.kind === "ring") {
    context.arc(0, 0, 0.75, 0, TAU);
    context.lineWidth = 0.4;
    context.strokeStyle = color;
    context.stroke();
    return;
  }

  if (shape.kind === "disc") {
    context.arc(0, 0, 1, 0, TAU);
  } else {
    for (const [x, y] of shape.points) context.lineTo(x, y);
    context.closePath();
  }
  context.fillStyle = color;
  context.fill();
}
