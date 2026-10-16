import './ui/style.css';
import { initWebGPU, showFatal } from './render/gpu.js';
import { Renderer } from './render/renderer.js';
import { Painting } from './render/painting.js';
import { createCamera, viewProjection } from './scene/camera.js';
import { createScene } from './scene/scene.js';
import { createPanel } from './ui/panel.js';
import { Stats } from './ui/stats.js';
import { attachPointer } from './ui/input.js';
import { PAINTINGS, DEFAULT_PAINTING, paintingURL } from './config.js';
import * as mat4 from './math/mat4.js';
import * as v3 from './math/vec3.js';

async function main() {
  const canvas = document.getElementById('gfx');
  const gpu = await initWebGPU(canvas);
  const renderer = new Renderer(gpu);
  const painting = new Painting(gpu);
  const query = new URLSearchParams(location.search);
  let current = PAINTINGS.find((p) => p.id === query.get('painting'))
    ?? PAINTINGS.find((p) => p.id === DEFAULT_PAINTING);
  await painting.load(paintingURL(current));

  const panelRoot = document.getElementById('panel');
  const panel = createPanel(panelRoot);
  const title = document.createElement('h1');
  title.textContent = 'CS405 · Project 1';
  panelRoot.prepend(title);
  const stats = new Stats(panelRoot);

  const pf = panel.folder('Painting');
  pf.select('painting', PAINTINGS.map((p) => ({ value: p.id, label: `${p.artist} — ${p.title}` })), current.id,
    async (id) => {
      const chosen = PAINTINGS.find((p) => p.id === id);
      if (!chosen) return;
      try {
        await painting.load(paintingURL(chosen));
        current = chosen;
        scene.setPainting(id);
        history.replaceState(null, '', `?painting=${encodeURIComponent(id)}`);
      } catch (error) {
        showFatal(`Painting could not be loaded: ${error.message}`);
      }
    });

  const camera = createCamera();
  const inspector = createCamera();
  inspector.eye = [7, 4.5, 9];
  inspector.target = [0, 0, -1.5];
  inspector.fovY = 55 * Math.PI / 180;
  inspector.near = 0.1;
  inspector.far = 35;
  let viewMode = 'main';

  const cf = panel.folder('Part C · Camera');
  const camStatus = cf.text('');
  const projectionControl = cf.select('projection', ['perspective', 'orthographic'], camera.projection,
    (value) => { camera.projection = value; });
  const fovControl = cf.slider('fov (degrees)', { get degrees() { return camera.fovY * 180 / Math.PI; },
    set degrees(x) { camera.fovY = x * Math.PI / 180; } }, 'degrees', 25, 95, 1);
  const nearControl = cf.slider('near', camera, 'near', 0.05, 1, 0.01);
  const farControl = cf.slider('far', camera, 'far', 4, 20, 0.25);
  const orthoControl = cf.slider('ortho height', camera, 'orthoHeight', 1.5, 7, 0.05);
  const camReadout = cf.text('');
  cf.note('Drag empty space to orbit. Scroll to zoom. Choose inspection to see the camera frustum.');

  const scene = createScene({ gpu, renderer, painting, panel });
  scene.setPainting(current.id);
  const vf = panel.folder('Part E · View');
  const viewControl = vf.select('view', [
    { value: 'main', label: 'Orbit camera' },
    { value: 'inspection', label: 'Fixed inspection camera' },
  ], viewMode, (value) => { viewMode = value; scene.release(); });
  const frustumControl = vf.toggle('inspection frustum', scene.state, 'showFrustum');
  const viewDebugRef = vf.toggle('debug axes', scene.state, 'debugAxes');
  const resetAll = () => {
    Object.assign(camera, createCamera());
    scene.reset();
    viewMode = 'main';
    viewControl.set(viewMode);
    projectionControl.set(camera.projection);
    for (const control of [fovControl, nearControl, farControl, orthoControl, frustumControl, viewDebugRef]) control.update();
    setupOrbit();
  };
  vf.button('Reset scene and camera', resetAll);
  vf.note(gpu.encodeSRGB ? 'sRGB: shader encoding' : 'sRGB: canvas encoding');

  let theta = 0, phi = Math.PI / 2, radius = 2.8;
  function setupOrbit() {
    const d = v3.sub(camera.eye, camera.target);
    radius = v3.length(d);
    theta = Math.atan2(d[0], d[2]);
    phi = Math.acos(clamp(d[1] / radius, -1, 1));
  }
  setupOrbit();

  function applyOrbit() {
    const sinPhi = Math.sin(phi);
    camera.eye = [
      camera.target[0] + radius * sinPhi * Math.sin(theta),
      camera.target[1] + radius * Math.cos(phi),
      camera.target[2] + radius * sinPhi * Math.cos(theta),
    ];
  }

  const canvasAspect = () => canvas.width / Math.max(1, canvas.height);
  const activeCamera = () => viewMode === 'main' ? camera : inspector;
  function hitPainting(ndc) {
    const cam = activeCamera();
    const forward = v3.normalize(v3.sub(cam.target, cam.eye));
    let right = v3.normalize(v3.cross(forward, cam.up));
    if (v3.length(right) < 1e-7) right = [1, 0, 0];
    const up = v3.normalize(v3.cross(right, forward));
    const aspect = canvasAspect();
    let origin = [...cam.eye], direction = forward;
    if (cam.projection === 'perspective') {
      const h = Math.tan(cam.fovY / 2);
      direction = v3.normalize(v3.add(forward, v3.add(
        v3.scale(right, ndc[0] * h * aspect), v3.scale(up, ndc[1] * h))));
    } else {
      const h = cam.orthoHeight / 2;
      origin = v3.add(origin, v3.add(v3.scale(right, ndc[0] * h * aspect), v3.scale(up, ndc[1] * h)));
    }
    if (Math.abs(direction[2]) < 1e-9) return null;
    const t = (0.1 - origin[2]) / direction[2];
    if (t < 0) return null;
    const p = v3.add(origin, v3.scale(direction, t));
    return [(p[0] / painting.aspect + 1) * 0.5, (1 - p[1]) * 0.5];
  }

  let selectedPointDrag = false;
  attachPointer(canvas, {
    down(e) {
      if (e.button !== 0 || viewMode !== 'main') return;
      const vp = viewProjection(camera, canvasAspect(), painting.aspect).matrix;
      selectedPointDrag = scene.tryPick(e.ndc, vp, canvas, e.shift);
      if (selectedPointDrag && e.shift) {
        const point = hitPainting(e.ndc);
        if (point) scene.dragPicked(point);
      }
    },
    drag(e) {
      if (selectedPointDrag) {
        const point = hitPainting(e.ndc);
        if (point) scene.dragPicked(point);
      } else if (viewMode === 'main') {
        theta -= e.dx * 0.005;
        phi = clamp(phi - e.dy * 0.005, 0.08, Math.PI - 0.08);
        applyOrbit();
      }
    },
    up() { selectedPointDrag = false; scene.release(); },
    wheel(e) {
      if (viewMode !== 'main') return;
      radius = clamp(radius * Math.exp(e.delta * 0.001), 1.2, 13);
      applyOrbit();
    },
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'r') resetAll();
    if (e.code === 'Space') { e.preventDefault(); scene.state.paused = !scene.state.paused; }
  });

  let previous = performance.now();
  let lastReadout = 0;
  function frame(now) {
    stats.begin(now);
    const dt = Math.min(0.1, (now - previous) / 1000);
    previous = now;
    scene.update(dt, now / 1000);
    const aspect = canvasAspect();
    const vp = viewProjection(activeCamera(), aspect, painting.aspect);
    const matrix = mat4.multiply(vp.matrix, painting.model);
    renderer.render((pass) => {
      painting.draw(pass, matrix, renderer);
      scene.draw(pass, vp.matrix);
      if (viewMode === 'inspection') scene.drawFrustum(pass, vp.matrix, camera, aspect);
    });
    if (now - lastReadout > 130) {
      lastReadout = now;
      camStatus.set(`${viewMode === 'main' ? 'Orbit' : 'Inspection'} · ${activeCamera().projection}\nP · V · M`);
      camReadout.set(
        `eye    ${camera.eye.map((x) => x.toFixed(2)).join(', ')}\n` +
        `target ${camera.target.map((x) => x.toFixed(2)).join(', ')}\n` +
        `fovY ${(camera.fovY * 180 / Math.PI).toFixed(1)}°\n` +
        `near ${camera.near.toFixed(2)} · far ${camera.far.toFixed(2)}`);
    }
    stats.end(renderer.stats);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }

main().catch((error) => {
  console.error(error);
  showFatal(error.message ?? String(error));
});
