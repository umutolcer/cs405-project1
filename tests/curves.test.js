import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/math/curves.js';
import { close, closeArr } from './helpers.js';

const P2 = [[0, 0], [1, 2], [3, 3], [4, 0]];
const P3 = [[0, 0, 0], [1, 2, -1], [3, 3, 2], [4, 0, 1]];
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

describe('Part D · Bézier', () => {
  test('Bernstein basis: values at the ends, partition of unity', () => {
    closeArr(c.bernstein3(0), [1, 0, 0, 0]);
    closeArr(c.bernstein3(1), [0, 0, 0, 1]);
    closeArr(c.bernstein3(0.5), [0.125, 0.375, 0.375, 0.125]);
    for (const t of [0.1, 0.33, 0.77]) {
      const b = c.bernstein3(t);
      close(b.reduce((s, x) => s + x, 0), 1);
      assert.ok(b.every((x) => x >= 0), 'basis values are non-negative');
    }
  });

  test('cubicBezier: endpoints interpolated, midpoint = (P0 + 3P1 + 3P2 + P3) / 8', () => {
    closeArr(c.cubicBezier(...P2, 0), P2[0]);
    closeArr(c.cubicBezier(...P2, 1), P2[3]);
    closeArr(c.cubicBezier(...P2, 0.5), [(0 + 3 + 9 + 4) / 8, (0 + 6 + 9 + 0) / 8]);
  });

  test('cubicBezier works in 3D', () => {
    closeArr(c.cubicBezier(...P3, 0.5), [2, 15 / 8, 0.5]);
  });

  test('cubicBezier does not modify the control points', () => {
    const pts = P2.map((p) => [...p]);
    c.cubicBezier(...pts, 0.3);
    assert.deepEqual(pts, P2);
  });

  test('tangent: 3(P1 − P0) at t = 0 and 3(P3 − P2) at t = 1', () => {
    closeArr(c.cubicBezierTangent(...P2, 0), [3, 6]);
    closeArr(c.cubicBezierTangent(...P2, 1), [3, -9]);
  });

  test('tangent matches a finite difference', () => {
    const t = 0.37, h = 1e-4;
    const a = c.cubicBezier(...P3, t - h), b = c.cubicBezier(...P3, t + h);
    closeArr(c.cubicBezierTangent(...P3, t), a.map((x, i) => (b[i] - x) / (2 * h)), 1e-3);
  });

  test('de Casteljau: level sizes 4, 3, 2, 1 and last point on the curve', () => {
    const t = 0.3, L = c.deCasteljau(P2, t);
    assert.deepEqual(L.map((l) => l.length), [4, 3, 2, 1]);
    L[0].forEach((p, i) => closeArr(p, P2[i]));
    closeArr(L[1][0], lerp(P2[0], P2[1], t));
    closeArr(L[1][2], lerp(P2[2], P2[3], t));
    closeArr(L[3][0], c.cubicBezier(...P2, t));
  });

  test('de Casteljau works for any degree (quadratic: 3 points)', () => {
    const Q = [[0, 0], [1, 1], [2, 0]];
    const L = c.deCasteljau(Q, 0.5);
    assert.deepEqual(L.map((l) => l.length), [3, 2, 1]);
    closeArr(L[2][0], [1, 0.5]);
  });
});

