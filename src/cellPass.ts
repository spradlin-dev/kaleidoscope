import type { Rgb } from "./color";
import { linkProgram } from "./glUtils";

/** The shader receives points in three vec4 attributes, so raising this needs more attributes. */
export const MAX_POLYGON_POINTS = 6;

export type PieceShape =
  | { kind: "disc" }
  | { kind: "ring" }
  | { kind: "polygon"; points: readonly [number, number][] };

export type InstanceShape = PieceShape | { kind: "glow" };

/** All lengths, including blur and border width, are in cell units: the cell spans -1 to 1. */
export interface CellInstance {
  x: number;
  y: number;
  rotation: number;
  /** Shapes are outlined at radius 1, then multiplied by this. */
  scale: number;
  color: Rgb;
  alpha: number;
  blur: number;
  borderColor: Rgb;
  borderWidth: number;
  shape: InstanceShape;
}

const SHAPE_CODES = { disc: 0, ring: 1, polygon: 2, glow: 3 } as const;
const VEC4_ATTRIBUTES = 7;
const FLOATS_PER_INSTANCE = VEC4_ATTRIBUTES * 4;

const SHARED_CONSTANTS = `
const int DISC = ${SHAPE_CODES.disc};
const int RING = ${SHAPE_CODES.ring};
const int GLOW = ${SHAPE_CODES.glow};
const int MAX_POINTS = ${MAX_POLYGON_POINTS};
`;

const VERTEX_SHADER = `#version 300 es
${SHARED_CONSTANTS}
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_transform;
layout(location = 2) in vec4 a_color;
layout(location = 3) in vec4 a_shape;
layout(location = 4) in vec4 a_border;
layout(location = 5) in vec4 a_points01;
layout(location = 6) in vec4 a_points23;
layout(location = 7) in vec4 a_points45;

uniform float u_pixel;

out vec2 v_local;
flat out vec4 v_color;
flat out vec4 v_shape;
flat out vec4 v_border;
flat out vec4 v_points01;
flat out vec4 v_points23;
flat out vec4 v_points45;

void main() {
  int kind = int(a_shape.x + 0.5);
  float blur = a_shape.y;
  float scale = a_transform.w;
  // Grow the quad so soft edges aren't cut off; the glow already fades to 0 at radius 1.
  float reach = kind == GLOW ? 1.0 : 1.0 + (blur + u_pixel) / scale;
  vec2 local = a_corner * reach;
  float c = cos(a_transform.z);
  float s = sin(a_transform.z);
  vec2 offset = scale * vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  gl_Position = vec4(a_transform.xy + offset, 0.0, 1.0);

  v_local = local;
  v_color = a_color;
  v_shape = vec4(a_shape.xyz, scale);
  v_border = a_border;
  v_points01 = a_points01;
  v_points23 = a_points23;
  v_points45 = a_points45;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
${SHARED_CONSTANTS}
uniform float u_pixel;

in vec2 v_local;
flat in vec4 v_color;
flat in vec4 v_shape;
flat in vec4 v_border;
flat in vec4 v_points01;
flat in vec4 v_points23;
flat in vec4 v_points45;

out vec4 fragColor;

// Signed distance to a polygon outline (negative inside), after Inigo Quilez.
float polygonDistance(vec2 p, int count) {
  vec2 v[MAX_POINTS] = vec2[MAX_POINTS](
    v_points01.xy, v_points01.zw,
    v_points23.xy, v_points23.zw,
    v_points45.xy, v_points45.zw
  );
  float d = dot(p - v[0], p - v[0]);
  float s = 1.0;
  for (int i = 0; i < MAX_POINTS; i++) {
    if (i >= count) break;
    int j = i == 0 ? count - 1 : i - 1;
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s * sqrt(d);
}

float shapeDistance(int kind, vec2 p) {
  if (kind == DISC) return length(p) - 1.0;
  if (kind == RING) return abs(length(p) - 0.75) - 0.2;
  return polygonDistance(p, int(v_shape.z + 0.5));
}

void main() {
  int kind = int(v_shape.x + 0.5);
  float alpha = v_color.a;
  if (kind == GLOW) {
    float falloff = max(1.0 - dot(v_local, v_local), 0.0);
    float glow = alpha * falloff * falloff * falloff;
    fragColor = vec4(v_color.rgb * glow, glow);
    return;
  }

  float blur = v_shape.y;
  float scale = v_shape.w;
  float borderWidth = v_border.w;
  float signedDistance = shapeDistance(kind, v_local) * scale;
  float edge = blur + 0.5 * u_pixel;
  float piece = 1.0 - smoothstep(-edge, edge, signedDistance);
  float fill = 1.0 - smoothstep(-edge, edge, signedDistance + borderWidth);
  vec3 rgb = v_color.rgb * fill + v_border.rgb * (piece - fill);
  // Premultiplied, to match the ONE, ONE_MINUS_SRC_ALPHA blending in CellPass.render.
  fragColor = vec4(rgb, piece) * alpha;
}`;

