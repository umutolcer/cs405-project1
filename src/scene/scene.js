/**
 * The scene: Parts A and B (Part D will be added here too).
 *
 * main.js calls, every frame:
 *     scene.update(dt, time)          dt and time in seconds
 *     scene.draw(pass, viewProj)      inside the frame's render pass
 * and scene.reset() from the panel's "reset" button.
 *
 *   sceneTree.js  — the node tree (what is in the scene and how it moves)
 *   partA.js      — the UI-controlled object, T·R·S vs S·R·T, matrix readouts
 *   render/mesh.js, render/lines.js — the WebGPU pipelines that draw it
 *
 * Until your maths exists (mat4.*, SceneNode.updateWorld) the scene draws
 * nothing and the "Scene" box in the panel names the first missing function.
 */
import * as mat4 from '../math/mat4.js';
import { NotImplemented } from '../math/todo.js';
import { cube, axes } from './geometry.js';
import { sphere, cubeEdges } from './shapes.js';
import { buildTree } from './sceneTree.js';
import { PART_A_DEFAULTS, composeBoth, createPartAPanel } from './partA.js';
import { MeshRenderer } from '../render/mesh.js';
import { LineRenderer } from '../render/lines.js';

export function createScene({ gpu, renderer, painting, panel }) {
  /* ---------------- GPU resources ---------------- */
  const meshes = new MeshRenderer(gpu);
  const lines = new LineRenderer(gpu);
  const MESH = {
    cube: meshes.createMesh(cube(), 'cube'),
    sphere: meshes.createMesh(sphere(24, 16), 'sphere'),
  };
  const AXES = lines.create(axes(1), 'axes');                       // scaled per node
  const GHOST = lines.create(cubeEdges([0.10, 0.65, 1.0]), 'ghost');  // the order NOT in use

  /* ---------------- scene graph ---------------- */
  const { root, controlled, names } = buildTree();

  const state = {
    a: { ...PART_A_DEFAULTS },  // Part A sliders
    debugAxes: false,
    paused: false,
    speed: 1,
    t: 0,                       // animation time (seconds, scaled by speed)
    inspect: 'melonBall',       // node whose matrices are shown
  };
  let ready = false;            // true once your maths runs without NotImplemented
  let otherOrder = null;        // local matrix of the order NOT in use

  /* ---------------- UI ---------------- */
  const sf = panel.folder('Scene');
  const status = sf.text('');

  const partAUI = createPartAPanel(panel, state.a);

  const fb = panel.folder('Part B · Scene graph');
  const ui = {
    axes: fb.toggle('debug axes (every node)', state, 'debugAxes'),
    paused: fb.toggle('pause animation', state, 'paused'),
    speed: fb.slider('speed', state, 'speed', 0, 3, 0.05),
    inspect: fb.select('inspect node', names, state.inspect, (v) => (state.inspect = v)),
  };
  const nodeReadout = fb.text('');
  fb.note('Pause, pick a leaf and copy its world matrix for the hand check in the report.');

  /* ---------------- helpers ---------------- */
  let lastError = '';
  function fail(e) {
    ready = false;
    const msg = e instanceof NotImplemented
      ? `waiting for your maths:\n${e.message}`
      : `error (see console):\n${e.message ?? e}`;
    if (!(e instanceof NotImplemented) && msg !== lastError) console.error(e);
    lastError = msg;
    status.set(msg);
    status.el.classList.add('warn');
  }

  let nodeCount = 0;
  root.traverse(() => nodeCount++);

  function showNode() {
    const n = root.find(state.inspect);
    if (!n) return;
    const path = [];
    for (let p = n; p; p = p.parent) path.unshift(p.name);
    const o = mat4.transformVec4(n.world, [0, 0, 0, 1]);
    nodeReadout.set(
      `${path.join(' → ')}\n` +
      `local\n${mat4.format(n.local, 3)}\n` +
      `world = parent.world · local\n${mat4.format(n.world, 3)}\n` +
      `origin in world: (${o.slice(0, 3).map((x) => x.toFixed(3)).join(', ')})`
    );
  }

  /** model = node.world · shape (shape matrices are built once, then cached) */
  function partModel(n, p) {
    if (p.shape && !p.matrix) p.matrix = p.shape();
    return p.matrix ? mat4.multiply(n.world, p.matrix) : n.world;
  }

  return {
    state,

    update(dt) {
      if (!state.paused) state.t += dt * state.speed;
      try {
        // Part A: both orders from the sliders; the selected one drives the node.
        const { TRS, SRT } = composeBoth(state.a);
        const useTRS = state.a.order === 'TRS';
        controlled.local = useTRS ? TRS : SRT;
        otherOrder = useTRS ? SRT : TRS;
        partAUI.show(TRS, SRT);

        // Part B: animate the local transforms, then one traversal for all world matrices.
        root.traverse((n) => { if (n.data.pose) n.local = n.data.pose(state.t); });
        root.updateWorld();
        showNode();

        ready = true;
        lastError = '';
        status.set(`${nodeCount} nodes · ${state.a.order === 'TRS' ? 'T·R·S' : 'S·R·T'} · t = ${state.t.toFixed(1)} s`);
        status.el.classList.remove('warn');
      } catch (e) {
        fail(e);
      }
    },

    /** @param {GPURenderPassEncoder} pass  @param {Float32Array} viewProj  P · V */
    draw(pass, viewProj) {
      if (!ready) return;
      meshes.beginFrame();
      lines.beginFrame();
      try {
        // one draw per mesh piece:  mvp = P·V · (world · shape)
        root.traverse((n) => {
          for (const p of n.data.parts ?? []) {
            const model = partModel(n, p);
            meshes.draw(pass, MESH[p.mesh], mat4.multiply(viewProj, model), model, p.colour, renderer);
          }
        });

        // Part A: wireframe of the composition that is NOT in use
        if (state.a.ghost && otherOrder) {
          const ghostWorld = mat4.multiply(controlled.parent.world, otherOrder);
          lines.draw(pass, GHOST, mat4.multiply(viewProj, ghostWorld), renderer, { overlay: true });
        }

        // Part B: local axes of every node (x red, y green, z blue)
        if (state.debugAxes) {
          root.traverse((n) => {
            const len = n.data.axisLen ?? 0.15;
            const M = mat4.multiply(n.world, mat4.scale(len, len, len));
            lines.draw(pass, AXES, mat4.multiply(viewProj, M), renderer, { overlay: true });
          });
        }
      } catch (e) {
        fail(e);
      }
    },

    reset() {
      Object.assign(state.a, PART_A_DEFAULTS);
      state.t = 0;
      state.paused = false;
      state.speed = 1;
      partAUI.refresh();
      ui.paused.update();
      ui.speed.update();
    },
  };
}
