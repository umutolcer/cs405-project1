/**
 * Draws everything that lives in the scene, for any camera:
 *
 *   prepare(model)  once per frame: rebuild the dynamic geometry (curve ribbon,
 *                   control polygon, de Casteljau lines, node axes, frustum)
 *   draw(pass, vp)  once per VIEW (main view, inset): P · V is the only
 *                   thing that changes between views
 *
 * Every draw takes its own uniform slot (see uniforms.js), so the same frame
 * can safely draw the scene twice.
 */
import * as mat4 from '../math/mat4.js';
import { MeshRenderer } from './mesh.js';
import { LineRenderer } from './lines.js';
import { ribbon, segment } from './ribbon.js';
import { cube } from '../scene/geometry.js';
import { sphere, cubeEdges } from '../scene/shapes.js';
import { uvToWorld } from '../scene/space.js';
import { nodeFrame } from '../scene/gallery.js';
import { frustumCorners } from '../scene/camera.js';

/** Height above the painting plane (z = 0) of each layer, so they never z-fight. */
export const Z = { curve: 0.04, polygon: 0.07, point: 0.10, construction: 0.12, traveller: 0.22 };

const RGB = {
  curve: [1.0, 0.62, 0.08],
  polygon: [0.10, 0.80, 0.95],
  knot: [1.0, 0.30, 0.08],
  handle: [0.10, 0.75, 0.95],
  selected: [1.0, 0.95, 0.20],
  traveller: [0.95, 0.95, 0.20],
  cast: [[0.95, 0.30, 0.75], [0.55, 0.95, 0.30], [1.0, 1.0, 0.30]],
  axisX: [1, 0.1, 0.1], axisY: [0.1, 1, 0.1], axisZ: [0.15, 0.42, 1],
  near: [0.35, 0.93, 0.97], far: [0.93, 0.44, 0.78], edge: [1, 0.85, 0.35], ray: [0.45, 0.45, 0.45],
  ghost: [0.85, 0.85, 0.85],
  camera: [0.98, 0.80, 0.27],
};

const mul = (...ms) => ms.reduce((acc, m) => mat4.multiply(acc, m)); // product, right to left
const T = mat4.translate;
const S = (x, y = x, z = x) => mat4.scale(x, y, z); // S(k) = uniform scale

