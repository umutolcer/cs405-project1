# CS405 Project 1

WebGPU scene based on a painting from the Sakıp Sabancı Museum collection. Parts A–E (transformations, scene graph, camera and projection, curves over the painting, integration) live in one application.

## Requirements

- Node.js 20.19 or newer
- A browser with WebGPU support (current Chrome or Edge recommended)

## Running the project

From the directory containing `package.json`:

```bash
npm install
npm run dev
```

Open the address printed by Vite, usually `http://localhost:5173/`.

To run the tests or create a production build:

```bash
npm test
npm run build
```

On Windows PowerShell, `npm.cmd` can be used instead of `npm` if script execution is restricted.

## Part A — Transformations

The orange cube has controls for its position, rotation, and size. The controls are in the **Part A · Transformations** panel.

| Control | Description |
| --- | --- |
| `translate x` | Moves the cube along the x-axis. |
| `translate y` | Moves the cube along the y-axis. |
| `translate z` | Moves the cube along the z-axis. |
| `rotation` | Rotates the cube around the z-axis, in radians. |
| `scale` | Changes the cube's uniform scale. |
| `active order` | Switches between `T · R · S` and `S · R · T`. |

Both model matrices are displayed in the panel. With column vectors, `T · R · S` scales first, rotates second, and translates last. `S · R · T` applies these operations in the opposite order, producing a different result.

The matrix functions are implemented in `src/math/mat4.js`, with vector operations in `src/math/vec3.js`.

## Part B — Scene Graph

The scene uses parent-child nodes with local and world transforms. Each node's world matrix is calculated from its parent's world matrix and its own local matrix:

`M_world = M_parent_world · M_local`

The hierarchy is:

```text
Gallery
├── Transform Cube
├── Left Cube
└── Moving Group
    ├── Rotating Arm
    │   ├── Arm Rod
    │   └── Satellite
    └── Pivot Marker
```

The rotating arm carries its child objects as it moves, demonstrating how transforms propagate through the hierarchy.

The **Part B · Scene graph** panel includes a `node axes` toggle to show the local coordinate axes of each node: red for x, green for y, and blue for z. The world matrix of the `Satellite` node is displayed and updates during animation.

Scene graph traversal and world-matrix updates are implemented in `src/scene/node.js`. The scene setup and animation are in `src/scene/scene.js`.

## Part C — Camera and projection

`lookAt`, `perspective` (WebGPU depth range z ∈ [0, 1]) and `orthographic` are in `src/math/mat4.js`; the camera object is in `src/scene/camera.js`.

| Control | Description |
| --- | --- |
| Drag on empty space | Orbits the camera around its target. |
| Mouse wheel | Zooms (changes the orbit radius). |
| `projection` | Switches between perspective and orthographic at run time. |
| `fov`, `near`, `far`, `ortho height` | Camera parameters; eye, target, fov, near and far are shown on screen. |
| `view` (Part E panel) | `Fixed inspection camera` shows the scene from a second, fixed camera together with the frustum of the orbit camera. |

`lookAt` handles the case where `up` is parallel to the view direction by choosing an alternative up vector.

## Part D — Curves over the painting

| Control | Description |
| --- | --- |
| `curve family` | C¹ piecewise cubic Bézier (3 segments), Catmull–Rom spline, or uniform cubic B-spline. |
| `edit points` | Enables dragging of the coloured control cubes in the plane of the painting. Shift + click moves the nearest point to the cursor. |
| `control polygons` | Shows or hides control polygons and control points. |
| `de Casteljau` + `construction t` | Draws the de Casteljau construction of the first Bézier segment for the chosen t. |
| `speed`, `pause animation` | Controls the object moving along the curve, oriented by the curve tangent. |
| `Export curve JSON` | Downloads the curve with control points in normalised painting coordinates (u, v ∈ [0, 1]); an example is `curve-kavunlu.json`. |

C¹ continuity at the joints of the Bézier curve is kept while dragging: `P₂(i) = 2·P₃(i) − P₁(i+1)` (see `c1NextControl` in `src/math/curves.js`).

## Part E — Integration

All parts run in one page. The **Part E · View** panel switches between the orbit and inspection cameras, toggles the frustum and the node axes, and resets the scene (button or `R` key). `Space` pauses the animation. The stats box shows frame time, draw calls and the number of vertices submitted per frame.

## Project layout

```text
src/math/     vec3, mat4, curves
src/scene/    scene graph nodes, scene setup, camera, curve export
src/render/   WebGPU device, pipelines, shaders, draw helpers
src/ui/       control panel, pointer input, stats
tests/        unit tests (npm test)
```

## Painting and rendering

Choose a painting using the **Painting** selector. The default is **Şeker Ahmed Paşa — Kavunlu Natürmort**. The painting is displayed as a textured quad, with the 3D objects positioned in front of it.

The application uses WebGPU and WGSL. The render loop and controls are organized across `src/main.js`, `src/render/`, and `src/ui/`. Frame time and vertex count are shown in the interface.

## Conventions

- Matrices use a column-major `Float32Array(16)` layout.
- Transformations act on column vectors, and matrix products are evaluated right to left.
- Rotation angles are in radians.
- The coordinate system is right-handed.
