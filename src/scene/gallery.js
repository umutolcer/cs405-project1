/**
 * The objects standing in front of the painting: Part A (transformations)
 * and Part B (scene graph).
 *
 * Convention used everywhere: column vectors, p' = M · p, M = T · R · S
 * (scale first, rotate second, translate last). Product order is therefore
 * right to left.
 *
 * Scene graph (depth in brackets):
 *
 *   Gallery                                   (0)
 *   ├── Transform Cube     Part A, driven by the UI sliders
 *   ├── Left Cube          T·R·S
 *   ├── Melon Ball         T·S
 *   ├── Plate              T·S
 *   └── Moving Group       T                       (1)
 *       ├── Pivot Marker   S
 *       └── Rotating Arm   R_z(ω t)  ANIMATED      (2)
 *           ├── Arm Rod    T·S
 *           └── Satellite Joint  T·R_z(2.4 ω t)  ANIMATED   (3)
 *               ├── Satellite    S
 *               └── Moon         T·S               (4, leaf)
 *
 * Every node stores only its LOCAL matrix; world = parent.world · local is
 * computed by SceneNode.updateWorld(). Scale lives only in leaf nodes, so no
 * child inherits a squashed frame.
 */
import * as mat4 from '../math/mat4.js';
import { SceneNode } from './node.js';

export const ARM_SPEED = 0.75; // rad / s
export const JOINT_SPEED = 1.8; // rad / s

const T = mat4.translate;
const S = (x, y = x, z = x) => mat4.scale(x, y, z); // S(k) = uniform scale
const mul = (...ms) => ms.reduce((a, b) => mat4.multiply(a, b));

/** Linear-RGB colours. */
export const COLOURS = {
  accent: [0.90, 0.28, 0.05],
  cyan: [0.07, 0.50, 0.62],
  rod: [0.42, 0.38, 0.80],
  satellite: [0.80, 0.17, 0.33],
  moon: [0.85, 0.80, 0.35],
  marker: [0.80, 0.70, 0.12],
  melon: [0.30, 0.40, 0.07],
  plate: [0.60, 0.55, 0.42],
};

/** Slider state of Part A. */
export const PART_A_DEFAULTS = Object.freeze({
  tx: -0.20, ty: -0.42, tz: 0.55,
  axis: 'z', angle: 0.6,
  sx: 0.28, sy: 0.15, sz: 0.20,
  order: 'TRS',
});

const rotation = (axis, angle) =>
  axis === 'x' ? mat4.rotateX(angle) : axis === 'y' ? mat4.rotateY(angle) : mat4.rotateZ(angle);

/** T, R, S from the Part A state, and both products. */
export function composeBoth(a) {
  const t = T(a.tx, a.ty, a.tz);
  const r = rotation(a.axis, a.angle);
  const s = S(a.sx, a.sy, a.sz);
  return {
    TRS: mul(t, r, s), // S first, then R, then T
    SRT: mul(s, r, t), // T first, then R, then S: the translation is rotated and scaled too
  };
}

function makeNode(name, local, mesh, colour) {
  const n = new SceneNode(name, local);
  n.data = { mesh, colour };
  return n;
}

export function createGallery() {
  const root = makeNode('Gallery', mat4.identity());
  const controlled = root.addChild(makeNode('Transform Cube', mat4.identity(), 'cube', COLOURS.accent));
  root.addChild(makeNode('Left Cube',
    mul(T(-1.15, -0.45, 0.30), mat4.rotateY(0.45), S(0.24)), 'cube', COLOURS.cyan));
  root.addChild(makeNode('Melon Ball',
    mul(T(-0.72, -0.52, 0.36), S(0.26)), 'sphere', COLOURS.melon));
  root.addChild(makeNode('Plate',
    mul(T(0.45, -0.66, 0.42), mat4.rotateX(0.2), S(0.50, 0.05, 0.40)), 'sphere', COLOURS.plate));

  const group = root.addChild(makeNode('Moving Group', T(0.80, -0.22, 0.45), null));
  group.addChild(makeNode('Pivot Marker', S(0.11), 'cube', COLOURS.marker));
  const arm = group.addChild(makeNode('Rotating Arm', mat4.identity(), null));
  arm.addChild(makeNode('Arm Rod', mul(T(0.21, 0, 0), S(0.42, 0.05, 0.05)), 'cube', COLOURS.rod));
  const joint = arm.addChild(makeNode('Satellite Joint', T(0.43, 0, 0), null));
  joint.addChild(makeNode('Satellite', S(0.15), 'cube', COLOURS.satellite));
  const moon = joint.addChild(makeNode('Moon', mul(T(0.2, 0, 0), S(0.09)), 'sphere', COLOURS.moon));

  return { root, controlled, arm, joint, moon };
}

/**
 * Set the animated and UI-driven local matrices for animation time `time`
 * (seconds) and recompute every world matrix.
 */
export function updateGallery(gallery, partA, time) {
  const both = composeBoth(partA);
  gallery.controlled.local = both[partA.order];
  gallery.arm.local = mat4.rotateZ(ARM_SPEED * time);
  gallery.joint.local = mul(T(0.43, 0, 0), mat4.rotateZ(JOINT_SPEED * time));
  gallery.root.updateWorld();
  return both;
}

/**
 * Local axes of a node for the debug drawing: its origin and three unit
 * vectors, scale removed (the columns of the world matrix are normalised),
 * so the axes keep a readable length on every node.
 */
export function nodeFrame(world, length = 0.22) {
  const col = (c) => {
    const v = [world[c * 4], world[c * 4 + 1], world[c * 4 + 2]];
    const l = Math.hypot(...v) || 1;
    return v.map((x) => (x / l) * length);
  };
  const origin = [world[12], world[13], world[14]];
  return { origin, x: col(0), y: col(1), z: col(2) };
}
