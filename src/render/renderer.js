/**
 * Frame setup: one render pass per frame into the canvas, with a depth buffer,
 * plus optional extra passes for inset viewports (picture-in-picture).
 * Draw calls are added through the callbacks given to render().
 */

export const DEPTH_FORMAT = 'depth24plus';

export class Renderer {
  /** @param {Awaited<ReturnType<import('./gpu.js').initWebGPU>>} gpu */
  constructor(gpu) {
    this.gpu = gpu;
    this.depth = null;
    /** Background colour in LINEAR RGB (a dark gallery wall). */
    this.clearColor = [0.012, 0.011, 0.010];
    /** Per-frame counters, read by the stats panel. Increment them via countDraw(). */
    this.stats = { draws: 0, vertices: 0 };
  }

  /** Call after every draw() so the panel can show vertices submitted per frame. */
  countDraw(vertexCount, instanceCount = 1) {
    this.stats.draws += 1;
    this.stats.vertices += vertexCount * instanceCount;
  }

  #ensureDepth(width, height) {
    if (this.depth && this.depth.width === width && this.depth.height === height) return;
    this.depth?.destroy();
    this.depth = this.gpu.device.createTexture({
      label: 'depth',
      size: [width, height],
      format: DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  /**
   * Record and submit one frame.
   * @param {(pass: GPURenderPassEncoder) => void} draw  draw calls of the main view
   * @param {{ rect: {x:number, y:number, w:number, h:number}, draw: (pass: GPURenderPassEncoder) => void }[]} [insets]
   *        extra views drawn on top of the main one, in device pixels (origin top-left)
   */
  render(draw, insets = []) {
    const { device, context, viewFormat, encodeSRGB } = this.gpu;
    this.stats.draws = 0;
    this.stats.vertices = 0;

    const target = context.getCurrentTexture();
    this.#ensureDepth(target.width, target.height);
    const colorView = target.createView({ format: viewFormat });
    const depthView = this.depth.createView();

    // Clear values are written as-is. With an '-srgb' view the GPU encodes them;
    // in the fallback path we encode the clear colour ourselves.
    const c = this.clearColor.map((x) => (encodeSRGB ? linearToSrgb(x) : x));

    const encoder = device.createCommandEncoder({ label: 'frame' });
    const pass = encoder.beginRenderPass({
      label: 'main pass',
      colorAttachments: [{
        view: colorView,
        clearValue: { r: c[0], g: c[1], b: c[2], a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    draw(pass);
    pass.end();

    // Insets: keep the colour already drawn, clear only the depth buffer, and
    // restrict drawing to the inset rectangle with a viewport + scissor.
    for (const inset of insets) {
      const x = Math.max(0, Math.round(inset.rect.x)), y = Math.max(0, Math.round(inset.rect.y));
      const w = Math.min(target.width - x, Math.round(inset.rect.w));
      const h = Math.min(target.height - y, Math.round(inset.rect.h));
      if (w < 2 || h < 2) continue;
      const insetPass = encoder.beginRenderPass({
        label: 'inset pass',
        colorAttachments: [{ view: colorView, loadOp: 'load', storeOp: 'store' }],
        depthStencilAttachment: {
          view: depthView,
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      insetPass.setViewport(x, y, w, h, 0, 1);
      insetPass.setScissorRect(x, y, w, h);
      inset.draw(insetPass);
      insetPass.end();
    }
    device.queue.submit([encoder.finish()]);
  }
}

function linearToSrgb(x) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}
