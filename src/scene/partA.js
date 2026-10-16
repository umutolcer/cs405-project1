/**
 * Part A — the object controlled from the UI, and the switch between
 * M = T·R·S and M = S·R·T. Both matrices are shown in the panel.
 *
 * Column vectors (p' = M·p): the RIGHTMOST factor acts first.
 *   T·R·S : scale the object about its own origin, rotate it, then move it.
 *           This is the order used everywhere else in the project.
 *   S·R·T : move first, then rotate and scale ABOUT THE WORLD ORIGIN — the
 *           translation itself gets rotated and scaled, and a non-uniform S
 *           after R shears the cube (watch the edges stop being right angles).
 */
import * as mat4 from '../math/mat4.js';

export const PART_A_DEFAULTS = Object.freeze({
  tx: 0.45, ty: -0.42, tz: 0.40,
  angle: 0.6, axis: 'z',
  sx: 0.32, sy: 0.16, sz: 0.24,
  order: 'TRS',
  ghost: true,
});

/** T, R, S from the slider values, and both products. Uses YOUR mat4. */
export function composeBoth(s) {
  const T = mat4.translate(s.tx, s.ty, s.tz);
  const R = s.axis === 'x' ? mat4.rotateX(s.angle) : s.axis === 'y' ? mat4.rotateY(s.angle) : mat4.rotateZ(s.angle);
  const S = mat4.scale(s.sx, s.sy, s.sz);
  return {
    TRS: mat4.multiply(T, mat4.multiply(R, S)), // S first, then R, then T
    SRT: mat4.multiply(S, mat4.multiply(R, T)), // T first, then R, then S
  };
}

/**
 * Panel folder for Part A, bound to the state object `s` (same keys as
 * PART_A_DEFAULTS).
 */
export function createPartAPanel(panel, s) {
  const f = panel.folder('Part A · Transformations');
  const sliders = [
    f.slider('tx', s, 'tx', -1.6, 1.6, 0.01),
    f.slider('ty', s, 'ty', -1, 1, 0.01),
    f.slider('tz', s, 'tz', 0, 1.5, 0.01),
    f.slider('angle', s, 'angle', -Math.PI, Math.PI, 0.01),
    f.slider('sx', s, 'sx', 0.05, 1, 0.01),
    f.slider('sy', s, 'sy', 0.05, 1, 0.01),
    f.slider('sz', s, 'sz', 0.05, 1, 0.01),
  ];
  const axis = f.select('rotate about', ['x', 'y', 'z'], s.axis, (v) => (s.axis = v));
  const order = f.select('order', [
    { value: 'TRS', label: 'M = T·R·S' },
    { value: 'SRT', label: 'M = S·R·T' },
  ], s.order, (v) => (s.order = v));
  const ghost = f.toggle('show the other order (wireframe)', s, 'ghost');
  f.note('angle in radians. Solid cube = order in use; wireframe = the other order.');

  const trsLabel = f.note('');
  const trsText = f.text('');
  const srtLabel = f.note('');
  const srtText = f.text('');
  const setLabel = (el, text) => { if (el.textContent !== text) el.textContent = text; };

  return {
    /** Show both matrices; mark the one in use. */
    show(TRS, SRT) {
      setLabel(trsLabel, `M = T·R·S${s.order === 'TRS' ? '   ← in use' : ''}`);
      setLabel(srtLabel, `M = S·R·T${s.order === 'SRT' ? '   ← in use' : ''}`);
      trsText.set(mat4.format(TRS, 3));
      srtText.set(mat4.format(SRT, 3));
    },
    /** Push the state back into the widgets (after a reset). */
    refresh() {
      for (const sl of sliders) sl.update();
      axis.set(s.axis);
      order.set(s.order);
      ghost.update();
    },
  };
}
