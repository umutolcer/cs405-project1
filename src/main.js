import './ui/style.css';
import { initWebGPU, showFatal } from './render/gpu.js';
import { Renderer } from './render/renderer.js';
import { Painting } from './render/painting.js';
import { SceneView, Z } from './render/sceneView.js';
import { createCamera, createInspectionCamera, viewProjection, fitDistance } from './scene/camera.js';
import { Orbit } from './scene/orbit.js';
import { createGallery, updateGallery } from './scene/gallery.js';
import { Trace } from './scene/trace.js';
import { createState } from './state.js';
import { pickRay, intersectPlaneZ, worldToUV, uvToWorld, nearestOnScreen } from './scene/space.js';
import { createPanel } from './ui/panel.js';
import { createControls } from './ui/controls.js';
import { Stats } from './ui/stats.js';
import { attachPointer } from './ui/input.js';
import { PAINTING, paintingURL } from './config.js';
import * as mat4 from './math/mat4.js';

const PICK_RADIUS_PX = 18;
const INSET_ASPECT = 4 / 3;

async function main() {
  const canvas = document.getElementById('gfx');
  const gpu = await initWebGPU(canvas);
  const renderer = new Renderer(gpu);
  const painting = new Painting(gpu);
  await painting.load(paintingURL());
  const sceneView = new SceneView(gpu, renderer);

  /* ---------------------------------------------------------------- model */
  const state = createState();
  const camera = createCamera();
  const inspection = createInspectionCamera();
  const orbit = new Orbit(camera);
  const gallery = createGallery();
  const trace = new Trace();
  let selected = null; // index of the control point being dragged

  /* ------------------------------------------------------------------- UI */
  const panelRoot = document.getElementById('panel');
  const panel = createPanel(panelRoot);
  const title = document.createElement('h1');
  title.textContent = `CS405 · Project 1 — ${PAINTING.artist}, ${PAINTING.title}`;
  panelRoot.prepend(title);
  const a = gpu.adapter.info ?? {};
  const gpuName = [a.vendor, a.architecture, a.device, a.description].filter(Boolean).join(' ') || 'unknown GPU';
  const stats = new Stats(panelRoot, `GPU: ${gpuName}`);
  title.after(stats.el);

  const insetFrame = document.getElementById('inset-frame');

  const actions = {
    reset() {
      const fresh = createState();
      const { a: partA, ...rest } = fresh;
      Object.assign(state, rest);
      Object.assign(state.a, partA); // keep the same object: the sliders are bound to it
      Object.assign(camera, createCamera());
      trace.reset();
      selected = null;
      orbit.sync();
      actions.frontView();
      controls.refresh();
    },
    frontView() { orbit.front(fitDistance(camera.fovY, canvasAspect(), painting.aspect)); },
    viewChanged() { selected = null; },
    familyChanged() { selected = null; },
  };
  const controls = createControls(panel, { state, camera, gallery, trace, orbit, actions });

  const nextView = () => { state.view = state.view === 'orbit' ? 'inspection' : 'orbit'; selected = null; controls.refresh(); };
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const key = e.key.toLowerCase();
    if (key === 'r') actions.reset();
    else if (key === 'v') nextView();
    else if (key === 'a') { state.axes = !state.axes; controls.refresh(); }
    else if (e.code === 'Space') { e.preventDefault(); state.paused = !state.paused; controls.refresh(); }
  });
  document.getElementById('panel-toggle').addEventListener('click', () => document.body.classList.toggle('no-panel'));

  /* -------------------------------------------------------------- picking */
  const canvasAspect = () => canvas.width / Math.max(1, canvas.height);
  const canvasSize = () => canvas.getBoundingClientRect();
  const controlPlaneHit = (ndc) =>
    intersectPlaneZ(pickRay(camera, ndc, canvasAspect()), Z.point);

  attachPointer(canvas, {
    down(e) {
      if (e.button !== 0 || state.view !== 'orbit' || !state.edit || !state.polygons) return;
      const vp = viewProjection(camera, canvasAspect()).matrix;
      const points = trace.entries().map((p) => uvToWorld(p.uv, painting.aspect, Z.point));
      const hit = nearestOnScreen(points, vp, e.ndc, canvasSize());
      if (!hit || (!e.shift && hit.distance > PICK_RADIUS_PX)) return;
      selected = hit.index;
      if (e.shift) moveSelected(e.ndc);
    },
    drag(e) {
      if (selected !== null) moveSelected(e.ndc);
      else if (state.view === 'orbit') orbit.rotate(e.dx, e.dy);
    },
    up() { selected = null; },
    wheel(e) { if (state.view === 'orbit') orbit.zoom(e.delta); },
  });

  function moveSelected(ndc) {
    const p = controlPlaneHit(ndc);
    if (p) trace.move(selected, worldToUV(p, painting.aspect));
  }

  /* ----------------------------------------------------------- frame loop */
  let needFit = true; // fit the painting into the first real viewport size
  let previous = performance.now();
  let lastReadout = 0;

  /** Inset rectangle in device pixels, top-left corner, below the panel button. */
  function insetRect() {
    const css = canvasSize();
    const scale = canvas.width / css.width; // device pixels per CSS pixel
    const w = Math.round(Math.max(240, Math.min(css.width * 0.26, 420)) * scale);
    const h = Math.round(w / INSET_ASPECT);
    return { x: 12 * scale, y: 46 * scale, w, h, scale };
  }

  function frame(now) {
    stats.begin(now);
    if (needFit && canvas.width > 16) { actions.frontView(); needFit = false; }
    const dt = Math.min(0.1, (now - previous) / 1000);
    previous = now;
    if (!state.paused) {
      state.time += dt * state.speed;
      state.travel = (state.travel + dt * state.speed * state.travelSpeed) % 1;
    }

    const matrices = updateGallery(gallery, state.a, state.time);
    const aspect = canvasAspect();
    const mainCamera = state.view === 'orbit' ? camera : inspection;
    const vp = viewProjection(mainCamera, aspect).matrix;
    const paintingMVP = (viewProj) => mat4.multiply(viewProj, painting.model);

    sceneView.beginFrame();
    sceneView.prepare({
      gallery, matrices, trace, ui: state, selected,
      paintingAspect: painting.aspect, orbitCamera: camera, mainAspect: aspect, travel: state.travel,
    });

    const insets = [];
    const showInset = state.view === 'orbit' && state.inset;
    if (showInset) {
      const r = insetRect();
      const insetVP = viewProjection(inspection, r.w / r.h).matrix;
      insets.push({
        rect: r,
        draw(pass) {
          sceneView.drawBackdrop(pass);
          painting.draw(pass, paintingMVP(insetVP), renderer, 1);
          sceneView.draw(pass, insetVP, { frustum: state.frustum });
        },
      });
      const css = canvasSize();
      Object.assign(insetFrame.style, {
        display: 'block',
        left: `${r.x / r.scale}px`, top: `${css.top + r.y / r.scale}px`,
        width: `${r.w / r.scale}px`, height: `${r.h / r.scale}px`,
      });
    } else insetFrame.style.display = 'none';

    renderer.render((pass) => {
      painting.draw(pass, paintingMVP(vp), renderer, 0);
      sceneView.draw(pass, vp, { frustum: state.view === 'inspection' && state.frustum });
    }, insets);

    if (now - lastReadout > 130) {
      lastReadout = now;
      controls.update({ castInfo: sceneView.castInfo, travel: trace.sample(state.travel) });
      controls.refreshLive();
    }
    stats.end(renderer.stats);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error(error);
  showFatal(error.message ?? String(error));
});
