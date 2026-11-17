/**
 * One WebGL2 renderer shared by the hero, the gallery thumbnails and the
 * studio. It owns a single offscreen canvas; callers copy the result into
 * normal 2D canvases (so crossfades stay simple and only one GL context is
 * created on phones).
 *
 * Pipeline: exposure (linear) → contrast → temperature → up to 3 stacked LUTs.
 */
const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D uImage;
uniform sampler3D uLut0;
uniform sampler3D uLut1;
uniform sampler3D uLut2;
uniform int uHas0;
uniform int uHas1;
uniform int uHas2;
uniform float uStr0;
uniform float uStr1;
uniform float uStr2;
uniform vec2 uRes;
uniform float uImgAspect;
uniform float uFit;
uniform float uExposure;
uniform float uContrast;
uniform float uTemp;
in vec2 vUv;
out vec4 outColor;

vec3 applyLut(sampler3D lut, vec3 c, float s) {
  vec3 g = texture(lut, clamp(c, 0.0, 1.0)).rgb;
  return mix(c, g, s);
}

void main() {
  // image-space uv: (0,0) = top-left of the source, independent of the
  // browser's flipY handling for Image vs ImageBitmap uploads.
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float canvasAspect = uRes.x / uRes.y;
  if (uFit > 0.5) {
    // contain: whole photo visible, black letterbox
    if (canvasAspect > uImgAspect) {
      float visible = uImgAspect / canvasAspect;
      uv.x = (uv.x - (1.0 - visible) * 0.5) / visible;
    } else {
      float visible = canvasAspect / uImgAspect;
      uv.y = (uv.y - (1.0 - visible) * 0.5) / visible;
    }
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      outColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  } else {
    // cover: fill the viewport, crop the overflow
    if (canvasAspect > uImgAspect) {
      float visible = uImgAspect / canvasAspect;
      uv.y = (uv.y - 0.5) * visible + 0.5;
    } else {
      float visible = canvasAspect / uImgAspect;
      uv.x = (uv.x - 0.5) * visible + 0.5;
    }
  }

  vec3 c = texture(uImage, uv).rgb;
  // exposure in linear light so highlights roll off like a camera would
  vec3 lin = pow(max(c, 0.0), vec3(2.2)) * exp2(uExposure);
  c = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  // gentle contrast around mid grey
  float k = 1.0 + uContrast * 0.006;
  c = clamp((c - 0.5) * k + 0.5, 0.0, 1.0);
  // white balance: + = warmer, - = cooler
  c.r = clamp(c.r * (1.0 + uTemp * 0.0013), 0.0, 1.0);
  c.b = clamp(c.b * (1.0 - uTemp * 0.0013), 0.0, 1.0);

  if (uHas0 == 1) c = applyLut(uLut0, c, uStr0);
  if (uHas1 == 1) c = applyLut(uLut1, c, uStr1);
  if (uHas2 == 1) c = applyLut(uLut2, c, uStr2);

  outColor = vec4(c, 1.0);
}`;

export class LookRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!this.gl) throw new Error('这台设备不支持 WebGL2');
    const gl = this.gl;
    this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

    this.program = createProgram(gl, VERT, FRAG);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.uniform = {};
    for (const name of ['uImage', 'uLut0', 'uLut1', 'uLut2', 'uHas0', 'uHas1', 'uHas2', 'uStr0', 'uStr1', 'uStr2', 'uRes', 'uImgAspect', 'uFit', 'uExposure', 'uContrast', 'uTemp']) {
      this.uniform[name] = gl.getUniformLocation(this.program, name);
    }

    this.imageTex = null;
    this.imgW = 0;
    this.imgH = 0;
    this.lutTex = new Map();
    this.dummyLut = createDummyLut(gl);

    gl.useProgram(this.program);
    gl.uniform1i(this.uniform.uImage, 0);
    gl.uniform1i(this.uniform.uLut0, 1);
    gl.uniform1i(this.uniform.uLut1, 2);
    gl.uniform1i(this.uniform.uLut2, 3);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.dummyLut);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, this.dummyLut);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_3D, this.dummyLut);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * Upload the photo once; thumbnails and previews reuse it.
   * Images larger than MAX_TEXTURE_SIZE are downscaled for the GPU preview;
   * full-resolution export re-uploads crops instead (see exportImage()).
   */
  setImage(source) {
    const gl = this.gl;
    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;
    if (!w || !h) throw new Error('图片尺寸无效');
    this.imgW = w;
    this.imgH = h;
    let upload = source;
    const max = this.maxTexture;
    if (Math.max(w, h) > max) {
      const k = max / Math.max(w, h);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d', { alpha: false }).drawImage(source, 0, 0, c.width, c.height);
      upload = c;
    }
    if (this.imageTex) gl.deleteTexture(this.imageTex);
    this.imageTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  _lutTexture(id, parsed) {
    let tex = this.lutTex.get(id);
    if (tex) return tex;
    const gl = this.gl;
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, parsed.size, parsed.size, parsed.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, parsed.data);
    gl.bindTexture(gl.TEXTURE_3D, null);
    this.lutTex.set(id, tex);
    return tex;
  }

  /**
   * Render into the internal canvas.
   * @param {Array<{id:string, parsed:{size:number,data:Uint8Array}, strength:number}>} luts
   * @param {{exposure:number, contrast:number, temp:number}} adjust
   */
  render(luts, adjust, w, h, fit = 'cover') {
    const gl = this.gl;
    if (!this.imageTex) return this.canvas;
    const max = this.maxTexture;
    const scale = Math.min(1, max / Math.max(w, h));
    w = Math.max(2, Math.round(w * scale));
    h = Math.max(2, Math.round(h * scale));
    this.canvas.width = w;
    this.canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);

    const stack = (luts || []).slice(0, 3);
    for (let i = 0; i < 3; i++) {
      const unit = 1 + i;
      const has = stack[i] ? 1 : 0;
      const parsed = stack[i]?.parsed;
      const tex = has ? this._lutTexture(stack[i].id, parsed) : this.dummyLut;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.uniform1i(this.uniform[`uHas${i}`], has);
      gl.uniform1f(this.uniform[`uStr${i}`], has ? Math.max(0, Math.min(1, (stack[i].strength ?? 100) / 100)) : 0);
    }
    gl.activeTexture(gl.TEXTURE0);

    gl.uniform2f(this.uniform.uRes, w, h);
    gl.uniform1f(this.uniform.uImgAspect, this.imgW / this.imgH);
    gl.uniform1f(this.uniform.uFit, fit === 'contain' ? 1 : 0);
    gl.uniform1f(this.uniform.uExposure, adjust?.exposure || 0);
    gl.uniform1f(this.uniform.uContrast, adjust?.contrast || 0);
    gl.uniform1f(this.uniform.uTemp, adjust?.temp || 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }

  dispose() {
    const gl = this.gl;
    if (this.imageTex) gl.deleteTexture(this.imageTex);
    for (const tex of this.lutTex.values()) gl.deleteTexture(tex);
    this.lutTex.clear();
  }
}

function createProgram(gl, vsSource, fsSource) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
    }
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
  }
  return program;
}

function createDummyLut(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  gl.bindTexture(gl.TEXTURE_3D, null);
  return tex;
}
