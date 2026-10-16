import meshShader from './shaders/mesh.wgsl?raw';
import linesShader from './shaders/lines.wgsl?raw';
import { createShader, fragmentConstants } from './shader.js';
import { DEPTH_FORMAT } from './renderer.js';
import { cube } from '../scene/geometry.js';
import * as mat4 from '../math/mat4.js';

export class SceneGraphics {
  constructor(gpu, renderer) {
    this.gpu = gpu;
    this.renderer = renderer;
    this.objects = new Map();
    this.lines = new Map();
    const { device } = gpu;
    this.cube = cube();
    this.cubeBuffer = device.createBuffer({
      size: this.cube.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.cubeBuffer, 0, this.cube);

    const meshModule = createShader(device, meshShader, 'mesh');
    this.meshPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: meshModule,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: meshModule, entryPoint: 'fs',
        targets: [{ format: gpu.viewFormat }], constants: fragmentConstants(gpu),
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
    });

    const lineModule = createShader(device, linesShader, 'lines');
    this.linePipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: lineModule,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: lineModule, entryPoint: 'fs',
        targets: [{ format: gpu.viewFormat }], constants: fragmentConstants(gpu),
      },
      primitive: { topology: 'line-list' },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'less-equal' },
    });
  }

  cubeDraw(pass, id, model, vp, colour = [0.8, 0.45, 0.2]) {
    const { device } = this.gpu;
    let object = this.objects.get(id);
    if (!object) {
      const uniforms = device.createBuffer({
        size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = device.createBindGroup({
        layout: this.meshPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniforms } }],
      });
      object = { uniforms, bindGroup };
      this.objects.set(id, object);
    }
    const data = new Float32Array(36);
    data.set(mat4.multiply(vp, model), 0);
    data.set(model, 16);
    data.set([...colour, 1], 32);
    device.queue.writeBuffer(object.uniforms, 0, data);
    pass.setPipeline(this.meshPipeline);
    pass.setVertexBuffer(0, this.cubeBuffer);
    pass.setBindGroup(0, object.bindGroup);
    pass.draw(36);
    this.renderer.countDraw(36);
  }

  lineDraw(pass, id, vertices, vp) {
    if (!vertices.length) return;
    const { device } = this.gpu;
    let entry = this.lines.get(id);
    const length = vertices.length / 6;
    if (length % 2 !== 0) throw new Error('Line vertices must come in pairs');
    if (!entry) {
      const uniforms = device.createBuffer({
        size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = device.createBindGroup({
        layout: this.linePipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniforms } }],
      });
      entry = { uniforms, bindGroup, vertexBuffer: null, capacity: 0 };
      this.lines.set(id, entry);
    }
    if (entry.capacity < length) {
      entry.vertexBuffer?.destroy();
      entry.capacity = Math.max(128, 2 ** Math.ceil(Math.log2(length)));
      entry.vertexBuffer = device.createBuffer({
        size: entry.capacity * 24,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(entry.uniforms, 0, vp);
    device.queue.writeBuffer(entry.vertexBuffer, 0, new Float32Array(vertices));
    pass.setPipeline(this.linePipeline);
    pass.setBindGroup(0, entry.bindGroup);
    pass.setVertexBuffer(0, entry.vertexBuffer);
    pass.draw(length);
    this.renderer.countDraw(length);
  }
}

export function segment(output, a, b, colour) {
  output.push(...a, ...colour, ...b, ...colour);
}
