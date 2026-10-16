/**
 * Lit triangle meshes (Parts A and B).
 *
 * Same structure as render/painting.js — vertex buffer → uniform buffer →
 * bind group → pipeline → draw() — except that every draw gets its own
 * uniform slot (render/uniforms.js), so many objects can be drawn per frame.
 *
 *   const meshes = new MeshRenderer(gpu);
 *   const box = meshes.createMesh(cube());               // [x y z nx ny nz] per vertex
 *   // every frame:
 *   meshes.beginFrame();
 *   meshes.draw(pass, box, mvp, model, [r, g, b, 1], renderer);
 */
import meshWGSL from './shaders/mesh.wgsl?raw';
import { createShader, fragmentConstants } from './shader.js';
import { DEPTH_FORMAT } from './renderer.js';
import { UniformSlots } from './uniforms.js';

const FLOATS = 16 + 16 + 4; // mvp, model, colour  → 144 bytes

export class MeshRenderer {
  constructor(gpu) {
    const { device } = gpu;
    this.gpu = gpu;

    this.layout = device.createBindGroupLayout({
      label: 'mesh uniforms',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: FLOATS * 4 },
      }],
    });

    const module = createShader(device, meshWGSL, 'mesh');
    this.pipeline = device.createRenderPipeline({
      label: 'mesh',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
      vertex: {
        module, entryPoint: 'vs',
        buffers: [{
          arrayStride: 6 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },     // position
            { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' }, // normal
          ],
        }],
      },
      fragment: {
        module, entryPoint: 'fs',
        targets: [{ format: gpu.viewFormat }],
        constants: fragmentConstants(gpu),
      },
      // No culling: a negative scale (mirror) flips the winding, and the
      // depth test hides the back faces of closed meshes anyway.
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
    });

    this.slots = new UniformSlots(device, this.layout, FLOATS * 4, 'mesh uniforms');
    this.scratch = new Float32Array(FLOATS);
  }

  /**
   * Upload interleaved [x, y, z, nx, ny, nz] vertices (triangle-list).
   * @returns {{ buffer: GPUBuffer, vertexCount: number }}
   */
  createMesh(vertices, label = 'mesh') {
    const { device } = this.gpu;
    const buffer = device.createBuffer({
      label,
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, vertices);
    return { buffer, vertexCount: vertices.length / 6 };
  }

  /** Once per frame, before the first draw(). */
  beginFrame() {
    this.slots.beginFrame();
  }

  /**
   * @param {GPURenderPassEncoder} pass
   * @param {{buffer: GPUBuffer, vertexCount: number}} mesh
   * @param {Float32Array} mvp     P · V · M
   * @param {Float32Array} model   M (for the normals)
   * @param {number[]} colour      linear [r, g, b] or [r, g, b, lit]
   * @param {import('./renderer.js').Renderer} renderer  for the vertex counter
   */
  draw(pass, mesh, mvp, model, colour, renderer) {
    const u = this.scratch;
    u.set(mvp, 0);
    u.set(model, 16);
    u[32] = colour[0];
    u[33] = colour[1];
    u[34] = colour[2];
    u[35] = colour[3] ?? 1;
    const { bindGroup, offset } = this.slots.push(u);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup, [offset]);
    pass.setVertexBuffer(0, mesh.buffer);
    pass.draw(mesh.vertexCount);
    renderer.countDraw(mesh.vertexCount);
  }
}