describe('Part D · piecewise C¹', () => {
  test('c1NextControl mirrors P2 through the joint', () => {
    closeArr(c.c1NextControl([3, 3], [4, 0]), [5, -3]);
    closeArr(c.c1NextControl([1, 2, 3], [2, 2, 2]), [3, 2, 1]);
  });

  // three segments built with c1NextControl
  const seg = () => {
    const s0 = [[0, 0], [1, 2], [3, 3], [4, 0]];
    const s1 = [[4, 0], c.c1NextControl(s0[2], s0[3]), [7, -1], [8, 1]];
    const s2 = [[8, 1], c.c1NextControl(s1[2], s1[3]), [10, 4], [12, 2]];
    return [s0, s1, s2];
  };

  test('evalPiecewise: ends and joints', () => {
    const S = seg();
    closeArr(c.evalPiecewise(S, 0), [0, 0]);
    closeArr(c.evalPiecewise(S, 1), [12, 2]);
    closeArr(c.evalPiecewise(S, 1 / 3), [4, 0], 1e-5, 'first joint:');
    closeArr(c.evalPiecewise(S, 2 / 3), [8, 1], 1e-5, 'second joint:');
    closeArr(c.evalPiecewise(S, 0.5), c.cubicBezier(...S[1], 0.5), 1e-5, 'middle of segment 1:');
  });

  test('tangents agree on both sides of each joint (C¹)', () => {
    const S = seg();
    for (let i = 0; i < S.length - 1; i++) {
      closeArr(c.cubicBezierTangent(...S[i], 1), c.cubicBezierTangent(...S[i + 1], 0), 1e-5, `joint ${i}:`);
    }
  });
});

describe('Part D · second curve family', () => {
  const Q = [[0, 0], [1, 2], [3, 3], [4, 0]];

  test('Catmull–Rom passes through p1 and p2 with tangent (p2 − p0)/2', () => {
    closeArr(c.catmullRom(...Q, 0), Q[1]);
    closeArr(c.catmullRom(...Q, 1), Q[2]);
    const h = 1e-4, a = c.catmullRom(...Q, 0), b = c.catmullRom(...Q, h);
    closeArr(a.map((x, i) => (b[i] - x) / h), [(3 - 0) / 2, (3 - 0) / 2], 1e-3, 'tangent at p1:');
    closeArr(c.catmullRom([0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3], 0.5), [1.5, 1.5, 1.5], 1e-5, '3D, collinear:');
  });

  test('Catmull–Rom tangent: analytic, matches finite differences, (p2 − p0)/2 at t = 0', () => {
    closeArr(c.catmullRomTangent(...Q, 0), [(3 - 0) / 2, (3 - 0) / 2]);
    closeArr(c.catmullRomTangent(...Q, 1), [(4 - 1) / 2, (0 - 2) / 2]);
    const h = 1e-5, t = 0.37;
    const a = c.catmullRom(...Q, t - h), b = c.catmullRom(...Q, t + h);
    closeArr(c.catmullRomTangent(...Q, t), a.map((x, i) => (b[i] - x) / (2 * h)), 1e-4);
  });

  test('B-spline basis: partition of unity, non-negative, known values', () => {
    closeArr(c.bsplineBasis(0), [1 / 6, 4 / 6, 1 / 6, 0]);
    closeArr(c.bsplineBasis(1), [0, 1 / 6, 4 / 6, 1 / 6]);
    for (const t of [0.2, 0.5, 0.9]) {
      const b = c.bsplineBasis(t);
      close(b.reduce((s, x) => s + x, 0), 1);
      assert.ok(b.every((x) => x >= 0));
    }
    closeArr(c.bspline(...Q, 0), [(0 + 4 + 3) / 6, (0 + 8 + 3) / 6]);
  });

  test('B-spline: C² joints and tangent from the basis derivative', () => {
    // basis derivatives sum to zero, and the end of one span meets the start of the next
    for (const t of [0, 0.3, 1]) close(c.bsplineBasisDerivative(t).reduce((s, x) => s + x, 0), 0);
    closeArr(c.bsplineBasisDerivative(1), [0, -0.5, 0, 0.5], 1e-9);
    const h = 1e-5, t = 0.61;
    const a = c.bspline(...Q, t - h), b = c.bspline(...Q, t + h);
    closeArr(c.bsplineTangent(...Q, t), a.map((x, i) => (b[i] - x) / (2 * h)), 1e-4);
  });

  test('locate maps u to segment index and local parameter', () => {
    assert.deepEqual(c.locate(3, 0), { i: 0, t: 0 });
    const { i, t } = c.locate(3, 0.5);
    assert.equal(i, 1);
    close(t, 0.5);
    assert.deepEqual(c.locate(3, 1), { i: 2, t: 1 }); // the end belongs to the last segment
    assert.deepEqual(c.locate(3, 7), { i: 2, t: 1 });  // clamped
  });
});
