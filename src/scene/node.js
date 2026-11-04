/**
 * Scene graph node — Part B.
 *
 * Each node holds a LOCAL transform (relative to its parent) and a WORLD
 * matrix computed by traversal:  world = parent.world · local.
 * Tests: tests/node.test.js
 */
import * as mat4 from '../math/mat4.js';

export class SceneNode {
  /**
   * @param {string} name   shown in the UI and in the report diagram
   * @param {Float32Array} [local]  local transform (default identity)
   */
  constructor(name, local = mat4.identity()) {
    this.name = name;
    this.local = local;
    this.world = mat4.identity();
    this.parent = null;
    this.children = [];
    /** Anything attached to the node: a mesh name, a colour, … */
    this.data = {};
  }

  /** Attach `child` under this node and return it (so calls can be chained). */
  addChild(child) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = this;
    this.children.push(child);
    return child;
  }

  /**
   * Set this.world from the parent's world matrix and this.local, then update
   * every child recursively. Called on the root with no argument.
   * @param {Float32Array} [parentWorld]  world matrix of the parent (identity for the root)
   */
  updateWorld(parentWorld) {
    this.world = parentWorld ? mat4.multiply(parentWorld, this.local) : new Float32Array(this.local);
    for (const child of this.children) child.updateWorld(this.world);
    return this.world;
  }

  /** Number of ancestors (the root has depth 0). */
  get depth() {
    let d = 0;
    for (let n = this.parent; n; n = n.parent) d++;
    return d;
  }

  /** Visit this node and all descendants depth-first: fn(node, depth). */
  traverse(fn, depth = 0) {
    fn(this, depth);
    for (const c of this.children) c.traverse(fn, depth + 1);
  }

  /** First node in the subtree with the given name, or null. */
  find(name) {
    if (this.name === name) return this;
    for (const c of this.children) {
      const hit = c.find(name);
      if (hit) return hit;
    }
    return null;
  }
}

// Re-exported for convenience when building trees: import { mat4 } from './node.js'
export { mat4 };
