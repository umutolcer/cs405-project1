import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGallery, updateGallery, composeBoth, nodeFrame, PART_A_DEFAULTS, ARM_SPEED, JOINT_SPEED,
} from '../src/scene/gallery.js';
import * as m from '../src/math/mat4.js';
import { close, closeArr, refMul, apply } from './helpers.js';

const chain = (...ms) => ms.reduce((a, b) => refMul(a, b));

describe('Part A · both composition orders', () => {
  test('T·R·S and S·R·T differ, and each matches the reference product', () => {
    const a = { ...PART_A_DEFAULTS };
    const { TRS, SRT } = composeBoth(a);
    const T = m.translate(a.tx, a.ty, a.tz), R = m.rotateZ(a.angle), S = m.scale(a.sx, a.sy, a.sz);
    closeArr(TRS, chain(T, R, S), 1e-6);
    closeArr(SRT, chain(S, R, T), 1e-6);
    assert.ok(Array.from(TRS).some((x, i) => Math.abs(x - SRT[i]) > 1e-3));
  });

  test('T·R·S keeps the translation in the last column; S·R·T rotates and scales it', () => {
    const a = { ...PART_A_DEFAULTS, angle: 0.8, axis: 'z' };
    const { TRS, SRT } = composeBoth(a);
    closeArr([TRS[12], TRS[13], TRS[14]], [a.tx, a.ty, a.tz], 1e-6);
    const c = Math.cos(a.angle), s = Math.sin(a.angle);
    const rx = c * a.tx - s * a.ty, ry = s * a.tx + c * a.ty;
    closeArr([SRT[12], SRT[13], SRT[14]], [a.sx * rx, a.sy * ry, a.sz * a.tz], 1e-6);
  });

  test('the rotation axis selects rotateX / rotateY / rotateZ', () => {
    const base = { ...PART_A_DEFAULTS, tx: 0, ty: 0, tz: 0, sx: 1, sy: 1, sz: 1, angle: 0.7 };
    closeArr(composeBoth({ ...base, axis: 'x' }).TRS, m.rotateX(0.7), 1e-6);
    closeArr(composeBoth({ ...base, axis: 'y' }).TRS, m.rotateY(0.7), 1e-6);
    closeArr(composeBoth({ ...base, axis: 'z' }).TRS, m.rotateZ(0.7), 1e-6);
  });
});

describe('Part B · gallery scene graph', () => {
  const g = createGallery();

  test('at least five nodes and three levels of hierarchy', () => {
    let count = 0, deepest = 0;
    g.root.traverse((n, d) => { count++; deepest = Math.max(deepest, d); });
    assert.ok(count >= 5, `nodes: ${count}`);
    assert.ok(deepest + 1 >= 3, `levels: ${deepest + 1}`);
    assert.equal(g.moon.depth, 4);
  });

  test('the Moon world matrix is the product of the local matrices along its path', () => {
    for (const t of [0, 1.7, 5.2]) {
      updateGallery(g, PART_A_DEFAULTS, t);
      const path = [];
      for (let n = g.moon; n; n = n.parent) path.unshift(n.local);
      closeArr(g.moon.world, chain(...path), 1e-5, `t = ${t}:`);
    }
  });

  test('hand calculation of the Moon position at t = 0 and at t = 2 s', () => {
    // Moving Group at (0.80, −0.22, 0.45); arm length 0.43; moon offset 0.20
    updateGallery(g, PART_A_DEFAULTS, 0);
    closeArr([g.moon.world[12], g.moon.world[13], g.moon.world[14]], [0.80 + 0.43 + 0.2, -0.22, 0.45], 1e-6);
    const t = 2.0;
    updateGallery(g, PART_A_DEFAULTS, t);
    const arm = ARM_SPEED * t, joint = arm + JOINT_SPEED * t; // the joint angle is added to the arm angle
    const expected = [
      0.80 + 0.43 * Math.cos(arm) + 0.2 * Math.cos(joint),
      -0.22 + 0.43 * Math.sin(arm) + 0.2 * Math.sin(joint),
      0.45,
    ];
    closeArr([g.moon.world[12], g.moon.world[13], g.moon.world[14]], expected, 1e-5);
  });

  test('moving a parent moves the whole subtree', () => {
    updateGallery(g, PART_A_DEFAULTS, 1);
    const before = apply(g.moon.world, [0, 0, 0, 1]);
    const group = g.root.find('Moving Group');
    const saved = group.local;
    group.local = m.multiply(m.translate(0.1, 0, 0), saved);
    g.root.updateWorld();
    const after = apply(g.moon.world, [0, 0, 0, 1]);
    close(after[0] - before[0], 0.1, 1e-6);
    close(after[1] - before[1], 0, 1e-6);
    group.local = saved;
  });

  test('nodeFrame removes the scale, so the debug axes keep their length', () => {
    const w = m.multiply(m.translate(1, 2, 3), m.multiply(m.rotateZ(0.5), m.scale(0.1, 0.4, 0.2)));
    const f = nodeFrame(w, 0.22);
    closeArr(f.origin, [1, 2, 3]);
    for (const axis of [f.x, f.y, f.z]) close(Math.hypot(...axis), 0.22, 1e-6);
  });
});
