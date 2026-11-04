/**
 * Camera — Part C.
 *
 * The camera is plain data. viewProjection() builds V and P with the mat4
 * module and returns them with the product P · V that the shaders use.
 */
import * as mat4 from '../math/mat4.js';
import * as v3 from '../math/vec3.js';

export function createCamera() {
  return {
    eye: [0, 0, 2.8],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fovY: Math.PI / 4, // radians
    near: 0.3,
    far: 7,
    projection: 'perspective', // or 'orthographic'
    orthoHeight: 2.2, // world units visible vertically in orthographic mode
  };
}

/** The fixed second camera used to look at the orbit camera's frustum. */
export function createInspectionCamera() {
  return {
    ...createCamera(),
    eye: [6.2, 3.6, 7.4],
    target: [0, 0, -0.3],
    fovY: 52 * Math.PI / 180,
    near: 0.1,
    far: 40,
  };
}

/**
 * @param {object} cam     from createCamera()
 * @param {number} aspect  viewport width / height
 * @returns {{ view: Float32Array, proj: Float32Array, matrix: Float32Array }}  matrix = P · V
 */
export function viewProjection(cam, aspect) {
  const view = mat4.lookAt(cam.eye, cam.target, cam.up);
  let proj;
  if (cam.projection === 'orthographic') {
    const h = cam.orthoHeight / 2, w = h * aspect;
    proj = mat4.orthographic(-w, w, -h, h, cam.near, cam.far);
  } else {
    proj = mat4.perspective(cam.fovY, aspect, cam.near, cam.far);
  }
  return { view, proj, matrix: mat4.multiply(proj, view) };
}

/**
 * The eight corners of the viewing volume in world space: [near ×4, far ×4],
 * each ordered (−x −y), (+x −y), (+x +y), (−x +y). Built from the camera's own
 * basis (the same one lookAt uses), so P · V maps them exactly onto the
 * clip-space box: x, y = ±1 and z = 0 (near) or 1 (far).
 */
export function frustumCorners(cam, aspect) {
  const view = mat4.lookAt(cam.eye, cam.target, cam.up);
  // rows of the view rotation are the camera axes in world coordinates
  const right = [view[0], view[4], view[8]];
  const up = [view[1], view[5], view[9]];
  const back = [view[2], view[6], view[10]];
  const plane = (d) => {
    const h = cam.projection === 'perspective' ? Math.tan(cam.fovY / 2) * d : cam.orthoHeight / 2;
    const w = h * aspect;
    const centre = v3.sub(cam.eye, v3.scale(back, d));
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) =>
      v3.add(centre, v3.add(v3.scale(right, x * w), v3.scale(up, y * h))));
  };
  return { near: plane(cam.near), far: plane(cam.far) };
}

/**
 * Depth resolution: the smallest change of view-space distance that still
 * changes a 24-bit depth value, at distance d in front of a perspective camera.
 *   z_ndc = f (d − n) / (d (f − n))   ⇒   dz_ndc/dd = f n / (d² (f − n))
 *   Δd ≈ 2⁻²⁴ · d² (f − n) / (f n)
 */
export function depthStep(near, far, d, bits = 24) {
  return (d * d * (far - near)) / (far * near) / 2 ** bits;
}

/**
 * Distance at which a perspective camera sees the whole painting (width 2a,
 * height 2) in a viewport of the given aspect ratio, with a small margin.
 */
export function fitDistance(fovY, viewportAspect, paintingAspect, margin = 1.08) {
  const halfHeight = Math.tan(fovY / 2);
  const needForHeight = 1 / halfHeight;
  const needForWidth = paintingAspect / (halfHeight * viewportAspect);
  return Math.max(needForHeight, needForWidth) * margin;
}
