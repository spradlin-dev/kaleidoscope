import { CellPass } from "./cellPass";
import { hexToRgb } from "./color";
import { readCanvasPixels } from "./glUtils";
import { CORNER_TO_RIM, Kaleidoscope } from "./kaleidoscope";
import { cellInstances, type CellLook } from "./objectCell";

const TAU = Math.PI * 2;

export interface Look extends CellLook {
  background: string;
  slices: number;
  /** Must be a whole number, or the loop visibly jumps where it restarts. */
  cellTurns: number;
}

export class Scene {
  private readonly output: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly cellPass: CellPass;
  private readonly kaleidoscope: Kaleidoscope;
  private size = 0;

  constructor(output: HTMLCanvasElement) {
    const gl = output.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl) {
      throw new Error(
        "This browser can't draw the kaleidoscope because WebGL 2 graphics aren't available. Turning on hardware acceleration in the browser's settings usually fixes this.",
      );
    }
    this.output = output;
    this.gl = gl;
    this.cellPass = new CellPass(gl);
    this.kaleidoscope = new Kaleidoscope(gl);
  }

  resize(size: number): void {
    this.size = size;
    this.output.width = size;
    this.output.height = size;
    // One output pixel then covers about one cell pixel.
    this.cellPass.resize(Math.ceil(size / CORNER_TO_RIM));
  }

  draw(look: Look, t: number): void {
    this.cellPass.render(cellInstances(look, t), hexToRgb(look.background));
    this.kaleidoscope.render(
      this.cellPass.texture,
      this.size,
      look.slices,
      TAU * look.cellTurns * t,
    );
  }

  /** RGBA, already flipped to top row first. */
  capture(look: Look, t: number): Uint8Array {
    this.draw(look, t);
    const pixels = readCanvasPixels(this.gl, this.size);
    if (this.gl.isContextLost()) {
      throw new Error(
        "The graphics card was reset partway through. Please try again.",
      );
    }
    return pixels;
  }

  dispose(): void {
    this.cellPass.dispose();
    this.kaleidoscope.dispose();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