export class SceneView {
  constructor(gpu, renderer) {
    this.gpu = gpu;
    this.renderer = renderer;
    this.meshes = new MeshRenderer(gpu);
    this.lines = new LineRenderer(gpu);
    this.mesh = { cube: this.meshes.createMesh(cube(), 'cube'), sphere: this.meshes.createMesh(sphere(), 'sphere') };
    this.edges = this.lines.create(cubeEdges(RGB.ghost), 'cube edges');
    const empty = () => this.lines.create(new Float32Array(0));
    this.buffers = { curve: empty(), polygon: empty(), cast: empty(), axes: empty(), frustum: empty() };
    // full-viewport quad in clip space, used to clear the inset's background
    const z = 0.5, c = [0.02, 0.022, 0.03];
    const quad = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]].flatMap(([x, y]) => [x, y, z, ...c]);
    this.backdrop = this.lines.create(new Float32Array(quad), 'backdrop');
    this.identity = mat4.identity();
    this.model = null;
  }

  /** Once per frame, before prepare() and the first draw(). */
  beginFrame() {
    this.meshes.beginFrame();
    this.lines.beginFrame();
  }

  /** Rebuild the dynamic geometry from the current state. */
  prepare(model) {
    this.model = model;
    const { trace, ui, paintingAspect: asp } = model;
    const toWorld = (uv, z) => uvToWorld(uv, asp, z);
    const upload = (buf, data) => this.lines.update(buf, new Float32Array(data));

    // the curve, as a thick ribbon lying on the painting
    upload(this.buffers.curve, ribbon([], trace.polyline(240).map((uv) => toWorld(uv, Z.curve)), 0.009, RGB.curve));

    // control polygon
    const polygon = [];
    if (ui.polygons) {
      const P = trace.controlPolygon();
      for (let i = 1; i < P.length; i++) segment(polygon, toWorld(P[i - 1], Z.polygon), toWorld(P[i], Z.polygon), RGB.polygon);
    }
    upload(this.buffers.polygon, polygon);

    // de Casteljau construction at parameter t (Bézier family only)
    const cast = [];
    this.castPoints = [];
    if (ui.casteljau && trace.family === 'bezier') {
      const { levels, segment: seg, t } = trace.construction(ui.t);
      this.castInfo = { segment: seg, t };
      for (let level = 1; level < levels.length; level++) {
        const colour = RGB.cast[level - 1];
        const pts = levels[level].map((uv) => toWorld(uv, Z.construction));
        ribbon(cast, pts, 0.0045, colour);
        for (const p of pts) this.castPoints.push({ p, level, colour });
      }
    } else this.castInfo = null;
    upload(this.buffers.cast, cast);

    // local axes of every node of the scene graph
    const axes = [];
    if (ui.axes) {
      model.gallery.root.traverse((node) => {
        const f = nodeFrame(node.world);
        const tip = (v) => [f.origin[0] + v[0], f.origin[1] + v[1], f.origin[2] + v[2]];
        segment(axes, f.origin, tip(f.x), RGB.axisX);
        segment(axes, f.origin, tip(f.y), RGB.axisY);
        segment(axes, f.origin, tip(f.z), RGB.axisZ);
      });
    }
    upload(this.buffers.axes, axes);

    // frustum of the orbit camera
    const frustum = [];
    if (ui.frustum) {
      const cam = model.orbitCamera;
      const { near, far } = frustumCorners(cam, model.mainAspect);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        segment(frustum, near[i], near[j], RGB.near);
        segment(frustum, far[i], far[j], RGB.far);
        segment(frustum, near[i], far[i], RGB.edge);
        if (cam.projection === 'perspective') segment(frustum, cam.eye, near[i], RGB.ray);
      }
    }
    upload(this.buffers.frustum, frustum);

    // the object travelling along the curve, oriented by the curve tangent
    const s = trace.sample(model.travel);
    const angle = Math.atan2(-s.tangent[1], asp * s.tangent[0]); // (du, dv) → world (a·du, −dv)
    this.traveller = { position: toWorld(s.uv, Z.traveller), angle };
  }

  /**
   * @param {GPURenderPassEncoder} pass
   * @param {Float32Array} vp  P · V of the view being drawn
   * @param {{ frustum?: boolean }} [opts]  frustum: also draw the orbit camera's frustum and body
   */
  draw(pass, vp, { frustum = false } = {}) {
    const { meshes, lines, renderer, mesh, model, buffers } = this;
    const { gallery, ui, trace, paintingAspect: asp } = model;
    const drawMesh = (kind, world, colour) => meshes.draw(pass, mesh[kind], mul(vp, world), world, colour, renderer);

    // Parts A and B: the nodes of the scene graph
    gallery.root.traverse((node) => {
      if (node.data.mesh) drawMesh(node.data.mesh, node.world, node.data.colour);
    });

    // Part A: wireframe of the OTHER composition order
    if (ui.ghost) {
      const other = model.matrices[ui.a.order === 'TRS' ? 'SRT' : 'TRS'];
      lines.draw(pass, this.edges, mul(vp, other), renderer, { overlay: true });
    }

    // Part D
    lines.draw(pass, buffers.curve, vp, renderer, { topology: 'triangle-list' });
    lines.draw(pass, buffers.polygon, vp, renderer, { overlay: true });
    lines.draw(pass, buffers.cast, vp, renderer, { topology: 'triangle-list', overlay: true });
    for (const { p, level, colour } of this.castPoints) {
      drawMesh('sphere', mul(T(...p), S(level === 3 ? 0.05 : 0.032)), level === 3 ? RGB.traveller : colour);
    }
    if (ui.polygons) {
      for (const e of trace.entries()) {
        const colour = model.selected === e.index ? RGB.selected : e.role === 'knot' ? RGB.knot : RGB.handle;
        const size = e.role === 'knot' ? 0.058 : 0.045;
        drawMesh('sphere', mul(T(...uvToWorld(e.uv, asp, Z.point)), S(size)), colour);
      }
    }
    const { position, angle } = this.traveller;
    drawMesh('cube', mul(T(...position), mat4.rotateZ(angle), S(0.16, 0.055, 0.055)), RGB.traveller);
    drawMesh('sphere', mul(T(...position), mat4.rotateZ(angle), T(0.1, 0, 0), S(0.075)), RGB.knot);

    // debug drawings, always on top
    lines.draw(pass, buffers.axes, vp, renderer, { overlay: true });
    if (frustum) {
      lines.draw(pass, buffers.frustum, vp, renderer, { overlay: true });
      const cam = model.orbitCamera;
      const camToWorld = mat4.invertRigid(mat4.lookAt(cam.eye, cam.target, cam.up)); // rigid: rotation + translation
      drawMesh('cube', mul(camToWorld, S(0.2, 0.14, 0.26)), RGB.camera);
    }
  }

  /** Fill the current viewport with the inset's background colour. */
  drawBackdrop(pass) {
    this.lines.draw(pass, this.backdrop, this.identity, this.renderer, { topology: 'triangle-list', overlay: true });
  }
}
