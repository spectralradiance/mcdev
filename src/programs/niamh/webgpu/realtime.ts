// Chapter 47: real-time mode. Each frame is one sample per pixel from the wavefront tracer, with ReSTIR choosing the
// primary hit's light sample, then temporal accumulation and an a-trous filter. The result is biased, since reuse
// across pixels and frames trades exactness for noise, which is the trade games make.

import realtimeSource from './shaders/realtime.wgsl?raw';
import shaderSource from './shaders/wavefront.wgsl?raw';
import type { SceneData } from './wasm';
import { WavefrontTracer, type TracerOptions } from './wavefront';

export interface RealtimeOptions {
  candidates: number;     // light samples ReSTIR resamples per pixel
  temporalReuse: boolean;
  spatialReuse: boolean;
  maxHistory: number;     // frames temporal accumulation averages over, at most; 1 turns it off
  filterPasses: number;   // a-trous passes; 0 turns the filter off
}

export const defaultRealtime: RealtimeOptions = {
  candidates: 8,
  temporalReuse: true,
  spatialReuse: true,
  maxHistory: 32,
  filterPasses: 5,
};

const WORKGROUP = 64;
const MAX_PASSES = 5;

export class RealtimeTracer extends WavefrontTracer {
  // Holds reservoirs, gbuffer, history, filter slots, and output; see realtime.wgsl.
  readonly state: GPUBuffer;
  // Where the final colours are in state, in bytes: bind { buffer: state, offset, size } to read them.
  readonly outputOffset: number;
  realtime: RealtimeOptions;
  private readonly frameParams: GPUBuffer;
  private readonly sections: number[];
  private readonly group2: GPUBindGroup;
  private readonly emptyGroup: GPUBindGroup;
  private readonly kernels: Record<string, GPUComputePipeline> = {};
  private readonly atrousPasses: GPUComputePipeline[] = [];
  private readonly composeFrom: GPUComputePipeline[] = [];
  private previousView?: Float32Array;
  private parity = 0;

  constructor(device: GPUDevice, scene: SceneData, options: TracerOptions, realtime: RealtimeOptions = defaultRealtime) {
    super(device, scene, options);
    this.realtime = { ...realtime };
    this.restir = true;
    const n = this.pathCount;
    // Section sizes in vec4s, each rounded up to 16 so every section starts on a 256-byte binding boundary.
    const sizes = [3 * 2 * n, 2 * 2 * n, 2 * 2 * n, 2 * n, n];
    this.sections = [];
    let total = 0;
    for (const s of sizes) {
      this.sections.push(total);
      total += Math.ceil(s / 16) * 16;
    }
    this.state = this.make(total * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, 'real-time state');
    this.outputOffset = this.sections[4] * 16;
    this.frameParams = this.make(112, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'frame');

    const layout2 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    const empty = device.createBindGroupLayout({ entries: [] });
    this.emptyGroup = device.createBindGroup({ layout: empty, entries: [] });
    this.group2 = device.createBindGroup({
      layout: layout2,
      entries: [
        { binding: 0, resource: { buffer: this.state } },
        { binding: 1, resource: { buffer: this.frameParams } },
      ],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout0, empty, layout2] });
    const module = device.createShaderModule({ code: shaderSource + realtimeSource, label: 'realtime' });
    const pipeline = (entryPoint: string, constants?: Record<string, number>) =>
      device.createComputePipeline({ layout, compute: { module, entryPoint, constants }, label: entryPoint });
    for (const name of ['restirCandidates', 'restirTemporal', 'restirSpatial', 'restirShade', 'accumulate']) {
      this.kernels[name] = pipeline(name);
    }
    for (let pass = 0; pass < MAX_PASSES; ++pass) this.atrousPasses.push(pipeline('atrous', { STEP: 1 << pass, SOURCE: pass % 2 }));
    this.composeFrom = [pipeline('compose', { SOURCE: 0 }), pipeline('compose', { SOURCE: 1 })];
  }

  static async compile(device: GPUDevice): Promise<void> {
    await WavefrontTracer.compile(device, shaderSource + realtimeSource);
  }

  private run(encoder: GPUCommandEncoder, pipeline: GPUComputePipeline) {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.group0);
    pass.setBindGroup(1, this.emptyGroup);
    pass.setBindGroup(2, this.group2);
    pass.dispatchWorkgroups(Math.ceil(this.pathCount / WORKGROUP));
    pass.end();
  }

  // Each frame starts from an empty image: history lives in the history buffer, not in the running sum.
  protected override beforeSample(encoder: GPUCommandEncoder): void {
    const frame = new ArrayBuffer(112);
    const previous = this.previousView ?? this.view;
    new Float32Array(frame, 0, 16).set(previous);
    const r = this.realtime;
    new Uint32Array(frame, 64, 4).set([this.parity, r.candidates, r.temporalReuse ? 1 : 0, r.spatialReuse ? 1 : 0]);
    new Float32Array(frame, 80, 1)[0] = r.maxHistory;
    new Uint32Array(frame, 84, 7).set([this.previousView ? 1 : 0, ...this.sections, 0]);
    this.device.queue.writeBuffer(this.frameParams, 0, frame);
    encoder.clearBuffer(this.image);
    encoder.clearBuffer(this.features);
  }

  protected override afterPrimary(encoder: GPUCommandEncoder): void {
    this.run(encoder, this.kernels.restirCandidates);
    this.run(encoder, this.kernels.restirTemporal);
    this.run(encoder, this.kernels.restirSpatial);
    this.run(encoder, this.kernels.restirShade);
  }

  protected override afterSample(encoder: GPUCommandEncoder): void {
    this.run(encoder, this.kernels.accumulate);
    const passes = Math.min(this.realtime.filterPasses, MAX_PASSES);
    for (let pass = 0; pass < passes; ++pass) this.run(encoder, this.atrousPasses[pass]);
    this.run(encoder, this.composeFrom[passes % 2]);
    this.previousView = this.view.slice();
    this.parity ^= 1;
  }

  // Forget all history, as after a jump the reprojection can't follow.
  override reset(): void {
    super.reset();
    this.previousView = undefined;
  }

  // The last frame's filtered result, linear RGB, three floats per pixel.
  async readOutput(): Promise<Float32Array> {
    const data = new Float32Array(await this.read(this.state)).subarray(this.outputOffset / 4);
    const out = new Float32Array(this.pathCount * 3);
    for (let i = 0; i < this.pathCount; ++i) for (let c = 0; c < 3; ++c) out[3 * i + c] = data[4 * i + c];
    return out;
  }

  // The last frame's raw sample, before accumulation and filtering.
  async readFrame(): Promise<Float32Array> {
    const data = new Float32Array(await this.read(this.image));
    const out = new Float32Array(this.pathCount * 3);
    for (let i = 0; i < this.pathCount; ++i) for (let c = 0; c < 3; ++c) out[3 * i + c] = data[4 * i + c];
    return out;
  }
}
