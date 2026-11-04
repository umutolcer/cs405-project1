/**
 * Curves (Part D). Every function works on points of any dimension
 * (arrays of numbers), so the same code serves 2D painting coordinates
 * and 3D positions.
 */

/** Cubic Bernstein basis [B0, B1, B2, B3](t). */
export function bernstein3(t) {
  const s = 1 - t;
  return [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
}

function weighted(points, weights) {
  return points[0].map((_, i) => points.reduce((sum, p, j) => sum + p[i] * weights[j], 0));
}

/** B(t) = Σ Bᵢ(t) Pᵢ. */
export function cubicBezier(p0, p1, p2, p3, t) {
  return weighted([p0, p1, p2, p3], bernstein3(t));
}

/** B'(t) = 3[(1−t)²(P1−P0) + 2(1−t)t(P2−P1) + t²(P3−P2)]. */
export function cubicBezierTangent(p0, p1, p2, p3, t) {
  const s = 1 - t;
  return p0.map((_, i) => 3 * (
    s * s * (p1[i] - p0[i]) +
    2 * s * t * (p2[i] - p1[i]) +
    t * t * (p3[i] - p2[i])));
}

/**
 * de Casteljau construction. Returns every level of repeated linear
 * interpolation: levels[0] = the control points, levels.at(-1)[0] = B(t).
 */
export function deCasteljau(points, t) {
  if (!points.length) return [];
  const levels = [points.map((p) => [...p])];
  while (levels.at(-1).length > 1) {
    const prev = levels.at(-1);
    levels.push(prev.slice(1).map((p, i) => p.map((v, k) => prev[i][k] * (1 - t) + v * t)));
  }
  return levels;
}

/**
 * C¹ condition at a joint Q between two cubic segments of equal duration:
 * 3(Q − P2) = 3(P1' − Q)  ⇒  P1' = 2Q − P2. Arguments: (P2, Q).
 */
export function c1NextControl(p2, p3) {
  return p3.map((v, i) => 2 * v - p2[i]);
}

/** Map u ∈ [0, 1] onto segment index i and local parameter t ∈ [0, 1]. */
export function locate(segmentCount, u) {
  const x = Math.max(0, Math.min(1, u)) * segmentCount;
  const i = Math.min(segmentCount - 1, Math.floor(x));
  return { i, t: x - i };
}

/** Piecewise cubic Bézier: segments = [[P0, P1, P2, P3], ...], u ∈ [0, 1]. */
export function evalPiecewise(segments, u) {
  if (!segments.length) throw new Error('At least one segment is required');
  const { i, t } = locate(segments.length, u);
  return cubicBezier(...segments[i], t);
}

/** Catmull–Rom segment from p1 to p2 (p0 and p3 are the neighbours). */
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return p0.map((_, i) => 0.5 * (
    2 * p1[i] + (-p0[i] + p2[i]) * t +
    (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
    (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}

/** d/dt of catmullRom: equals (p2 − p0)/2 at t = 0 and (p3 − p1)/2 at t = 1. */
export function catmullRomTangent(p0, p1, p2, p3, t) {
  const t2 = t * t;
  return p0.map((_, i) => 0.5 * (
    (-p0[i] + p2[i]) +
    2 * (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t +
    3 * (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t2));
}

/** Uniform cubic B-spline basis functions on one knot span. */
export function bsplineBasis(t) {
  const s = 1 - t, t2 = t * t, t3 = t2 * t;
  return [s * s * s / 6, (3 * t3 - 6 * t2 + 4) / 6,
    (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
}

/** Derivatives of the four B-spline basis functions. */
export function bsplineBasisDerivative(t) {
  const s = 1 - t;
  return [-s * s / 2, (9 * t * t - 12 * t) / 6, (-9 * t * t + 6 * t + 3) / 6, t * t / 2];
}

export function bspline(p0, p1, p2, p3, t) {
  return weighted([p0, p1, p2, p3], bsplineBasis(t));
}

export function bsplineTangent(p0, p1, p2, p3, t) {
  return weighted([p0, p1, p2, p3], bsplineBasisDerivative(t));
}
