/**
 * More vertex data, in the same formats as geometry.js:
 *   meshes: [x, y, z, nx, ny, nz] per vertex, 'triangle-list'
 *   lines:  [x, y, z, r, g, b]    per vertex, 'line-list'
 * Sizes match geometry.cube(): everything fits in the unit cube centred at
 * the origin, so a scale matrix gives the size you want.
 */

/** UV sphere of diameter 1 (radius 0.5) centred at the origin, smooth normals. */
export function sphere(slices = 24, stacks = 16) {
  // unit direction for longitude i / slices and latitude j / stacks (j = 0 → +y)
  const dir = (i, j) => {
    const theta = (j / stacks) * Math.PI;
    const phi = (i / slices) * 2 * Math.PI;
    return [Math.sin(theta) * Math.cos(phi), Math.cos(theta), -Math.sin(theta) * Math.sin(phi)];
  };
  const out = [];
  const put = (n) => out.push(0.5 * n[0], 0.5 * n[1], 0.5 * n[2], n[0], n[1], n[2]);
  for (let j = 0; j < stacks; j++) {
    for (let i = 0; i < slices; i++) {
      const a = dir(i, j), b = dir(i + 1, j), c = dir(i + 1, j + 1), d = dir(i, j + 1);
      put(a); put(d); put(c);
      put(a); put(c); put(b);
    }
  }
  return new Float32Array(out);
}

/** The 12 edges of the unit cube (side 1, centred), in one colour (linear RGB). */
export function cubeEdges(colour = [1, 1, 1]) {
  const h = 0.5;
  const corners = [];
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) corners.push([x, y, z]);
  const out = [];
  // two corners share an edge when they differ in exactly one coordinate
  for (let a = 0; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) {
      const diff = [0, 1, 2].filter((k) => corners[a][k] !== corners[b][k]).length;
      if (diff === 1) out.push(...corners[a], ...colour, ...corners[b], ...colour);
    }
  }
  return new Float32Array(out); // 24 vertices
}
