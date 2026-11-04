/**
 * Painting coordinates.
 *
 * (u, v) ∈ [0, 1]²: u to the right, v DOWN, origin at the top-left of the
 * image (the convention of image pixels, and of the exported JSON).
 * World: the painting is the quad  x ∈ [−a, a], y ∈ [−1, 1]  in the plane
 * z = 0, with a = image width / height. Objects in front have z > 0.
 */
import * as v3 from '../math/vec3.js';
import * as mat4 from '../math/mat4.js';

export const uvToWorld = (uv, aspect, z = 0) => [(uv[0] * 2 - 1) * aspect, 1 - uv[1] * 2, z];
export const worldToUV = (p, aspect) => [(p[0] / aspect + 1) / 2, (1 - p[1]) / 2];

/**
 * Ray through a point of the viewport (ndc ∈ [−1, 1]², +y up) for a camera
 * looking down its own −z axis. Perspective: all rays leave the eye;
 * orthographic: parallel rays starting on the image plane through the eye.
 */
export function pickRay(cam, ndc, aspect) {
  const view = mat4.lookAt(cam.eye, cam.target, cam.up);
  const right = [view[0], view[4], view[8]];
  const up = [view[1], view[5], view[9]];
  const forward = [-view[2], -view[6], -view[10]];
  if (cam.projection === 'perspective') {
    const h = Math.tan(cam.fovY / 2);
    const direction = v3.normalize(v3.add(forward, v3.add(
      v3.scale(right, ndc[0] * h * aspect), v3.scale(up, ndc[1] * h))));
    return { origin: [...cam.eye], direction };
  }
  const h = cam.orthoHeight / 2;
  const origin = v3.add(cam.eye, v3.add(v3.scale(right, ndc[0] * h * aspect), v3.scale(up, ndc[1] * h)));
  return { origin, direction: forward };
}

/** Intersection of a ray with the plane z = zPlane (null if parallel or behind). */
export function intersectPlaneZ(ray, zPlane) {
  if (Math.abs(ray.direction[2]) < 1e-9) return null;
  const t = (zPlane - ray.origin[2]) / ray.direction[2];
  if (t < 0) return null;
  return v3.add(ray.origin, v3.scale(ray.direction, t));
}

/**
 * Which of `points` (world space) lies closest to the cursor on screen?
 * @param {number[][]} points
 * @param {Float32Array} vp   P · V
 * @param {number[]} ndc      cursor in normalised device coordinates
 * @param {{width: number, height: number}} size  viewport size in pixels
 * @returns {{ index: number, distance: number } | null}  distance in pixels
 */
export function nearestOnScreen(points, vp, ndc, size) {
  let best = null;
  points.forEach((p, index) => {
    const c = mat4.transformVec4(vp, [...p, 1]);
    if (c[3] <= 0) return; // behind the camera
    const dx = (c[0] / c[3] - ndc[0]) * size.width / 2;
    const dy = (c[1] / c[3] - ndc[1]) * size.height / 2;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { index, distance };
  });
  return best;
}
