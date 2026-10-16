# CS405 Project 1 — Transformations, Projection & Curves

## Requirements

- Node.js 20.19 or newer
- Current WebGPU-capable browser (Chrome or Edge recommended)
- A local development server (Vite)

## Run

Open a terminal in the project directory (where `package.json` is located):

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Do not open `index.html` directly as a file. Use `npm test` for the supplied tests and `npm run build` to build production assets. The application uses only JavaScript, WGSL and WebGPU; no external graphics/mathematics libraries are used.

## Controls

| Group | Control | Action |
| --- | --- | --- |
| Painting | painting | Chooses one of the five SSM paintings. |
| Part A | translate x/y/z | Moves the orange object. |
| Part A | rotation | Rotates the object around its z axis (radians). |
| Part A | scale | Uniformly scales the orange object. |
| Part A | active order | Switches the orange object's model matrix between `T·R·S` and `S·R·T`. Both resulting matrices stay visible. |
| Part B | node axes | Draws local x/y/z axes (red/green/blue) for each graph node. |
| Part D | curve family | Switches between three-segment C¹ Bézier, Catmull–Rom, and cubic B-spline curves. |
| Part D | edit points | Enables selection and dragging of control points over the painting. |
| Part D | control polygons | Displays the control-point markers and guide lines. |
| Part D | de Casteljau | Displays successive interpolated levels for the first Bézier segment. |
| Part D | construction t | Changes the construction parameter independently from the moving object. |
| Part D | pause animation / speed | Stops/restarts the curve-following object and adjusts its speed. |
| Part D | Export curve JSON | Downloads normalized `(u,v)` coordinates with the current painting name. |
| Part C | projection | Chooses the orbit camera's perspective or orthographic projection. |
| Part C | fov / near / far / ortho height | Edits the orbit camera's projection parameters. |
| Part E | view | Switches between the orbit camera and the fixed inspection camera. |
| Part E | inspection frustum | Toggles the orbit camera's frustum in inspection view. |
| Part E | debug axes | Toggles all local coordinate axes. |
| Part E | Reset scene and camera | Restores the initial view, transforms and curve control points. |

**Mouse**: left-drag empty space to orbit, mouse wheel to zoom. When curve editing is enabled, click and drag a coloured control cube to move it. Shift-click moves the nearest control point to the clicked location, and it can then be dragged. Camera orbit and curve editing work in the orbit view; the inspection camera stays fixed. **Keyboard**: `R` resets and `Space` pauses or resumes the curve follower.

The default painting is **Şeker Ahmed Paşa, Kavunlu Natürmort**, with Bézier control points placed along the melon contour. When choosing another painting, adjust the points to its specific contour before exporting; the initial points are examples for the default image.

## Code layout

- `src/math/vec3.js`: 3D vector operations.
- `src/math/mat4.js`: column-major 4×4 matrices, transformations, lookAt and WebGPU projections.
- `src/math/curves.js`: Bernstein bases, cubic Bézier, de Casteljau, C¹ joints, Catmull–Rom and B-spline.
- `src/scene/node.js`: hierarchical world-matrix traversal.
- `src/scene/scene.js`: scene graph, animations, editable control points, path geometry and interaction.
- `src/scene/curveExport.js`: normalized curve export.
- `src/render/objects.js`: GPU pipelines for cubes and line overlays.
- `src/render/shaders/mesh.wgsl` and `lines.wgsl`: WGSL vertex and fragment shaders.
- `src/main.js`: canvas, panel, orbit and inspection cameras, frame loop.
- `src/ui/`: controls, statistics, mouse events.
- `public/paintings/`: bundled museum images.
- `tests/`: original course tests, unchanged.

## Coordinate conventions

Matrices are `Float32Array(16)` in column-major layout and multiply column vectors from the left. `multiply(A,B)` represents `A·B`, so the rightmost transform is applied first. Rotations use radians; the world is right-handed, with the camera looking down negative z in view space. WebGPU's normalized depth interval is `[0,1]`.

Painting-space world coordinates are `x∈[-a,a]`, `y∈[-1,1]`, where `a` is image width divided by image height, with painting at `z=0` and 3D objects at positive z. JSON control points are normalized to `u,v∈[0,1]` with v increasing downward.

## Scene hierarchy

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

The `Satellite` world matrix is displayed under Part B. The curve follower moves over the painting according to the current curve and rotates to align with the tangent. Lines, control points, meshes, the painting and the two cameras share one render loop.

## Submission

The course handout also requires a separate 3–5-page PDF report with derivations, screenshots, measured frame times, GPU information, and a description of debugging. Gather these from your own machine and application; see `REPORT_NOTES.md` for a guide. Add your own `report.pdf` before submission.

Create a **private** GitHub repository and invite the TA account `m-javadian-farzaneh` as directed on SUCourse. Initialize and connect your local repository (replace `<username>` with your GitHub username):

```bash
git init
git branch -M main
git remote add origin https://github.com/<username>/cs405-project1.git
```

For the final submission, commit the finished project, then create and push tag `project1-final`:

```bash
git add .
git commit -m "Complete CS405 Project 1"
git tag project1-final
git push origin main
git push origin project1-final
```

Do not create the final tag until your source, exported JSON and `report.pdf` are ready. The assignment deadline is **8 November 2026 at 23:59 Istanbul time**.
