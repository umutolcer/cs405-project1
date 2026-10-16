/**
 * The scene graph (Part B), which also holds the Part A objects.
 *
 * Painting: Şeker Ahmed Paşa — Kavunlu Natürmort. A small still life stands on
 * the painted table and a hanging mobile turns above the melon.
 *
 *   root                                  depth 0
 *   ├── partA                             1
 *   │   ├── box          (T·R·S)          2
 *   │   ├── apple        (T·R·S)          2
 *   │   ├── plate        (T·R·S)          2
 *   │   └── controlled   (UI: T·R·S / S·R·T)
 *   └── mobile           (hook)           1
 *       └── beam         ANIMATED: turns about y          2
 *           ├── armL                                       3
 *           │   └── pendulum  ANIMATED: swings about z     4
 *           │       └── melonBall                          5
 *           └── armR     ANIMATED: counter-rotates         3
 *               ├── grape                                  4
 *               └── charm                                  4
 *
 * Every node has:
 *   local  — its transform relative to the parent (moves the whole subtree)
 *   world  — parent.world · local, computed by root.updateWorld()
 *   data.pose(t)  — returns the local matrix at animation time t
 *   data.parts    — what to draw: a mesh, a colour and a SHAPE matrix that
 *                   sizes and places only this piece. The shape is NOT
 *                   inherited, so the long thin beam does not squash the
 *                   arms hanging from it.
 *
 * All matrices come from YOUR mat4 (src/math/mat4.js). They are built inside
 * functions so that this file loads before mat4 is implemented.
 */
import * as mat4 from '../math/mat4.js';
import { SceneNode } from './node.js';

/** Colours in LINEAR RGB (the shaders light in linear space). */
export const COLOURS = {
  wood: [0.23, 0.10, 0.035],
  apple: [0.40, 0.045, 0.025],
  ivory: [0.60, 0.55, 0.42],
  accent: [0.90, 0.28, 0.05],
  brass: [0.55, 0.36, 0.09],
  string: [0.30, 0.27, 0.22],
  melon: [0.30, 0.40, 0.07],
  gold: [0.72, 0.46, 0.08],
  cream: [0.70, 0.62, 0.40],
};

/* Shorthands for building matrices with your mat4. */
const T = (x, y, z) => mat4.translate(x, y, z);
const S = (x, y = x, z = x) => mat4.scale(x, y, z);
const mul = (...ms) => ms.reduce((a, b) => mat4.multiply(a, b));

/** One drawable piece of a node. `shape` returns a matrix (or is omitted for identity). */
const part = (mesh, colour, shape) => ({ mesh, colour, shape, matrix: null });

/**
 * A thin string of length |len| from the node's origin: downwards for len > 0,
 * upwards for len < 0 (a weight hanging from the node above it).
 */
const string = (len, width = 0.006) =>
  part('cube', COLOURS.string, () => mul(T(0, -len / 2, 0), S(width, Math.abs(len), width)));

function node(name, pose, parts = [], extra = {}) {
  const n = new SceneNode(name);
  n.data = { pose, parts, ...extra };
  return n;
}

/**
 * @returns {{ root: SceneNode, controlled: SceneNode, names: {value: string, label: string}[] }}
 */
export function buildTree() {
  const root = node('root', () => mat4.identity());

  /* ---------------- Part A: objects in front of the painting ------------ */
  // Placed with T·R·S, the order used everywhere in the project.
  const partA = root.addChild(node('partA', () => mat4.identity()));
  partA.addChild(node('box',
    () => mul(T(-1.08, -0.50, 0.30), mat4.rotateY(0.55), S(0.24)),
    [part('cube', COLOURS.wood)], { axisLen: 0.9 }));
  partA.addChild(node('apple',
    () => mul(T(1.00, -0.56, 0.30), mat4.rotateZ(-0.3), S(0.22)),
    [part('sphere', COLOURS.apple)], { axisLen: 0.9 }));
  partA.addChild(node('plate',
    () => mul(T(-0.45, -0.74, 0.35), mat4.rotateX(0.25), S(0.42, 0.05, 0.42)),
    [part('sphere', COLOURS.ivory)], { axisLen: 0.6 }));
  // pose = null: scene.js sets its local from the Part A sliders every frame.
  const controlled = partA.addChild(node('controlled', null,
    [part('cube', COLOURS.accent)], { axisLen: 0.9 }));

  /* ---------------- Part B: a mobile hanging above the melon ------------ */
  const mobile = root.addChild(node('mobile', () => T(0, 0.98, 0.5),
    [part('cube', COLOURS.brass, () => S(0.05)), string(0.15)]));

  const beam = mobile.addChild(node('beam',
    (t) => mul(T(0, -0.15, 0), mat4.rotateY(0.6 * t)),
    [part('cube', COLOURS.brass, () => S(1.1, 0.025, 0.025))]));

  const armL = beam.addChild(node('armL', () => T(-0.52, 0, 0), [string(0.2)]));
  const pendulum = armL.addChild(node('pendulum',
    (t) => mul(T(0, -0.2, 0), mat4.rotateZ(0.45 * Math.sin(1.8 * t))),
    [part('sphere', COLOURS.brass, () => S(0.04)), string(0.24)]));
  pendulum.addChild(node('melonBall', () => T(0, -0.30, 0),
    [part('sphere', COLOURS.melon, () => S(0.13))]));

  const armR = beam.addChild(node('armR',
    (t) => mul(T(0.52, -0.12, 0), mat4.rotateY(-1.5 * t)),
    [string(-0.12), part('cube', COLOURS.brass, () => S(0.38, 0.02, 0.02))]));
  armR.addChild(node('grape', () => T(-0.18, -0.12, 0),
    [string(-0.12), part('sphere', COLOURS.gold, () => S(0.08))]));
  armR.addChild(node('charm', () => T(0.18, -0.18, 0),
    [string(-0.18), part('cube', COLOURS.cream, () => mul(mat4.rotateZ(Math.PI / 4), S(0.07)))]));

  /* names for the "inspect node" drop-down, indented by depth */
  const names = [];
  root.traverse((n, depth) => names.push({ value: n.name, label: `${'\u00a0\u00a0'.repeat(depth)}${n.name}` }));

  return { root, controlled, names };
}
