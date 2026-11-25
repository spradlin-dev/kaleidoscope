export function linkProgram(
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

/** Top row first. Call in the same task as the draw; after that the drawing buffer may already be cleared. */
export function readCanvasPixels(
  gl: WebGL2RenderingContext,
  size: number,
): Uint8Array<ArrayBuffer> {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const bottomUp = new Uint8Array(size * size * 4);
  gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);

  const rowBytes = size * 4;
  const topDown = new Uint8Array(bottomUp.length);
  for (let row = 0; row < size; row++) {
    const from = (size - 1 - row) * rowBytes;
    topDown.set(bottomUp.subarray(from, from + rowBytes), row * rowBytes);
  }
  return topDown;
}
