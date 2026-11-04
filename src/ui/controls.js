/**
 * The control panel: one folder per part of the project, plus the view and
 * debug controls of Part E. Everything is bound to the shared state object,
 * so reset() can copy the defaults back and call refresh().
 */
import * as mat4 from '../math/mat4.js';
import { FAMILIES, downloadJSON } from '../scene/trace.js';
import { composeBoth, ARM_SPEED, JOINT_SPEED } from '../scene/gallery.js';
import { depthStep } from '../scene/camera.js';

const f2 = (x) => x.toFixed(2);
const vec = (v) => v.map(f2).join(', ');
const deg = (rad) => (rad * 180) / Math.PI;

/**
 * @param {object} panel   from createPanel()
 * @param {object} ctx     { state, camera, gallery, trace, orbit, actions }
 * @returns {{ refresh(): void, update(): void }}
 *   refresh(): copy state back into the widgets; update(): refresh the readouts
 */
export function createControls(panel, ctx) {
  const { state, camera, gallery, trace, actions } = ctx;
  const widgets = [];
  const keep = (w) => { widgets.push(w); return w; };

  /* ----------------------------------------------------------- Part E · view */
  const ve = panel.folder('Part E · View and debug');
  keep(ve.select('view', [
    { value: 'orbit', label: 'Orbit camera' },
    { value: 'inspection', label: 'Fixed inspection camera' },
  ], state, 'view', () => actions.viewChanged()));
  keep(ve.toggle('inspection inset (in orbit view)', state, 'inset'));
  ve.button('Front view of the painting', () => actions.frontView());
  ve.button('Reset scene and camera (R)', () => actions.reset());
  keep(ve.toggle('pause animation (Space)', state, 'paused'));
  keep(ve.slider('animation speed', state, 'speed', 0, 3, 0.05));
  ve.note('Debug drawings');
  keep(ve.toggle('node axes (Part B)', state, 'axes'));
  keep(ve.toggle('camera frustum (Part C)', state, 'frustum'));
  keep(ve.toggle('control polygon and points (Part D)', state, 'polygons'));
  keep(ve.toggle('de Casteljau construction (Part D)', state, 'casteljau'));
  keep(ve.toggle('wireframe of the other order (Part A)', state, 'ghost'));
  ve.note('Keys: R reset · Space pause · V switch view · A node axes.');

  /* ------------------------------------------------------ Part A · transforms */
  const a = state.a;
  const pa = panel.folder('Part A · Transformations');
  keep(pa.slider('translate x', a, 'tx', -1.4, 1.4, 0.01));
  keep(pa.slider('translate y', a, 'ty', -1, 1, 0.01));
  keep(pa.slider('translate z', a, 'tz', 0.1, 1.5, 0.01));
  keep(pa.select('rotate about', ['x', 'y', 'z'], a, 'axis'));
  keep(pa.slider('rotation (rad)', a, 'angle', -Math.PI, Math.PI, 0.01));
  keep(pa.slider('scale x', a, 'sx', 0.05, 0.8, 0.01));
  keep(pa.slider('scale y', a, 'sy', 0.05, 0.8, 0.01));
  keep(pa.slider('scale z', a, 'sz', 0.05, 0.8, 0.01));
  keep(pa.select('order', [
    { value: 'TRS', label: 'M = T · R · S' },
    { value: 'SRT', label: 'M = S · R · T' },
  ], a, 'order'));
  pa.note('The orange cube uses the selected order; the thin wireframe is the other one.');
  const trsLabel = pa.note('');
  const trsText = pa.text();
  const srtLabel = pa.note('');
  const srtText = pa.text();

  /* ------------------------------------------------------- Part B · scene graph */
  const pb = panel.folder('Part B · Scene graph');
  const tree = [];
  gallery.root.traverse((n, depth) => tree.push(`${'  '.repeat(depth)}${depth ? '└ ' : ''}${n.name}`));
  pb.text(tree.join('\n'));
  const timeSlider = keep(pb.slider('animation time (s)', state, 'time', 0, 60, 0.01));
  const poseText = pb.text();
  const moonText = pb.text();

  /* ---------------------------------------------------- Part C · camera */
  const pc = panel.folder('Part C · Camera and projection');
  keep(pc.select('projection', ['perspective', 'orthographic'], camera, 'projection'));
  keep(pc.slider('fov (degrees)', {
    get deg() { return deg(camera.fovY); },
    set deg(x) { camera.fovY = (x * Math.PI) / 180; },
  }, 'deg', 25, 95, 1));
  keep(pc.slider('near', camera, 'near', 0.02, 1.5, 0.01));
  keep(pc.slider('far', camera, 'far', 2, 20, 0.25));
  keep(pc.slider('ortho height', camera, 'orthoHeight', 1.5, 7, 0.05));
  const camText = pc.text();
  pc.note('Drag empty space: orbit · wheel: zoom.');

  /* ---------------------------------------------------- Part D · curves */
  const pd = panel.folder('Part D · Curves over the painting');
  keep(pd.select('curve family', [
    { value: 'bezier', label: 'C¹ piecewise cubic Bézier' },
    { value: 'catmull', label: 'Catmull–Rom spline' },
    { value: 'bspline', label: 'Uniform cubic B-spline' },
  ], trace, 'family', () => actions.familyChanged()));
  keep(pd.toggle('edit points (drag in the orbit view)', state, 'edit'));
  keep(pd.slider('de Casteljau t', state, 't', 0, 1, 0.005));
  const travelSlider = keep(pd.slider('object position u', state, 'travel', 0, 1, 0.001));
  keep(pd.slider('object speed', state, 'travelSpeed', 0, 0.4, 0.01));
  pd.button('Export curve JSON', () => downloadJSON(trace.toJSON(), `curve-${trace.toJSON().painting}.json`));
  pd.note('Drag a control point on the painting. Shift + click moves the nearest point to the cursor.');
  const curveText = pd.text();

  return {
    refresh() { for (const w of widgets) w.update?.(); },

    /** Widgets that follow the animation (cheap, runs with update()). */
    refreshLive() { timeSlider.update(); travelSlider.update(); },

    /** Refresh the numeric readouts (a few times per second). */
    update(info) {
      const both = composeBoth(a);
      trsLabel.textContent = `M = T·R·S${a.order === 'TRS' ? '   ← in use' : ''}`;
      srtLabel.textContent = `M = S·R·T${a.order === 'SRT' ? '   ← in use' : ''}`;
      trsText.set(mat4.format(both.TRS, 3));
      srtText.set(mat4.format(both.SRT, 3));

      const t = state.time;
      const moon = gallery.moon.world;
      poseText.set(
        `t = ${t.toFixed(2)} s\n` +
        `arm angle   ${ARM_SPEED.toFixed(2)}·t = ${f2(ARM_SPEED * t)} rad\n` +
        `joint angle ${JOINT_SPEED.toFixed(2)}·t = ${f2(JOINT_SPEED * t)} rad`);
      moonText.set(
        `world matrix of leaf "Moon"\n${mat4.format(moon, 3)}\n` +
        `position (${vec([moon[12], moon[13], moon[14]])})`);

      const cam = camera;
      const d = Math.hypot(...cam.eye.map((v, i) => v - cam.target[i])); // distance to the painting
      camText.set(
        `eye    ${vec(cam.eye)}\n` +
        `target ${vec(cam.target)}\n` +
        `fov ${deg(cam.fovY).toFixed(1)}° · near ${f2(cam.near)} · far ${f2(cam.far)}\n` +
        `far/near ${(cam.far / cam.near).toFixed(1)}\n` +
        `depth step at the painting (24 bit): ${depthStep(cam.near, cam.far, Math.max(d, cam.near)).toExponential(2)}`);

      const c = info.castInfo;
      curveText.set(
        `${FAMILIES.indexOf(trace.family) + 1}/3 · ${trace.family} · ${trace.segmentCount} segments\n` +
        (c ? `de Casteljau: segment ${c.segment + 1}, local t = ${c.t.toFixed(3)}\n` : '') +
        `object at u = ${state.travel.toFixed(3)}  (${info.travel.uv.map((x) => x.toFixed(3)).join(', ')})`);
    },
  };
}
