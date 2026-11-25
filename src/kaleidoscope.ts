import { linkProgram } from "./glUtils";

/** Output corners land on the rim of the cell's circle; scene.ts sizes the cell texture from this. */
export const CORNER_TO_RIM = Math.SQRT1_2;

const VERTEX_SHADER = `#version 300 es
out vec2 v_position;

void main() {
  v_position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
  gl_Position = vec4(v_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_cell;
uniform float u_slices;
uniform float u_rotation;

in vec2 v_position;
out vec4 fragColor;

const float TAU = 6.283185307179586;

void main() {
  vec2 p = v_position * ${CORNER_TO_RIM.toFixed(16)};
  float radius = length(p);
  float wedge = TAU / u_slices;
  float angle = radius > 0.0 ? mod(atan(p.y, p.x), 2.0 * wedge) : 0.0;
  // Odd wedges are mirrored so neighbouring edges match and the seams stay invisible.
  angle = wedge - abs(angle - wedge);
  angle += u_rotation;
  vec2 cellPoint = radius * vec2(cos(angle), sin(angle));
  fragColor = texture(u_cell, cellPoint * 0.5 + 0.5);
}`;

export class Kaleidoscope {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vertexArray: WebGLVertexArrayObject;
  private readonly slicesLocation: WebGLUniformLocation | null;
  private readonly rotationLocation: WebGLUniformLocation | null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.slicesLocation = gl.getUniformLocation(this.program, "u_slices");
    this.rotationLocation = gl.getUniformLocation(this.program, "u_rotation");
    this.vertexArray = gl.createVertexArray();
  }

  /** `slices` must be even so the mirrored wedges pair up around the circle. */
  render(
    cell: WebGLTexture,
    size: number,
    slices: number,
    rotation: number,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cell);
    gl.uniform1f(this.slicesLocation, slices);
    gl.uniform1f(this.rotationLocation, rotation);
    gl.bindVertexArray(this.vertexArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vertexArray);
    this.gl.deleteProgram(this.program);
  }
}
