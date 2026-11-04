/**
 * The traced curve (Part D): control data, evaluation, editing and export.
 * No graphics or DOM here, so everything can be unit-tested.
 *
 * All points are in painting coordinates (u, v) ∈ [0, 1]², v pointing down.
 *
 * Three curve families share one editor:
 *   bezier   piecewise cubic Bézier, stored as one flat list
 *            [K0, H, H, K1, H, H, K2, …]: knots at indices 0, 3, 6, … and two
 *            handles between knots. C¹ at every interior knot is enforced
 *            while editing: the handle on one side is the mirror of the other.
 *   catmull  Catmull–Rom spline passing through every control point
 *   bspline  uniform cubic B-spline (approximating: the curve is pulled
 *            towards, but does not touch, its control points)
 */
import * as curves from '../math/curves.js';
import { PAINTING } from '../config.js';

export const FAMILIES = ['bezier', 'catmull', 'bspline'];
export const KIND = { bezier: 'bezier-c1', catmull: 'catmull-rom', bspline: 'bspline' };

const [W, H] = PAINTING.size;
/** Pixel position in the 1280 × 893 image → (u, v). */
const px = (x, y) => [x / W, y / H];

/** Points read off the melon's upper outline, left to right. */
const OUTLINE = [
  px(385, 215), px(455, 148), px(570, 108), px(690, 97),
  px(850, 122), px(1000, 185), px(1095, 275), px(1132, 400),
].map(([u, v]) => [u, v]);

const INITIAL_BEZIER = [
  px(385, 215), px(440, 150), px(570, 98),
  px(690, 97), px(810, 96), px(1060, 225),
  px(1105, 280), px(1150, 335), px(1148, 400),
  px(1128, 455),
];

/**
 * Uniform cubic B-spline control points whose curve passes through `targets`
 * (used only to choose a sensible starting shape). The curve value at a knot
 * is (C[i−1] + 4 C[i] + C[i+1]) / 6; solve that for C by Gauss–Seidel, with
 * the end control points chosen to give zero curvature at both ends.
 */
