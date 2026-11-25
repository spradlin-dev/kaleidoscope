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
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly vertexArray: WebGLVertexArrayObject;
  private readonly slicesLocation: WebGLUniformLocation | null;
  private readonly rotationLocation: WebGLUniformLocation | null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl) {
      throw new Error(
        "This browser can't draw the kaleidoscope because WebGL 2 graphics aren't available. Turning on hardware acceleration in the browser's settings usually fixes this.",
      );
    }
    this.canvas = canvas;
    this.gl = gl;

    this.program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.slicesLocation = gl.getUniformLocation(this.program, "u_slices");
    this.rotationLocation = gl.getUniformLocation(this.program, "u_rotation");
    this.vertexArray = gl.createVertexArray();
    this.texture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  resize(size: number): void {
    this.canvas.width = size;
    this.canvas.height = size;
    this.gl.viewport(0, 0, size, size);
  }

  /** `slices` must be even so the mirrored wedges pair up around the circle. */
  render(source: TexImageSource, slices: number, rotation: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.useProgram(this.program);
    gl.uniform1f(this.slicesLocation, slices);
    gl.uniform1f(this.rotationLocation, rotation);
    gl.bindVertexArray(this.vertexArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Call in the same task as `render`; after that the drawing buffer may already be cleared. */
  readPixels(): Uint8Array {
    const { width, height } = this.canvas;
    const bottomUp = new Uint8Array(width * height * 4);
    this.gl.readPixels(
      0,
      0,
      width,
      height,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      bottomUp,
    );

    const rowBytes = width * 4;
    const topDown = new Uint8Array(bottomUp.length);
    for (let row = 0; row < height; row++) {
      const from = (height - 1 - row) * rowBytes;
      topDown.set(bottomUp.subarray(from, from + rowBytes), row * rowBytes);
    }
    return topDown;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteVertexArray(this.vertexArray);
    gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const program = gl.createProgram();
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      `Shader program failed to link: ${gl.getProgramInfoLog(program)}`,
    );
  }
  return program;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: GLenum,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create a WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader failed to compile: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}
