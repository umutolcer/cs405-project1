/**
 * Coloured lines: per-node debug axes and wireframes (Parts A, B). The same
 * renderer can draw the camera frustum (Part C) and curves / control polygons
 * (Part D): use update() for geometry that changes every frame and
 * topology 'line-strip' for a polyline.
 *
 *   const lines = new LineRenderer(gpu);
 *   const ax = lines.create(axes(1));                 // [x y z r g b] per vertex
 *   // every frame:
 *   lines.beginFrame();
 *   lines.draw(pass, ax, mvp, renderer, { overlay: true });
 */
import linesWGSL from './shaders/lines.wgsl?raw';
import { createShader, fragmentConstants } from './shader.js';
import { DEPTH_FORMAT } from './renderer.js';
import { UniformSlots } from './uniforms.js';

const FLOATS = 16; // mvp

export class LineRenderer {
  constructor(gpu) {
    const { device } = gpu;
    this.gpu = gpu;
    this.layout = device.createBindGroupLayout({
      label: 'line uniforms',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: FLOATS * 4 },
      }],
    });
    this.pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.module = createShader(device, linesWGSL, 'lines');
    this.pipelines = new Map();
    this.slots = new UniformSlots(device, this.layout, FLOATS * 4, 'line uniforms');
    this.scratch = new Float32Array(FLOATS);
  }

  /**
   * One pipeline per (topology, overlay) pair, created on first use.
   * overlay = true draws on top of everything (no depth test), which is what
   * debug drawings want; overlay = false hides lines behind objects.
   */
  #pipeline(topology, overlay) {
    const key = `${topology}|${overlay}`;
    let p = this.pipelines.get(key);
    if (p) return p;
    const { device, viewFormat } = this.gpu;
    p = device.createRenderPipeline({
      label: `lines ${key}`,
      layout: this.pipelineLayout,
      vertex: {
        module: this.module, entryPoint: 'vs',
        buffers: [{
          arrayStride: 6 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },     // position
            { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' }, // colour
          ],
        }],
      },
      fragment: {
        module: this.module, entryPoint: 'fs',
        targets: [{ format: viewFormat }],
        constants: fragmentConstants(this.gpu),
      },
      primitive: { topology },
      depthStencil: overlay
        ? { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'always' }
        : { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.pipelines.set(key, p);
    return p;
  }

  /**
   * Upload interleaved [x, y, z, r, g, b] vertices.
   * @returns {{ buffer: GPUBuffer, vertexCount: number, capacity: number, label: string }}
   */
  create(vertices, label = 'lines') {
    const { device } = this.gpu;
    const capacity = Math.max(vertices.byteLength, 24);
    const buffer = device.createBuffer({
      label, size: capacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    if (vertices.byteLength) device.queue.writeBuffer(buffer, 0, vertices);
    return { buffer, vertexCount: vertices.length / 6, capacity, label };
  }

  /** Replace the vertices of `lines` (grows the buffer when needed). */
  update(lines, vertices) {
    const { device } = this.gpu;
    if (vertices.byteLength > lines.capacity) {
      lines.buffer.destroy(); // safe: work already submitted keeps it alive until done
      lines.capacity = Math.max(vertices.byteLength, lines.capacity * 2);
      lines.buffer = device.createBuffer({
        label: lines.label, size: lines.capacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (vertices.byteLength) device.queue.writeBuffer(lines.buffer, 0, vertices);
    lines.vertexCount = vertices.length / 6;
  }

  /** Once per frame, before the first draw(). */
  beginFrame() {
    this.slots.beginFrame();
  }

  /**
   * @param {GPURenderPassEncoder} pass
   * @param {{buffer: GPUBuffer, vertexCount: number}} lines
   * @param {Float32Array} mvp  P · V · M
   * @param {import('./renderer.js').Renderer} renderer
   * @param {{ topology?: 'line-list'|'line-strip'|'point-list', overlay?: boolean }} [opts]
   */
  draw(pass, lines, mvp, renderer, { topology = 'line-list', overlay = false } = {}) {
    if (!lines.vertexCount) return;
    this.scratch.set(mvp);
    const { bindGroup, offset } = this.slots.push(this.scratch);
    pass.setPipeline(this.#pipeline(topology, overlay));
    pass.setBindGroup(0, bindGroup, [offset]);
    pass.setVertexBuffer(0, lines.buffer);
    pass.draw(lines.vertexCount);
    renderer.countDraw(lines.vertexCount);
  }
}
