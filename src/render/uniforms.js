/**
 * Per-draw uniforms for many draws inside one render pass.
 *
 * queue.writeBuffer() runs BEFORE the frame's commands execute, so draws that
 * share one uniform buffer would all see the last value written. Instead,
 * every draw gets its own 256-byte slot in a larger buffer and selects it with
 * a dynamic offset:  pass.setBindGroup(0, bindGroup, [offset]).
 *
 * Slots are recycled every frame: call beginFrame() once per frame, before the
 * first push(). When a frame needs more slots, another chunk (buffer + bind
 * group) is added and kept for later frames.
 */

/** Dynamic offsets must be multiples of minUniformBufferOffsetAlignment (≤ 256 on every device). */
export const SLOT_BYTES = 256;

export class UniformSlots {
  /**
   * @param {GPUDevice} device
   * @param {GPUBindGroupLayout} layout  binding 0 = uniform buffer with hasDynamicOffset: true
   * @param {number} bytes  size of one draw's uniform struct (≤ SLOT_BYTES)
   * @param {string} label
   * @param {number} slotsPerChunk
   */
  constructor(device, layout, bytes, label = 'uniform slots', slotsPerChunk = 128) {
    if (bytes > SLOT_BYTES) throw new Error(`UniformSlots: ${bytes} bytes do not fit in a ${SLOT_BYTES}-byte slot`);
    this.device = device;
    this.layout = layout;
    this.bytes = bytes;
    this.label = label;
    this.slotsPerChunk = slotsPerChunk;
    this.chunks = [];
    this.used = 0;
  }

  beginFrame() {
    this.used = 0;
  }

  /**
   * Copy `data` into the next free slot.
   * @param {Float32Array} data
   * @returns {{ bindGroup: GPUBindGroup, offset: number }}
   */
  push(data) {
    const chunkIndex = Math.floor(this.used / this.slotsPerChunk);
    if (chunkIndex === this.chunks.length) this.chunks.push(this.#createChunk());
    const chunk = this.chunks[chunkIndex];
    const offset = (this.used % this.slotsPerChunk) * SLOT_BYTES;
    // writeBuffer copies the data immediately, so `data` may be reused afterwards.
    this.device.queue.writeBuffer(chunk.buffer, offset, data.buffer, data.byteOffset, data.byteLength);
    this.used++;
    return { bindGroup: chunk.bindGroup, offset };
  }

  #createChunk() {
    const buffer = this.device.createBuffer({
      label: `${this.label} #${this.chunks.length}`,
      size: this.slotsPerChunk * SLOT_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = this.device.createBindGroup({
      label: `${this.label} #${this.chunks.length}`,
      layout: this.layout,
      entries: [{ binding: 0, resource: { buffer, size: this.bytes } }],
    });
    return { buffer, bindGroup };
  }
}
