import * as mat4 from '../math/mat4.js';
import * as curves from '../math/curves.js';
import { SceneNode } from './node.js';
import { SceneGraphics, segment } from '../render/objects.js';
import { curveToJSON, downloadJSON } from './curveExport.js';

const INITIAL_SEGMENTS = [
  [[0.30, 0.275], [0.365, 0.087], [0.57, 0.075], [0.745, 0.175]],
  [[0.745, 0.175], [0.92, 0.275], [0.96, 0.405], [0.87, 0.505]],
  [[0.87, 0.505], [0.78, 0.605], [0.48, 0.555], [0.305, 0.515]],
];
const INITIAL_SPLINE = [
  [0.17, 0.58], [0.20, 0.69], [0.30, 0.785], [0.51, 0.825],
  [0.72, 0.80], [0.86, 0.685], [0.89, 0.59],
];
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const product = (...m) => m.reduce((a, b) => mat4.multiply(a, b), mat4.identity());

function transformed(matrix, point) {
  const p = mat4.transformVec4(matrix, [...point, 1]);
  return [p[0] / p[3], p[1] / p[3], p[2] / p[3]];
}

export function createScene({ gpu, renderer, painting, panel }) {
  const graphics = new SceneGraphics(gpu, renderer);
  const state = {
    debugAxes: false,
    showControl: true,
    showCasteljau: true,
    showFrustum: true,
    curveType: 'bezier',
    tracing: true,
    paused: false,
    speed: 0.16,
    t: 0.38,
    tx: -0.22, ty: -0.48, tz: 0.56,
    angle: 0.32,
    objectScale: 0.26,
    order: 'TRS',
  };
  let segments = clone(INITIAL_SEGMENTS);
  let splinePoints = clone(INITIAL_SPLINE);
  let elapsed = 0;
  let selected = null;

  const root = new SceneNode('Gallery');
  const mainObject = root.addChild(new SceneNode('Transform Cube'));
  mainObject.data.colour = [0.96, 0.54, 0.18];
  const smallCube = root.addChild(new SceneNode('Left Cube',
    product(mat4.translate(-0.92, -0.65, 0.34), mat4.rotateY(0.4), mat4.scale(0.23, 0.23, 0.23))));
  smallCube.data.colour = [0.23, 0.74, 0.83];
  const rig = root.addChild(new SceneNode('Moving Group', mat4.translate(0.66, -0.53, 0.40)));
  const pivot = rig.addChild(new SceneNode('Rotating Arm'));
  const rod = pivot.addChild(new SceneNode('Arm Rod',
    product(mat4.translate(0.21, 0, 0), mat4.scale(0.42, 0.055, 0.055))));
  rod.data.colour = [0.67, 0.63, 0.91];
  const satellite = pivot.addChild(new SceneNode('Satellite',
    product(mat4.translate(0.43, 0, 0), mat4.scale(0.14, 0.14, 0.14))));
  satellite.data.colour = [0.86, 0.36, 0.57];
  const base = rig.addChild(new SceneNode('Pivot Marker', mat4.scale(0.12, 0.12, 0.12)));
  base.data.colour = [0.91, 0.86, 0.45];

  const af = panel.folder('Part A · Transformations');
  const sliderRefs = [];
  sliderRefs.push(af.slider('translate x', state, 'tx', -1.5, 1.5, 0.01));
  sliderRefs.push(af.slider('translate y', state, 'ty', -1.3, 1.3, 0.01));
  sliderRefs.push(af.slider('translate z', state, 'tz', 0.1, 2, 0.01));
  sliderRefs.push(af.slider('rotation', state, 'angle', -3.14, 3.14, 0.01));
  sliderRefs.push(af.slider('scale', state, 'objectScale', 0.06, 0.7, 0.01));
  const orderRef = af.select('active order', ['TRS', 'SRT'], state.order, (value) => (state.order = value));
  af.note('The orange cube uses the active order. Both matrices are displayed below.');
  const matrixReadout = af.text();

  const bf = panel.folder('Part B · Scene graph');
  const debugRef = bf.toggle('node axes', state, 'debugAxes');
  bf.note('Gallery → Moving Group → Rotating Arm → Satellite');
  const leafReadout = bf.text();

  const df = panel.folder('Part D · Curves');
  const typeRef = df.select('curve family', [
    { value: 'bezier', label: 'C¹ piecewise Bézier' },
    { value: 'catmull', label: 'Catmull–Rom' },
    { value: 'bspline', label: 'Cubic B-spline' },
  ], state.curveType, (value) => { state.curveType = value; selected = null; });
  const traceRef = df.toggle('edit points', state, 'tracing');
  const controlRef = df.toggle('control polygons', state, 'showControl');
  const castRef = df.toggle('de Casteljau', state, 'showCasteljau');
  const tRef = df.slider('construction t', state, 't', 0, 1, 0.01);
  const pauseRef = df.toggle('pause animation', state, 'paused');
  const speedRef = df.slider('speed', state, 'speed', 0.01, 0.6, 0.01);
  df.note('Click and drag the coloured control cubes. Shift + click moves the nearest point to the cursor. Drag empty space to orbit.');
  df.button('Export curve JSON', () => downloadJSON(curveToJSON({
    painting: currentPaintingId, kind: state.curveType === 'bezier' ? 'bezier-c1' : state.curveType === 'catmull' ? 'catmull-rom' : 'bspline',
    segments, points: splinePoints,
  }), `curve-${currentPaintingId}.json`));
  const curveReadout = df.text();
  let currentPaintingId = 'kavunlu';

  function worldPoint(uv, z = 0.035) {
    return [(uv[0] * 2 - 1) * painting.aspect, (1 - uv[1] * 2), z];
  }

  function cpEntries() {
    if (state.curveType === 'bezier') {
      const list = [];
      for (let i = 0; i < segments.length; i++) {
        for (let j = 0; j < 4; j++) {
          if (j === 0 && i > 0) continue;
          list.push({ i, j, uv: segments[i][j], id: `cp-${i}-${j}` });
        }
      }
      return list;
    }
    return splinePoints.map((uv, i) => ({ i, j: 0, uv, id: `cp-${i}` }));
  }

  function samplePath(u) {
    if (state.curveType === 'bezier') {
      const x = clamp(u, 0, 1) * segments.length;
      const i = Math.min(segments.length - 1, Math.floor(x));
      const t = Math.min(1, x - i);
      return { uv: curves.cubicBezier(...segments[i], t), tangent: curves.cubicBezierTangent(...segments[i], t) };
    }
    const count = splinePoints.length - 3;
    const x = clamp(u, 0, 1) * count;
    const i = Math.min(count - 1, Math.floor(x));
    const t = Math.min(1, x - i);
    const pts = splinePoints.slice(i, i + 4);
    const method = state.curveType === 'catmull' ? curves.catmullRom : curves.bspline;
    const uv = method(...pts, t);
    const ahead = method(...pts, clamp(t + 0.001, 0, 1));
    const behind = method(...pts, clamp(t - 0.001, 0, 1));
    return { uv, tangent: [ahead[0] - behind[0], ahead[1] - behind[1]] };
  }

  function update(dt, time) {
    if (!state.paused) elapsed += dt * state.speed;
    const t = mat4.translate(state.tx, state.ty, state.tz);
    const r = mat4.rotateZ(state.angle);
    const s = mat4.scale(state.objectScale, state.objectScale, state.objectScale);
    const trs = product(t, r, s);
    const srt = product(s, r, t);
    mainObject.local = state.order === 'TRS' ? trs : srt;
    pivot.local = mat4.rotateZ(time * 0.75);
    root.updateWorld();
    matrixReadout.set(`T · R · S\n${mat4.format(trs)}\n\nS · R · T\n${mat4.format(srt)}`);
    leafReadout.set(`Satellite world matrix\n${mat4.format(satellite.world)}`);
    curveReadout.set(`segments: ${segments.length} · edit: ${state.tracing ? 'on' : 'off'}\nparameter: ${(elapsed % 1).toFixed(2)} · t: ${state.t.toFixed(2)}`);
  }

  function draw(pass, viewProj) {
    root.traverse((node) => {
      if (node.data.colour) graphics.cubeDraw(pass, node.name, node.world, viewProj, node.data.colour);
    });

    const curveLines = [];
    for (let k = 1; k <= 240; k++) {
      const a = worldPoint(samplePath((k - 1) / 240).uv, 0.055);
      const b = worldPoint(samplePath(k / 240).uv, 0.055);
      segment(curveLines, a, b, [1, 0.66, 0.13]);
    }
    graphics.lineDraw(pass, 'curve', curveLines, viewProj);

    const controlLines = [];
    if (state.showControl) {
      if (state.curveType === 'bezier') {
        for (const s of segments) for (let j = 0; j < 3; j++) {
          segment(controlLines, worldPoint(s[j], 0.072), worldPoint(s[j + 1], 0.072), [0.19, 0.88, 0.95]);
        }
      } else {
        for (let i = 1; i < splinePoints.length; i++) {
          segment(controlLines, worldPoint(splinePoints[i - 1], 0.072), worldPoint(splinePoints[i], 0.072), [0.19, 0.88, 0.95]);
        }
      }
      graphics.lineDraw(pass, 'control-poly', controlLines, viewProj);
      for (const entry of cpEntries()) {
        const p = worldPoint(entry.uv, 0.10);
        const color = selected?.id === entry.id ? [1, 0.98, 0.35] :
          (entry.j === 0 || entry.j === 3 ? [1, 0.44, 0.27] : [0.15, 0.91, 0.98]);
        const model = product(mat4.translate(...p), mat4.scale(0.035, 0.035, 0.035));
        graphics.cubeDraw(pass, entry.id, model, viewProj, color);
      }
    }

    if (state.showCasteljau && state.curveType === 'bezier') {
      const levels = curves.deCasteljau(segments[0], state.t);
      const construction = [];
      const cols = [[0.98, 0.35, 0.75], [0.63, 0.93, 0.34], [1, 1, 0.35]];
      for (let i = 1; i < levels.length; i++) {
        for (let k = 1; k < levels[i].length; k++) {
          segment(construction, worldPoint(levels[i][k - 1], 0.09), worldPoint(levels[i][k], 0.09), cols[i - 1]);
        }
        for (let k = 0; k < levels[i].length; k++) {
          const p = worldPoint(levels[i][k], 0.11);
          graphics.cubeDraw(pass, `cast-${i}-${k}`, product(mat4.translate(...p), mat4.scale(0.024, 0.024, 0.024)), viewProj, cols[i - 1]);
        }
      }
      graphics.lineDraw(pass, 'casteljau', construction, viewProj);
    }

    const path = samplePath(elapsed % 1);
    const p = worldPoint(path.uv, 0.23);
    const angle = Math.atan2(-path.tangent[1], path.tangent[0]);
    const traveler = product(mat4.translate(...p), mat4.rotateZ(angle), mat4.scale(0.095, 0.042, 0.07));
    graphics.cubeDraw(pass, 'traveler', traveler, viewProj, [0.98, 0.98, 0.28]);

    if (state.debugAxes) {
      const axes = [];
      root.traverse((node) => {
        const origin = transformed(node.world, [0, 0, 0]);
        segment(axes, origin, transformed(node.world, [0.26, 0, 0]), [1, 0.1, 0.1]);
        segment(axes, origin, transformed(node.world, [0, 0.26, 0]), [0.1, 1, 0.1]);
        segment(axes, origin, transformed(node.world, [0, 0, 0.26]), [0.15, 0.42, 1]);
      });
      graphics.lineDraw(pass, 'axes', axes, viewProj);
    }
  }

  function drawFrustum(pass, vp, camera, aspect) {
    if (!state.showFrustum) return;
    const eye = camera.eye;
    let backward = [eye[0] - camera.target[0], eye[1] - camera.target[1], eye[2] - camera.target[2]];
    let mag = Math.hypot(...backward);
    backward = mag > 1e-9 ? backward.map((x) => x / mag) : [0, 0, 1];
    let right = [camera.up[1] * backward[2] - camera.up[2] * backward[1],
      camera.up[2] * backward[0] - camera.up[0] * backward[2],
      camera.up[0] * backward[1] - camera.up[1] * backward[0]];
    mag = Math.hypot(...right);
    if (mag < 1e-9) right = [1, 0, 0];
    else right = right.map((v) => v / mag);
    const up = [backward[1] * right[2] - backward[2] * right[1],
      backward[2] * right[0] - backward[0] * right[2],
      backward[0] * right[1] - backward[1] * right[0]];
    const plane = (d) => {
      const h = camera.projection === 'perspective' ? Math.tan(camera.fovY / 2) * d : camera.orthoHeight / 2;
      const w = h * aspect;
      const center = eye.map((v, i) => v - backward[i] * d);
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) =>
        center.map((v, i) => v + right[i] * x * w + up[i] * y * h));
    };
    const near = plane(camera.near), far = plane(camera.far);
    const lines = [];
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      segment(lines, near[i], near[next], [0.35, 0.93, 0.97]);
      segment(lines, far[i], far[next], [0.93, 0.44, 0.78]);
      segment(lines, near[i], far[i], [1, 0.85, 0.35]);
    }
    graphics.lineDraw(pass, 'frustum', lines, vp);
    const cameraModel = product(mat4.translate(...eye), mat4.scale(0.16, 0.13, 0.24));
    graphics.cubeDraw(pass, 'camera-body', cameraModel, vp, [0.98, 0.80, 0.27]);
  }

  function tryPick(ndc, vp, canvas, shift = false) {
    if (!state.tracing || !state.showControl) return false;
    const rect = canvas.getBoundingClientRect();
    let nearest = null;
    for (const entry of cpEntries()) {
      const clip = mat4.transformVec4(vp, [...worldPoint(entry.uv, 0.1), 1]);
      if (clip[3] <= 0) continue;
      const dx = ((clip[0] / clip[3] - ndc[0]) * rect.width / 2);
      const dy = ((clip[1] / clip[3] - ndc[1]) * rect.height / 2);
      const distance = Math.hypot(dx, dy);
      if (!nearest || distance < nearest.distance) nearest = { ...entry, distance };
    }
    if (!nearest || (!shift && nearest.distance > 18)) return false;
    selected = nearest;
    return true;
  }

  function dragPicked(uv) {
    if (!selected) return;
    const p = [clamp(uv[0], 0, 1), clamp(uv[1], 0, 1)];
    const { i, j } = selected;
    if (state.curveType !== 'bezier') {
      splinePoints[i] = p;
      return;
    }
    const old = segments[i][j];
    const delta = p.map((x, k) => x - old[k]);
    segments[i][j] = p;
    if (j === 0 && i > 0) {
      segments[i - 1][3] = [...p];
      segments[i - 1][2] = segments[i - 1][2].map((x, k) => x + delta[k]);
      segments[i][1] = segments[i][1].map((x, k) => x + delta[k]);
    } else if (j === 3 && i < segments.length - 1) {
      segments[i + 1][0] = [...p];
      segments[i + 1][1] = segments[i + 1][1].map((x, k) => x + delta[k]);
      segments[i][2] = segments[i][2].map((x, k) => x + delta[k]);
    } else if (j === 1 && i > 0) {
      segments[i - 1][2] = curves.c1NextControl(p, segments[i][0]);
    } else if (j === 2 && i < segments.length - 1) {
      segments[i + 1][1] = curves.c1NextControl(p, segments[i][3]);
    }
  }

  function release() { selected = null; }
  function reset() {
    const defaults = {
      debugAxes: false, showControl: true, showCasteljau: true, showFrustum: true,
      curveType: 'bezier', tracing: true, paused: false, speed: 0.16, t: 0.38,
      tx: -0.22, ty: -0.48, tz: 0.56, angle: 0.32, objectScale: 0.26, order: 'TRS',
    };
    Object.assign(state, defaults);
    segments = clone(INITIAL_SEGMENTS);
    splinePoints = clone(INITIAL_SPLINE);
    elapsed = 0;
    selected = null;
    sliderRefs.forEach((ref) => ref.update());
    for (const ref of [tRef, speedRef]) ref.update();
    for (const ref of [debugRef, traceRef, controlRef, castRef, pauseRef]) ref.update();
    orderRef.set(state.order);
    typeRef.set(state.curveType);
  }

  return {
    state, root, update, draw, reset, drawFrustum, tryPick, dragPicked, release,
    setPainting(id) { currentPaintingId = id; },
    exportData() { return curveToJSON({ painting: currentPaintingId, kind: 'bezier-c1', segments }); },
  };
}