export function bsplineControlsThrough(targets) {
  const m = targets.length;
  const C = [null, ...targets.map((p) => [...p]), null]; // C[1..m]
  for (let sweep = 0; sweep < 200; sweep++) {
    for (let i = 2; i < m; i++) {
      C[i] = C[i].map((_, k) => (6 * targets[i - 1][k] - C[i - 1][k] - C[i + 1][k]) / 4);
    }
  }
  C[0] = C[1].map((v, k) => 2 * v - C[2][k]);
  C[m + 1] = C[m].map((v, k) => 2 * v - C[m - 1][k]);
  return C;
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round4 = (x) => Math.round(x * 1e4) / 1e4;

export class Trace {
  constructor() {
    this.reset();
  }

  reset() {
    this.data = {
      bezier: clone(INITIAL_BEZIER),
      catmull: clone(OUTLINE),
      bspline: bsplineControlsThrough(OUTLINE),
    };
    this.family = 'bezier';
  }

  get points() { return this.data[this.family]; }

  /** Number of curve segments of the active family. */
  get segmentCount() {
    const n = this.points.length;
    if (this.family === 'bezier') return (n - 1) / 3;
    if (this.family === 'catmull') return n - 1;
    return n - 3;
  }

  /** The four control points of Bézier segment i. */
  bezierSegment(i) { return this.data.bezier.slice(3 * i, 3 * i + 4); }

  /** All Bézier segments, [[P0,P1,P2,P3], …]. */
  get segments() {
    return Array.from({ length: (this.data.bezier.length - 1) / 3 }, (_, i) => this.bezierSegment(i));
  }

  /** Four consecutive control points that define segment i of the active family. */
  #window(i) {
    const P = this.points;
    if (this.family === 'catmull') {
      // phantom end points by reflection, so the curve reaches the first and last point
      const n = P.length;
      const head = P[0].map((v, k) => 2 * v - P[1][k]);
      const tail = P[n - 1].map((v, k) => 2 * v - P[n - 2][k]);
      const Q = [head, ...P, tail];
      return Q.slice(i, i + 4);
    }
    return P.slice(i, i + 4);
  }

  /** Point and derivative (both in (u, v)) at u ∈ [0, 1] along the whole curve. */
  sample(u) {
    const { i, t } = curves.locate(this.segmentCount, u);
    if (this.family === 'bezier') {
      const s = this.bezierSegment(i);
      return { uv: curves.cubicBezier(...s, t), tangent: curves.cubicBezierTangent(...s, t), segment: i, t };
    }
    const w = this.#window(i);
    if (this.family === 'catmull') {
      return { uv: curves.catmullRom(...w, t), tangent: curves.catmullRomTangent(...w, t), segment: i, t };
    }
    return { uv: curves.bspline(...w, t), tangent: curves.bsplineTangent(...w, t), segment: i, t };
  }

  /** The curve as a polyline of n + 1 points. */
  polyline(n = 240) {
    return Array.from({ length: n + 1 }, (_, k) => this.sample(k / n).uv);
  }

  /** Draggable control points: { index, uv, role } with role 'knot' | 'handle' | 'point'. */
  entries() {
    return this.points.map((uv, index) => ({
      index,
      uv,
      role: this.family === 'bezier' ? (index % 3 === 0 ? 'knot' : 'handle') : 'point',
    }));
  }

  /** de Casteljau levels for the Bézier segment containing global parameter u. */
  construction(u) {
    const { i, t } = curves.locate((this.data.bezier.length - 1) / 3, u);
    return { segment: i, t, levels: curves.deCasteljau(this.bezierSegment(i), t) };
  }

  /**
   * Move control point `index` to `uv`. For Bézier curves the C¹ condition
   * P1' = 2Q − P2 is kept at every interior knot:
   *   - dragging a knot carries both of its handles along;
   *   - dragging a handle moves the handle on the other side of the knot to
   *     the mirror position.
   */
  move(index, uv) {
    const P = this.points;
    const p = [clamp01(uv[0]), clamp01(uv[1])];
    if (this.family !== 'bezier') { P[index] = p; return; }
    if (index % 3 === 0) {
      const delta = [p[0] - P[index][0], p[1] - P[index][1]];
      P[index] = p;
      for (const k of [index - 1, index + 1]) {
        if (k >= 0 && k < P.length) P[k] = [P[k][0] + delta[0], P[k][1] + delta[1]];
      }
      return;
    }
    P[index] = p;
    if (index % 3 === 1 && index > 1) P[index - 2] = curves.c1NextControl(p, P[index - 1]);
    else if (index % 3 === 2 && index + 2 < P.length) P[index + 2] = curves.c1NextControl(p, P[index + 1]);
  }

  /** Polyline through the control points, for the control polygon drawing. */
  controlPolygon() { return this.points; }

  /**
   * JSON export: control points in normalised painting coordinates
   * (u right, v down, both in [0, 1]).
   */
  toJSON(paintingId = PAINTING.id) {
    const norm = (p) => [round4(p[0]), round4(p[1])];
    const out = {
      painting: paintingId,
      kind: KIND[this.family],
      coordinates: 'normalised (u right, v down, origin at the top-left of the image)',
    };
    if (this.family === 'bezier') out.segments = this.segments.map((s) => s.map(norm));
    else out.points = this.points.map(norm);
    return out;
  }
}

/** Pretty JSON with every (u, v) pair on one line. */
export function stringifyCurve(obj) {
  return JSON.stringify(obj, null, 2).replace(/\[\s+(-?[\d.e-]+),\s+(-?[\d.e-]+)\s+\]/g, '[$1, $2]') + '\n';
}

export function downloadJSON(obj, filename = 'curve.json') {
  const blob = new Blob([stringifyCurve(obj)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
