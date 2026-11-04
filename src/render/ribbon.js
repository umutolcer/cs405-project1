/**
 * Thick curves. WebGPU lines are always one pixel wide, so curves drawn over
 * the painting are expanded into flat quads (two triangles per segment) that
 * lie in the painting's plane, `halfWidth` world units either side of the path.
 *
 * Output vertices are [x, y, z, r, g, b], for topology 'triangle-list'.
 */
export function ribbon(out, points, halfWidth, colour) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const nx = (-dy / len) * halfWidth, ny = (dx / len) * halfWidth; // left normal in the xy plane
    const a1 = [a[0] + nx, a[1] + ny, a[2]], a2 = [a[0] - nx, a[1] - ny, a[2]];
    const b1 = [b[0] + nx, b[1] + ny, b[2]], b2 = [b[0] - nx, b[1] - ny, b[2]];
    for (const p of [a1, a2, b1, b1, a2, b2]) out.push(...p, ...colour);
  }
  return out;
}

/** Line-list vertices for one segment. */
export function segment(out, a, b, colour) {
  out.push(...a, ...colour, ...b, ...colour);
  return out;
}
