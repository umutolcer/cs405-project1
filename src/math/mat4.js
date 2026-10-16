import * as v3 from './vec3.js';

export function identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function translate(tx, ty, tz) {
  const m = identity();
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}

export function rotateX(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

export function rotateY(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

export function rotateZ(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function scale(sx, sy, sz) {
  return new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1]);
}

export function transpose(m) {
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[c * 4 + r] = m[r * 4 + c];
  return out;
}

export function invertRigid(m) {
  const out = identity();
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) out[c * 4 + r] = m[r * 4 + c];
  }
  for (let r = 0; r < 3; r++) {
    out[12 + r] = -(out[r] * m[12] + out[4 + r] * m[13] + out[8 + r] * m[14]);
  }
  return out;
}

export function transformVec4(m, v) {
  return Array.from({ length: 4 }, (_, r) =>
    m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
}

export function lookAt(eye, target, up) {
  let back = v3.normalize(v3.sub(eye, target));
  if (v3.length(back) < 1e-10) back = [0, 0, 1];
  let right = v3.cross(up, back);
  if (v3.length(right) < 1e-8) {
    const alternate = Math.abs(back[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    right = v3.cross(alternate, back);
  }
  right = v3.normalize(right);
  const camUp = v3.cross(back, right);
  return new Float32Array([
    right[0], camUp[0], back[0], 0,
    right[1], camUp[1], back[1], 0,
    right[2], camUp[2], back[2], 0,
    -v3.dot(right, eye), -v3.dot(camUp, eye), -v3.dot(back, eye), 1,
  ]);
}

export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const z = far / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, z, -1,
    0, 0, z * near, 0,
  ]);
}

export function orthographic(left, right, bottom, top, near, far) {
  const dx = right - left, dy = top - bottom, dz = near - far;
  return new Float32Array([
    2 / dx, 0, 0, 0,
    0, 2 / dy, 0, 0,
    0, 0, 1 / dz, 0,
    -(right + left) / dx, -(top + bottom) / dy, near / dz, 1,
  ]);
}

/* ------------------------------------------------- provided (not graded) - */

/**
 * Pretty-print a column-major matrix as four rows, for showing matrices on
 * screen (Part A asks you to display T·R·S and S·R·T).
 */
export function format(m, digits = 2) {
  if (!m) return '(none)';
  const w = digits + 4;
  let s = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) s += (+m[c * 4 + r]).toFixed(digits).padStart(w);
    if (r < 3) s += '\n';
  }
  return s;
}
