/** All user-visible settings, in one object, so a reset is a single assignment. */
import { PART_A_DEFAULTS } from './scene/gallery.js';

export function createState() {
  return {
    view: 'orbit',      // 'orbit' | 'inspection'
    inset: true,        // picture-in-picture of the inspection camera in the orbit view
    // debug drawings
    frustum: true,      // frustum of the orbit camera, seen from the inspection camera
    axes: false,        // local axes of every scene-graph node
    polygons: true,     // control polygon and control points
    casteljau: true,    // de Casteljau construction
    ghost: true,        // wireframe of the other composition order
    // animation
    paused: false,
    speed: 1,
    time: 0,            // seconds of animation (drives the arm and the joint)
    // Part A
    a: { ...PART_A_DEFAULTS },
    // Part D
    edit: true,         // control points can be dragged
    t: 0.38,            // parameter of the de Casteljau construction
    travel: 0,          // position of the travelling object along the curve, 0..1
    travelSpeed: 0.1,   // curve lengths per second
  };
}
