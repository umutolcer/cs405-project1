# CS405 Project 1

WebGPU scene based on a painting from the Sakıp Sabancı Museum collection. This README describes the transformation controls and scene graph used in Parts A and B.

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

## Painting and rendering

Choose a painting using the **Painting** selector. The default is **Şeker Ahmed Paşa — Kavunlu Natürmort**. The painting is displayed as a textured quad, with the 3D objects positioned in front of it.

The application uses WebGPU and WGSL. The render loop and controls are organized across `src/main.js`, `src/render/`, and `src/ui/`. Frame time and vertex count are shown in the interface.

## Conventions

- Matrices use a column-major `Float32Array(16)` layout.
- Transformations act on column vectors, and matrix products are evaluated right to left.
- Rotation angles are in radians.
- The coordinate system is right-handed.
