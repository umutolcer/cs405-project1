export function bernstein3(t) {
  const s = 1 - t;
  return [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
}

function weighted(points, weights) {
  return points[0].map((_, i) => points.reduce((sum, p, j) => sum + p[i] * weights[j], 0));
}

export function cubicBezier(p0, p1, p2, p3, t) {
  return weighted([p0, p1, p2, p3], bernstein3(t));
}

export function cubicBezierTangent(p0, p1, p2, p3, t) {
  const s = 1 - t;
  return p0.map((_, i) => 3 * (
    s * s * (p1[i] - p0[i]) +
    2 * s * t * (p2[i] - p1[i]) +
    t * t * (p3[i] - p2[i])));
}

export function deCasteljau(points, t) {
  if (!points.length) return [];
  const levels = [points.map((p) => [...p])];
  while (levels.at(-1).length > 1) {
    const prev = levels.at(-1);
    levels.push(prev.slice(1).map((p, i) => p.map((v, k) => prev[i][k] * (1 - t) + v * t)));
  }
  return levels;
}

export function c1NextControl(p2, p3) {
  return p3.map((v, i) => 2 * v - p2[i]);
}

export function evalPiecewise(segments, u) {
  if (!segments.length) throw new Error('At least one segment is required');
  const x = Math.max(0, Math.min(1, u)) * segments.length;
  const i = Math.min(segments.length - 1, Math.floor(x));
  return cubicBezier(...segments[i], Math.min(1, x - i));
}

export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return p0.map((_, i) => 0.5 * (
    2 * p1[i] + (-p0[i] + p2[i]) * t +
    (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
    (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}

export function bsplineBasis(t) {
  const s = 1 - t, t2 = t * t, t3 = t2 * t;
  return [s * s * s / 6, (3 * t3 - 6 * t2 + 4) / 6,
    (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
}

export function bspline(p0, p1, p2, p3, t) {
  return weighted([p0, p1, p2, p3], bsplineBasis(t));
}
