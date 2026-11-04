/**
 * Orbit controller: keeps the camera on a sphere around its target.
 * theta = azimuth about +y (0 looks down −z), phi = polar angle from +y.
 */
import * as v3 from '../math/vec3.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export class Orbit {
  // maxRadius stays below the default far plane, so zooming out never clips the painting
  constructor(camera, { minRadius = 1.2, maxRadius = 6 } = {}) {
    this.camera = camera;
    this.minRadius = minRadius;
    this.maxRadius = maxRadius;
    this.sync();
  }

  /** Read theta, phi and radius back from the camera (after a reset). */
  sync() {
    const d = v3.sub(this.camera.eye, this.camera.target);
    this.radius = v3.length(d);
    this.theta = Math.atan2(d[0], d[2]);
    this.phi = Math.acos(clamp(d[1] / this.radius, -1, 1));
  }

  apply() {
    const { camera, radius, theta, phi } = this;
    const s = Math.sin(phi);
    camera.eye = [
      camera.target[0] + radius * s * Math.sin(theta),
      camera.target[1] + radius * Math.cos(phi),
      camera.target[2] + radius * s * Math.cos(theta),
    ];
  }

  /** Mouse drag, in pixels. */
  rotate(dx, dy) {
    this.theta -= dx * 0.005;
    this.phi = clamp(this.phi - dy * 0.005, 0.08, Math.PI - 0.08);
    this.apply();
  }

  /** Mouse wheel (deltaY). */
  zoom(delta) {
    this.radius = clamp(this.radius * Math.exp(delta * 0.001), this.minRadius, this.maxRadius);
    this.apply();
  }

  /** Look straight at the painting from the front. */
  front(distance = 2.8) {
    this.theta = 0;
    this.phi = Math.PI / 2;
    this.radius = distance;
    this.apply();
  }
}
