import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Trace, bsplineControlsThrough, stringifyCurve } from '../src/scene/trace.js';
import * as c from '../src/math/curves.js';
import { close, closeArr } from './helpers.js';

const tangentAt = (trace, seg, t) => c.cubicBezierTangent(...trace.bezierSegment(seg), t);

describe('Part D · traced curve', () => {
  test('starts with a C¹ piecewise Bézier of three segments', () => {
    const tr = new Trace();
    assert.equal(tr.family, 'bezier');
    assert.equal(tr.segmentCount, 3);
    assert.equal(tr.segments.length, 3);
  });

  test('curve starts at P0 and ends at P3 of the whole chain', () => {
    const tr = new Trace();
    closeArr(tr.sample(0).uv, tr.points[0]);
    closeArr(tr.sample(1).uv, tr.points.at(-1));
  });

  test('C¹ holds at every joint of the initial curve', () => {
    const tr = new Trace();
    for (const seg of [0, 1]) closeArr(tangentAt(tr, seg, 1), tangentAt(tr, seg + 1, 0), 1e-9);
  });

  test('dragging a handle keeps C¹: the handle on the other side mirrors it', () => {
    const tr = new Trace();
    tr.move(2, [0.45, 0.2]); // P2 of segment 0, next to the knot at index 3
    closeArr(tr.points[2], [0.45, 0.2]);
    for (const seg of [0, 1]) closeArr(tangentAt(tr, seg, 1), tangentAt(tr, seg + 1, 0), 1e-9);
    tr.move(4, [0.7, 0.3]); // P1 of segment 1
    for (const seg of [0, 1]) closeArr(tangentAt(tr, seg, 1), tangentAt(tr, seg + 1, 0), 1e-9);
  });

  test('dragging a knot carries both of its handles and keeps C¹', () => {
    const tr = new Trace();
    const before = tr.points.map((p) => [...p]);
    tr.move(3, [before[3][0] + 0.05, before[3][1] - 0.04]);
    closeArr(tr.points[2], [before[2][0] + 0.05, before[2][1] - 0.04], 1e-12);
    closeArr(tr.points[4], [before[4][0] + 0.05, before[4][1] - 0.04], 1e-12);
    closeArr(tr.points[6], before[6]); // the next knot did not move
    closeArr(tangentAt(tr, 0, 1), tangentAt(tr, 1, 0), 1e-9);
  });

  test('a dragged point stays inside the painting', () => {
    const tr = new Trace();
    tr.move(3, [4, -3]);
    assert.ok(tr.points[3].every((x) => x >= 0 && x <= 1));
  });

  test('de Casteljau uses the segment that contains the parameter', () => {
    const tr = new Trace();
    const { segment, t, levels } = tr.construction(0.5);
    assert.equal(segment, 1);
    close(t, 0.5);
    assert.equal(levels.length, 4);
    closeArr(levels.at(-1)[0], tr.sample(0.5).uv, 1e-12);
  });

  test('Catmull–Rom passes through every control point, the ends included', () => {
    const tr = new Trace();
    tr.family = 'catmull';
    const n = tr.points.length;
    assert.equal(tr.segmentCount, n - 1);
    for (let k = 0; k < n; k++) closeArr(tr.sample(k / (n - 1)).uv, tr.points[k], 1e-9, `point ${k}:`);
  });

  test('B-spline has n − 3 segments and no kink across the joints', () => {
    const tr = new Trace();
    tr.family = 'bspline';
    assert.equal(tr.segmentCount, tr.points.length - 3);
    const m = tr.segmentCount;
    for (let j = 1; j < m; j++) {
      const u = j / m, h = 1e-7;
      closeArr(tr.sample(u - h).tangent, tr.sample(u + h).tangent, 1e-4, `joint ${j}:`);
    }
  });

  test('the starting B-spline passes through the traced outline', () => {
    const targets = [[0.1, 0.2], [0.3, 0.1], [0.5, 0.15], [0.7, 0.3], [0.8, 0.5]];
    const C = bsplineControlsThrough(targets);
    assert.equal(C.length, targets.length + 2);
    // the curve value at the start of span i is (C[i] + 4 C[i+1] + C[i+2]) / 6
    for (let i = 0; i < targets.length; i++) {
      const p = [0, 1].map((k) => (C[i][k] + 4 * C[i + 1][k] + C[i + 2][k]) / 6);
      closeArr(p, targets[i], 1e-6, `knot ${i}:`);
    }
  });

  test('the tangent returned by sample() matches the curve (finite difference)', () => {
    for (const family of ['bezier', 'catmull', 'bspline']) {
      const tr = new Trace();
      tr.family = family;
      const u = 0.37, h = 1e-6, n = tr.segmentCount;
      const a = tr.sample(u - h).uv, b = tr.sample(u + h).uv;
      const fd = a.map((x, i) => ((b[i] - x) / (2 * h)) / n); // d/du → d/dt of one segment
      closeArr(tr.sample(u).tangent, fd, 1e-3, `${family}:`);
    }
  });

  test('JSON export: normalised coordinates, three segments of four points', () => {
    const json = new Trace().toJSON();
    assert.equal(json.kind, 'bezier-c1');
    assert.equal(json.segments.length, 3);
    for (const seg of json.segments) {
      assert.equal(seg.length, 4);
      for (const [u, v] of seg) assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1);
    }
    // consecutive segments share their joint
    closeArr(json.segments[0][3], json.segments[1][0]);
    closeArr(json.segments[1][3], json.segments[2][0]);
    const tr = new Trace();
    tr.family = 'catmull';
    assert.equal(tr.toJSON().points.length, tr.points.length);
  });

  test('reset restores the initial curve', () => {
    const tr = new Trace();
    const first = JSON.stringify(tr.toJSON());
    tr.move(3, [0.1, 0.1]);
    tr.family = 'bspline';
    tr.reset();
    assert.equal(JSON.stringify(tr.toJSON()), first);
  });

  test('the exported file is valid JSON with one (u, v) pair per line', () => {
    const json = new Trace().toJSON();
    const text = stringifyCurve(json);
    assert.deepEqual(JSON.parse(text), json);
    assert.ok(/^\s+\[0\.3008, 0\.2408\],?$/m.test(text));
  });
});
