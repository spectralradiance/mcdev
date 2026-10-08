// Chapters 43-44: the host side of the wavefront tracer. It creates the buffers and pipelines and records one
// sample's worth of dispatches. Queue lengths never come back to the CPU: small prepare kernels write them into an
// indirect-dispatch buffer, so the whole sample is one submission.

import shaderSource from './shaders/wavefront.wgsl?raw';
import type { SceneData } from './wasm';

export interface TracerOptions {
  width: number;
  height: number;
  maxDepth: number;
  sortMaterials: boolean;
  seed?: number;
  // 0 Whitted, 1 path tracing, 2 path tracing with NEE and MIS (the default). See MODE_* in wavefront.wgsl.
  mode?: number;
}

// Must match the counter slots in wavefront.wgsl.
const COUNTERS = 48;
const ALIVE = 16;
const WORKGROUP = 64;
const MATERIAL_CLASSES = [0, 1, 2, 3];
const UNSORTED = 99;

export type Stage = 'generate' | 'extend' | 'shade' | 'connect';
export const STAGES: Stage[] = ['generate', 'extend', 'shade', 'connect'];

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

type Vec = [number, number, number];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec): Vec => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

export class WavefrontTracer {
  readonly pathCount: number;
  samples = 0;
  // Milliseconds per sample in each stage, from GPU timestamps; empty when the adapter can't time passes.
  stageTimes: Partial<Record<Stage, number>> = {};

  protected readonly params: GPUBuffer;
  protected readonly sceneBuffer: GPUBuffer;
  protected readonly paths: GPUBuffer;
  private readonly counters: GPUBuffer;
  readonly image: GPUBuffer;
  readonly features: GPUBuffer;
  protected readonly layout0: GPUBindGroupLayout;
  protected readonly group0: GPUBindGroup;
  private readonly group1: GPUBindGroup;
  private readonly dispatchArgs: GPUBuffer;
  private readonly pipelines: Record<string, GPUComputePipeline> = {};
  private readonly shadePipelines: GPUComputePipeline[];
  private readonly timing?: { set: GPUQuerySet; resolve: GPUBuffer; readback: GPUBuffer; labels: Stage[]; busy: boolean };
  protected readonly buffers: GPUBuffer[] = [];
  // Chapter 47: when set, direct light at the primary hit is left to ReSTIR.
  protected restir = false;
  // The scene's camera block: (position, halfHeight), (forward, aperture), (right, focus distance), (up, 0).
  protected readonly view: Float32Array<ArrayBuffer>;

