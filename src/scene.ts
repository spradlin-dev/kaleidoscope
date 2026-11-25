import { CORNER_TO_RIM, Kaleidoscope } from "./kaleidoscope";
import { drawCell, type CellLook } from "./objectCell";

const TAU = Math.PI * 2;

export interface Look extends CellLook {
  slices: number;
  /** Must be a whole number, or the loop visibly jumps where it restarts. */
  cellTurns: number;
}

export class Scene {
  private readonly cell = document.createElement("canvas");
  private readonly cellContext: CanvasRenderingContext2D;
  private readonly kaleidoscope: Kaleidoscope;

  constructor(output: HTMLCanvasElement) {
    const context = this.cell.getContext("2d");
    if (!context)
      throw new Error("This browser does not support 2D canvas drawing.");
    this.cellContext = context;
    this.kaleidoscope = new Kaleidoscope(output);
  }

  resize(size: number): void {
    this.kaleidoscope.resize(size);
    // One output pixel then covers about one cell pixel.
    const cellSize = Math.ceil(size / CORNER_TO_RIM);
    this.cell.width = cellSize;
    this.cell.height = cellSize;
  }

  draw(look: Look, t: number): void {
    drawCell(this.cellContext, look, t);
    this.kaleidoscope.render(this.cell, look.slices, TAU * look.cellTurns * t);
  }

  /** RGBA, already flipped to top row first. */
  capture(look: Look, t: number): Uint8Array {
    this.draw(look, t);
    return this.kaleidoscope.readPixels();
  }

  dispose(): void {
    this.kaleidoscope.dispose();
  }
}
