# CS405 Project 1 — Transformations, Projection & Curves from a Painting

One WebGPU application (WebGPU + WGSL, plain JavaScript, Vite) that turns
**Şeker Ahmed Paşa — *Kavunlu Natürmort*** (Sakıp Sabancı Museum collection)
into a small 3D scene. The painting hangs in the scene as a textured quad;
objects stand in front of it, a camera orbits around them, and a curve traces
the outline of the melon. No maths or scene-graph library is used: the matrix
code (`src/math/`) is written from scratch.

```
p_clip = P · V · M · p_object        (column vectors, column-major Float32Array)
```

## Run it

Requires Node.js ≥ 20.19 and a browser with WebGPU (current Chrome or Edge;
Safari 26+; Firefox 141+ on Windows).

```bash
npm install
npm run dev
```

Open the address Vite prints (usually `http://localhost:5173/`).

```bash
npm test          # 88 unit tests (maths, curves, scene graph, camera, picking)
npm run build     # production build in dist/ (npm run preview to serve it)
```

## What is where

| Part | Points | Code | Where to look in the app |
| --- | --- | --- | --- |
| A · Transformations | 20 | `src/math/mat4.js`, `src/scene/gallery.js` | *Part A* panel |
| B · Scene graph | 15 | `src/scene/node.js`, `src/scene/gallery.js` | *Part B* panel, node axes |
| C · Camera and projection | 20 | `src/math/mat4.js`, `src/scene/camera.js`, `src/scene/orbit.js` | *Part C* panel, inset, inspection view |
| D · Curves | 25 | `src/math/curves.js`, `src/scene/trace.js` | *Part D* panel |
| E · Integration | 10 | `src/main.js`, `src/render/`, `src/ui/` | *Part E* panel, frame-time box |

Project layout:

```text
src/math/     vec3, mat4 (own matrix library), curves
src/scene/    scene graph node, gallery (parts A and B), camera, orbit, traced curve, painting space
src/render/   WebGPU device, renderer (main pass + inset pass), pipelines, WGSL shaders, ribbon geometry
src/ui/       control panel, readouts, pointer input, stats box
tests/        node:test unit tests
report/       report.html and its figures
report.pdf    the report
curve-kavunlu.json   the traced curve, exported by the application
```

## Conventions

- Column vectors: `p' = M · p`; the rightmost matrix acts first.
- Matrices are column-major `Float32Array(16)`, uploaded unchanged to uniform buffers.
- **`M = T · R · S` is used everywhere** (scale, then rotate, then translate);
  a node's world matrix is `parent.world · local`.
- Right-handed coordinates; the camera looks down its own −z axis.
- WebGPU clip space: depth `z ∈ [0, 1]` (not OpenGL's `[−1, 1]`).
- The painting is the quad `x ∈ [−a, a]`, `y ∈ [−1, 1]` in the plane `z = 0`
  (`a = 1280 / 893`); objects in front of it have `z > 0`.
- Painting coordinates `(u, v) ∈ [0, 1]²`: `u` right, `v` down, origin at the top-left of the image.

## Controls

Mouse (in the orbit view)

| Action | Effect |
| --- | --- |
| Drag on empty space | Orbit the camera around the painting |
| Mouse wheel | Zoom |
| Drag a control point | Move it in the plane of the painting (Bézier: the C¹ condition is kept) |
| Shift + click | Move the nearest control point to the cursor |

Keys: `R` reset · `Space` pause · `V` switch orbit / inspection view · `A` node axes.
The `☰` button hides the side panel.

**Part E · View and debug**

| Control | Effect |
| --- | --- |
| `view` | *Orbit camera* (mouse-controlled) or *Fixed inspection camera* (shows the orbit camera's frustum) |
| `inspection inset` | Picture-in-picture of the inspection camera while orbiting |
| `Front view of the painting` | Puts the orbit camera straight in front of the painting, fitted to the window |
| `Reset scene and camera` | Restores every setting, the camera and the traced curve |
| `pause animation`, `animation speed` | Stop / scale the animation clock |
| `node axes` | Local axes of every scene-graph node (red x, green y, blue z) |
| `camera frustum` | Frustum of the orbit camera (near plane cyan, far plane pink) |
| `control polygon and points` | Control polygon and draggable control points |
| `de Casteljau construction` | Repeated linear interpolation at parameter *t* |
| `wireframe of the other order` | Thin cube drawn with the composition order that is **not** selected |

The box at the top of the panel shows the frame time, CPU time per frame, the
number of draw calls and the number of vertices submitted per frame, and the GPU
reported by WebGPU.

**Part A** — `translate x/y/z`, `rotate about` (x, y or z), `rotation (rad)`,
`scale x/y/z` drive the orange cube. `order` switches between `M = T·R·S` and
`M = S·R·T`; both 4×4 matrices are printed below the sliders and the one in
use is marked. Three more objects (cyan cube, green sphere, plate) are placed
with `T·R·S` in front of the painting.

**Part B** — the tree is listed in the panel. `animation time` scrubs the
clock; the panel prints the arm and joint angles and the world matrix of the
leaf node *Moon* (used for the hand check in the report).

**Part C** — `projection` (perspective / orthographic, switchable at run time),
`fov`, `near`, `far`, `ortho height`. The panel shows eye, target, fov, near and
far, the far/near ratio and the depth resolution (24-bit) at the painting.

**Part D** — `curve family`: C¹ piecewise cubic Bézier (3 segments),
Catmull–Rom spline (passes through every point) or uniform cubic B-spline.
`de Casteljau t` chooses the parameter of the construction (the segment that
contains it is drawn), `object position u` / `object speed` move the box along
the curve (oriented by the tangent), `Export curve JSON` downloads the curve
with the control points in normalised coordinates (see `curve-kavunlu.json`).

## Report

`report.pdf` (source: `report/report.html`) contains the derivations,
screenshots of every part, measured frame times and the exported JSON.