  constructor(
    protected readonly device: GPUDevice,
    protected readonly scene: SceneData,
    readonly options: TracerOptions,
  ) {
    const n = options.width * options.height;
    this.pathCount = n;
    const storage = GPUBufferUsage.STORAGE;
    this.params = this.make(80, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'params');
    this.sceneBuffer = this.make(scene.words.byteLength, storage | GPUBufferUsage.COPY_DST, 'scene');
    device.queue.writeBuffer(this.sceneBuffer, 0, scene.words);
    this.paths = this.make(4 * n * 16, storage, 'paths');
    const queues = this.make(7 * n * 4, storage, 'queues');
    const shadowRays = this.make(3 * n * 16, storage, 'shadow rays');
    this.counters = this.make(COUNTERS * 4, storage | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, 'counters');
    this.image = this.make(n * 16, storage | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, 'image');
    this.features = this.make(2 * n * 16, storage | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, 'features');
    this.dispatchArgs = this.make(7 * 3 * 4, storage | GPUBufferUsage.INDIRECT, 'dispatch args');
    const v = scene.bases.view * 4;
    this.view = new Float32Array(scene.words.buffer, scene.words.byteOffset + v * 4, 16).slice();

    const layout0 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        ...[2, 3, 4, 5, 6, 7].map((binding) => ({
          binding,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' as const },
        })),
      ],
    });
    const layout1 = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }],
    });
    // Kernels dispatched indirectly must not also bind the argument buffer as writable storage.
    const tracing = device.createPipelineLayout({ bindGroupLayouts: [layout0] });
    const preparing = device.createPipelineLayout({ bindGroupLayouts: [layout0, layout1] });
    const buffers = [this.params, this.sceneBuffer, this.paths, queues, shadowRays, this.counters, this.image, this.features];
    this.layout0 = layout0;
    this.group0 = device.createBindGroup({
      layout: layout0,
      entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    this.group1 = device.createBindGroup({ layout: layout1, entries: [{ binding: 0, resource: { buffer: this.dispatchArgs } }] });

    const module = device.createShaderModule({ code: shaderSource, label: 'wavefront' });
    const pipeline = (entryPoint: string, layout: GPUPipelineLayout, constants?: Record<string, number>) =>
      device.createComputePipeline({ layout, compute: { module, entryPoint, constants }, label: entryPoint });
    for (const name of ['generate', 'extend', 'connect']) this.pipelines[name] = pipeline(name, tracing);
    for (const name of ['prepareExtend', 'prepareShade', 'prepareConnect']) this.pipelines[name] = pipeline(name, preparing);
    this.shadePipelines = [...MATERIAL_CLASSES, UNSORTED].map((k) => pipeline('shade', tracing, { MATERIAL_CLASS: k }));

    if (device.features.has('timestamp-query')) {
      const labels: Stage[] = ['generate'];
      for (let d = 0; d <= options.maxDepth; ++d) labels.push('extend', 'shade', 'connect');
      const count = 2 * labels.length;
      this.timing = {
        set: device.createQuerySet({ type: 'timestamp', count }),
        resolve: this.make(count * 8, GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC, 'timestamps'),
        readback: this.make(count * 8, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, 'timestamp readback'),
        labels,
        busy: false,
      };
    }
    this.reset();
  }

  protected make(size: number, usage: number, label: string): GPUBuffer {
    const buffer = this.device.createBuffer({ size: Math.max(16, size), usage, label });
    this.buffers.push(buffer);
    return buffer;
  }

  // Where the scene's camera starts, and what it looks at: the focus distance along its forward axis.
  initialPose(): CameraPose {
    const v = this.scene.words.buffer.slice(this.scene.words.byteOffset + this.scene.bases.view * 16, this.scene.words.byteOffset + this.scene.bases.view * 16 + 64);
    const f = new Float32Array(v);
    const position: Vec = [f[0], f[1], f[2]];
    return { position, target: [position[0] + f[4] * f[11], position[1] + f[5] * f[11], position[2] + f[6] * f[11]] };
  }

  // Moves the camera, keeping its field of view, aperture, and focus distance.
  setCamera(pose: CameraPose): void {
    const forward = normalize(sub(pose.target, pose.position));
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    this.view.set([...pose.position, this.view[3], ...forward, this.view[7], ...right, this.view[11], ...up, 0]);
    this.device.queue.writeBuffer(this.sceneBuffer, this.scene.bases.view * 16, this.view);
  }

  // Hooks for subclasses: extra passes before the sample, after the primary rays are traced, and after the sample.
  protected beforeSample(_encoder: GPUCommandEncoder): void {}
  protected afterPrimary(_encoder: GPUCommandEncoder): void {}
  protected afterSample(_encoder: GPUCommandEncoder): void {}

  static async compile(device: GPUDevice, code = shaderSource): Promise<void> {
    const info = await device.createShaderModule({ code }).getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === 'error');
    if (errors.length) {
      throw new Error(errors.map((m) => `wavefront.wgsl:${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
    }
  }

  reset(): void {
    this.samples = 0;
    const zero = (buffer: GPUBuffer) => this.device.queue.writeBuffer(buffer, 0, new Uint8Array(buffer.size));
    zero(this.image);
    zero(this.features);
    zero(this.counters);
  }

  protected writeParams(): void {
    const { width, height, maxDepth, sortMaterials, seed = 0, mode = 2 } = this.options;
    const b = this.scene.bases;
    this.device.queue.writeBuffer(this.params, 0, new Uint32Array([
      width, height, maxDepth, this.samples,
      seed, this.scene.lightCount, this.pathCount, sortMaterials ? 1 : 0,
      b.nodes, b.primitives, b.spheres, b.quads,
      b.triangles, b.materials, b.lights, b.view,
      this.restir ? 1 : 0, mode, this.scene.mediaBase ?? 0, 0,
    ]));
  }

  // One sample per pixel for the whole image: generate, then extend, shade, and connect once per bounce.
  renderSample(): void {
    this.writeParams();
    const encoder = this.device.createCommandEncoder();
    this.beforeSample(encoder);
    const timing = this.timing && !this.timing.busy ? this.timing : undefined;
    let pass = 0;
    const begin = () => {
      const timestampWrites = timing
        ? { querySet: timing.set, beginningOfPassWriteIndex: 2 * pass, endOfPassWriteIndex: 2 * pass + 1 }
        : undefined;
      pass += 1;
      const compute = encoder.beginComputePass({ timestampWrites });
      compute.setBindGroup(0, this.group0);
      return compute;
    };
    const prepare = (compute: GPUComputePassEncoder, name: string) => {
      compute.setPipeline(this.pipelines[name]);
      compute.setBindGroup(1, this.group1);
      compute.dispatchWorkgroups(1);
    };

    let compute = begin();
    compute.setPipeline(this.pipelines.generate);
    compute.dispatchWorkgroups(Math.ceil(this.pathCount / WORKGROUP));
    compute.end();
    for (let depth = 0; depth <= this.options.maxDepth; ++depth) {
      compute = begin();
      prepare(compute, 'prepareExtend');
      compute.setPipeline(this.pipelines.extend);
      compute.dispatchWorkgroupsIndirect(this.dispatchArgs, 0);
      compute.end();
      if (depth === 0) this.afterPrimary(encoder);

      compute = begin();
      prepare(compute, 'prepareShade');
      this.shadePipelines.forEach((shade, slot) => {
        compute.setPipeline(shade);
        compute.dispatchWorkgroupsIndirect(this.dispatchArgs, 12 * (1 + slot));
      });
      compute.end();

      compute = begin();
      prepare(compute, 'prepareConnect');
      compute.setPipeline(this.pipelines.connect);
      compute.dispatchWorkgroupsIndirect(this.dispatchArgs, 12 * 6);
      compute.end();
    }
    this.afterSample(encoder);
    if (timing) {
      encoder.resolveQuerySet(timing.set, 0, 2 * pass, timing.resolve, 0);
      encoder.copyBufferToBuffer(timing.resolve, 0, timing.readback, 0, timing.readback.size);
    }
    this.device.queue.submit([encoder.finish()]);
    this.samples += 1;
    if (timing) {
      timing.busy = true;
      timing.readback.mapAsync(GPUMapMode.READ).then(() => {
        const stamps = new BigUint64Array(timing.readback.getMappedRange().slice(0));
        timing.readback.unmap();
        timing.busy = false;
        const times: Partial<Record<Stage, number>> = {};
        timing.labels.forEach((label, i) => {
          times[label] = (times[label] ?? 0) + Number(stamps[2 * i + 1] - stamps[2 * i]) / 1e6;
        });
        this.stageTimes = times;
      }, () => {});  // rejected when the tracer is destroyed first
    }
  }

  protected async read(buffer: GPUBuffer, size = buffer.size): Promise<ArrayBuffer> {
    const readback = this.device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(buffer, 0, readback, 0, size);
    this.device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const data = readback.getMappedRange().slice(0);
    readback.unmap();
    readback.destroy();
    return data;
  }

  // The mean radiance so far, linear RGB, three floats per pixel.
  async readImage(): Promise<Float32Array> {
    const sums = new Float32Array(await this.read(this.image));
    const out = new Float32Array(this.pathCount * 3);
    for (let i = 0; i < this.pathCount; ++i) {
      for (let c = 0; c < 3; ++c) out[3 * i + c] = sums[4 * i + c] / Math.max(1, this.samples);
    }
    return out;
  }

  // Average paths still alive at the start of each bounce, per sample: how fast the wavefront drains.
  async readAlive(): Promise<number[]> {
    const counts = new Uint32Array(await this.read(this.counters));
    return Array.from(counts.slice(ALIVE, ALIVE + this.options.maxDepth + 1), (c) => c / Math.max(1, this.samples));
  }

  destroy(): void {
    this.buffers.forEach((b) => b.destroy());
    this.timing?.set.destroy();
  }
}