export class CellPass {
  readonly texture: WebGLTexture;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly framebuffer: WebGLFramebuffer;
  private readonly vertexArray: WebGLVertexArrayObject;
  private readonly cornerBuffer: WebGLBuffer;
  private readonly instanceBuffer: WebGLBuffer;
  private readonly pixelLocation: WebGLUniformLocation | null;
  private size = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.pixelLocation = gl.getUniformLocation(this.program, "u_pixel");

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.framebuffer = gl.createFramebuffer();

    this.vertexArray = gl.createVertexArray();
    this.cornerBuffer = gl.createBuffer();
    this.instanceBuffer = gl.createBuffer();
    configureAttributes(
      gl,
      this.vertexArray,
      this.cornerBuffer,
      this.instanceBuffer,
    );
  }

  resize(size: number): void {
    const gl = this.gl;
    this.size = size;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      size,
      size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texture,
      0,
    );
  }

  /** Instances are drawn in order, so later ones cover earlier ones. */
  render(instances: readonly CellInstance[], background: Rgb): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.size, this.size);
    gl.clearColor(background[0], background[1], background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.uniform1f(this.pixelLocation, 2 / this.size);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, packInstances(instances), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vertexArray);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instances.length);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.cornerBuffer);
    gl.deleteBuffer(this.instanceBuffer);
    gl.deleteVertexArray(this.vertexArray);
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteTexture(this.texture);
    gl.deleteProgram(this.program);
  }
}

function configureAttributes(
  gl: WebGL2RenderingContext,
  vertexArray: WebGLVertexArrayObject,
  cornerBuffer: WebGLBuffer,
  instanceBuffer: WebGLBuffer,
): void {
  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  const stride = FLOATS_PER_INSTANCE * Float32Array.BYTES_PER_ELEMENT;
  for (let i = 0; i < VEC4_ATTRIBUTES; i++) {
    const location = i + 1;
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 4, gl.FLOAT, false, stride, i * 16);
    gl.vertexAttribDivisor(location, 1);
  }
  gl.bindVertexArray(null);
}

function packInstances(instances: readonly CellInstance[]): Float32Array {
  const data = new Float32Array(instances.length * FLOATS_PER_INSTANCE);
  instances.forEach((instance, i) => {
    const points =
      instance.shape.kind === "polygon" ? instance.shape.points : [];
    if (points.length > MAX_POLYGON_POINTS) {
      throw new Error(
        `Polygons can have at most ${MAX_POLYGON_POINTS} points.`,
      );
    }
    // Same order as the shader's a_transform, a_color, a_shape, a_border and a_points attributes.
    data.set(
      [
        instance.x,
        instance.y,
        instance.rotation,
        instance.scale,
        ...instance.color,
        instance.alpha,
        SHAPE_CODES[instance.shape.kind],
        instance.blur,
        points.length,
        0,
        ...instance.borderColor,
        instance.borderWidth,
        ...points.flat(),
      ],
      i * FLOATS_PER_INSTANCE,
    );
  });
  return data;
}
