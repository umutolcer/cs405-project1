import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCamera, createInspectionCamera, viewProjection, frustumCorners, depthStep, fitDistance,
} from '../src/scene/camera.js';
import { Orbit } from '../src/scene/orbit.js';
import { pickRay, intersectPlaneZ, uvToWorld, worldToUV, nearestOnScreen } from '../src/scene/space.js';
import * as m from '../src/math/mat4.js';
import { close, closeArr, project } from './helpers.js';

describe('Part C · camera and frustum', () => {
  test('frustum corners map to the WebGPU clip box (perspective)', () => {
    const cam = createCamera();
    cam.eye = [1.2, 0.7, 3.1];
    const aspect = 1.6;
    const { matrix } = viewProjection(cam, aspect);
    const { near, far } = frustumCorners(cam, aspect);
    const xy = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    near.forEach((p, i) => closeArr(project(matrix, p), [...xy[i], 0], 1e-4, `near ${i}:`));
    far.forEach((p, i) => closeArr(project(matrix, p), [...xy[i], 1], 1e-4, `far ${i}:`));
  });

  test('frustum corners map to the clip box (orthographic)', () => {
    const cam = createCamera();
    cam.projection = 'orthographic';
    cam.eye = [-2, 1, 2.5];
    const { matrix } = viewProjection(cam, 1.3);
    const { near, far } = frustumCorners(cam, 1.3);
    near.forEach((p) => close(project(matrix, p)[2], 0, 1e-5));
    far.forEach((p) => close(project(matrix, p)[2], 1, 1e-5));
    for (const p of [...near, ...far]) {
      const [x, y] = project(matrix, p);
      close(Math.abs(x), 1, 1e-5);
      close(Math.abs(y), 1, 1e-5);
    }
  });

  test('perspective and orthographic give the same depth range z ∈ [0, 1]', () => {
    const cam = createCamera();
    for (const projection of ['perspective', 'orthographic']) {
      cam.projection = projection;
      const { matrix } = viewProjection(cam, 1.5);
      const along = (d) => [cam.eye[0], cam.eye[1], cam.eye[2] - d]; // d in front of the camera
      close(project(matrix, along(cam.near))[2], 0, 1e-5, `${projection} near:`);
      close(project(matrix, along(cam.far))[2], 1, 1e-5, `${projection} far:`);
    }
  });

  test('the inspection camera is a different, fixed camera that sees further', () => {
    const a = createCamera(), b = createInspectionCamera();
    assert.notDeepEqual(a.eye, b.eye);
    assert.ok(b.far > a.far);
  });

  test('depthStep grows with the square of the distance and with far/near', () => {
    assert.ok(depthStep(0.3, 6, 4) > depthStep(0.3, 6, 2));
    close(depthStep(0.3, 6, 4) / depthStep(0.3, 6, 2), 4, 1e-9);
    assert.ok(depthStep(0.01, 6, 3) > depthStep(0.3, 6, 3));
  });

  test('fitDistance shows the whole painting in narrow and wide viewports', () => {
    const fov = Math.PI / 4, a = 1.433;
    for (const aspect of [0.9, 1.5, 2.4]) {
      const d = fitDistance(fov, aspect, a);
      const halfH = Math.tan(fov / 2) * d;
      assert.ok(halfH >= 1 - 1e-9);
      assert.ok(halfH * aspect >= a - 1e-9);
    }
  });
});

describe('Part C · orbit controller', () => {
  test('keeps the camera on a sphere around the target', () => {
    const cam = createCamera();
    const o = new Orbit(cam);
    const r = o.radius;
    o.rotate(120, -40);
    o.rotate(-300, 15);
    close(Math.hypot(...cam.eye.map((v, i) => v - cam.target[i])), r, 1e-9);
  });

  test('the polar angle is clamped, so the view never flips', () => {
    const cam = createCamera();
    const o = new Orbit(cam);
    o.rotate(0, -1e6);
    assert.ok(o.phi > 0);
    o.rotate(0, 1e6);
    assert.ok(o.phi < Math.PI);
    assert.ok(Number.isFinite(m.lookAt(cam.eye, cam.target, cam.up)[0]));
  });

  test('zoom is limited and front() looks straight at the painting', () => {
    const cam = createCamera();
    const o = new Orbit(cam, { minRadius: 1.2, maxRadius: 13 });
    o.zoom(-1e9);
    close(o.radius, 1.2);
    o.zoom(1e9);
    close(o.radius, 13);
    o.front(3);
    closeArr(cam.eye, [0, 0, 3], 1e-9);
  });
});

describe('Part D · picking in the painting plane', () => {
  test('(u, v) ↔ world: corners go to the quad corners and the map is invertible', () => {
    closeArr(uvToWorld([0, 0], 1.433), [-1.433, 1, 0]);
    closeArr(uvToWorld([1, 1], 1.433), [1.433, -1, 0]);
    closeArr(worldToUV(uvToWorld([0.3, 0.8], 1.433, 0.1), 1.433), [0.3, 0.8], 1e-12);
  });

  test('a point projected to the screen is picked back at the same place', () => {
    for (const projection of ['perspective', 'orthographic']) {
      const cam = createCamera();
      cam.projection = projection;
      cam.eye = [0.8, -0.4, 2.6];
      const aspect = 1.7;
      const { matrix } = viewProjection(cam, aspect);
      const p = [0.5, 0.3, 0.1];
      const ndc = project(matrix, p).slice(0, 2);
      const hit = intersectPlaneZ(pickRay(cam, ndc, aspect), 0.1);
      closeArr(hit, p, 1e-4, `${projection}:`);
    }
  });

  test('nearestOnScreen returns the closest point and its distance in pixels', () => {
    const cam = createCamera();
    const { matrix } = viewProjection(cam, 1);
    const size = { width: 800, height: 800 };
    const pts = [[0, 0, 0], [0.5, 0, 0], [-0.5, 0.5, 0]];
    const ndc = project(matrix, pts[1]).slice(0, 2);
    const hit = nearestOnScreen(pts, matrix, [ndc[0] + 0.01, ndc[1]], size);
    assert.equal(hit.index, 1);
    close(hit.distance, 0.01 * 400, 1e-6);
  });
});
