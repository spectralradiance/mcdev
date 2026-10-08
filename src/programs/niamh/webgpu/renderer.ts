// WebGPU backend: wraps the wavefront / ReSTIR tracers ported from niamh's rtoptimized behind the same surface the
// WebGL2 PathTracerRenderer exposes (setScene, setSize, renderFrame, sampleCount, dispose), so page.tsx can drive
// either. rtadvanced, compiled to WebAssembly, loads the scene and builds the BVH; see ./wasm.ts.

import { isNative, type NativeScene, type SceneDescription } from "../scene";
import { defaultDisplay, TONE_MAP_CODE, type DisplaySettings } from "../display";
import { meanRatio, relativeMse, type Comparison } from "./compare";
import { convertScene } from "./sceneConvert";
import { defaultRealtime, RealtimeTracer, type RealtimeOptions } from "./realtime";
import { packedMaterial, RendererB, withMedia, type SceneData } from "./wasm";
import { WavefrontTracer, type CameraPose, type TracerOptions } from "./wavefront";
import displaySource from "./shaders/display.wgsl?raw";

export type WebGpuEngine = "whitted" | "path" | "nee-mis" | "realtime";

// MODE_* in wavefront.wgsl.
const WAVEFRONT_MODE: Partial<Record<WebGpuEngine, number>> = { whitted: 0, path: 1, "nee-mis": 2 };

const FRAME_BUDGET_MS = 25;
const MAX_SAMPLES_PER_FRAME = 64;
// Largest per-pixel storage binding: the real-time state (17 vec4s) and the wavefront path state (4 vec4s).
const REALTIME_BYTES_PER_PIXEL = 17 * 16;
const WAVEFRONT_BYTES_PER_PIXEL = 4 * 16;
const NATIVE_MAX_DEPTH = 8;
const MIN_PITCH = -1.2;
const MAX_PITCH = 1.2;

export function webGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export class WebGpuRenderer {
  /** Features of the current scene the tracer can't represent. */
  unsupported: string[] = [];
  /** First uncaptured GPU validation/out-of-memory error, if any. */
  deviceError?: string;
  /** Why the last scene or mode change failed to load; the previous render stays up. Cleared by the next success. */
  loadError?: string;

  private tracer: WavefrontTracer | RealtimeTracer | null = null;
  private scene: SceneDescription | NativeScene | null = null;
  private sceneData: SceneData | null = null;
  private engine: WebGpuEngine = "nee-mis";
  private width = 0;
  private height = 0;
  private dirty = true;
  private inFlight = false;
  private samplesPerFrame = 1;
  private disposed = false;
  private displaySettings: DisplaySettings = { ...defaultDisplay };
  private maxDepthOverride: number | null = null;
  private realtimeOptions: RealtimeOptions = { ...defaultRealtime };
  private paused = false;
  private channel = 0;
  private sortMaterials = true;
  private aliveBusy = false;
  private aliveAt = 0;
  /** Fraction of paths still alive entering each bounce, averaged over samples (wavefront modes only). */
  alive: number[] = [];
  private frameMs = 0;
  private lastFrame = 0;

  private readonly context: GPUCanvasContext;
  private readonly display: GPURenderPipeline;
  private readonly viewBuffer: GPUBuffer;
  private displayGroup: GPUBindGroup | null = null;

  // Orbit about the scene camera's target.
  private home: CameraPose = { position: [0, 0, 1], target: [0, 0, 0] };
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private lastPointer: [number, number] = [0, 0];
  private zoom = 1;

  private readonly onPointerDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastPointer = [e.clientX, e.clientY];
    this.canvas.setPointerCapture(e.pointerId);
  };
  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.yaw -= (e.clientX - this.lastPointer[0]) * 0.008;
    this.pitch += (e.clientY - this.lastPointer[1]) * 0.008;
    this.lastPointer = [e.clientX, e.clientY];
    this.applyCamera();
  };
  private readonly onPointerUp = (e: PointerEvent) => {
    this.dragging = false;
    this.canvas.releasePointerCapture(e.pointerId);
  };
  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = Math.max(0.05, this.zoom * Math.exp(e.deltaY * 0.001));
    this.applyCamera();
  };

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private readonly rendererB: RendererB,
  ) {
    this.context = canvas.getContext("webgpu")!;
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format, alphaMode: "opaque" });
    const module = device.createShaderModule({ code: displaySource });
    this.display = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vertexMain" },
      fragment: { module, entryPoint: "fragmentMain", targets: [{ format }] },
    });
    this.viewBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGpuRenderer> {
    if (!webGpuAvailable()) throw new Error("WebGPU is not supported in this browser.");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("WebGPU is present but no adapter was found.");
    const timestamps = adapter.features.has("timestamp-query");
    // The real-time tracer's state buffer is ~272 B per pixel, past the 128 MiB default binding limit at ~700x700.
    const device = await adapter.requestDevice({
      requiredFeatures: timestamps ? ["timestamp-query"] : [],
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      },
    });
    await WavefrontTracer.compile(device);
    await RealtimeTracer.compile(device);
    const renderer = new WebGpuRenderer(canvas, device, await RendererB.create());
    // Validation failures are otherwise silent: the canvas just stays black.
    device.addEventListener("uncapturederror", (e) => {
      renderer.deviceError ??= (e as GPUUncapturedErrorEvent).error.message;
    });
    return renderer;
  }

  /** A one-line summary of the scene and per-stage GPU times, for the page to show. */
  statsText(): string {
    const t = this.tracer;
    const d = this.sceneData;
    if (!t || !d) return "";
    const parts = [
      `${t.options.width}×${t.options.height}`,
      `${d.primitiveCount} primitives`,
      `${d.nodeCount} BVH nodes`,
      `${d.lightCount} lights`,
    ];
    if (this.frameMs > 0) parts.push(`${this.frameMs.toFixed(0)} ms/frame`);
    const stages = (["generate", "extend", "shade", "connect"] as const).filter((k) => t.stageTimes[k] !== undefined);
    if (stages.length > 0) parts.push(stages.map((k) => `${k} ${t.stageTimes[k]!.toFixed(1)} ms`).join(" · "));
    return parts.join(" | ");
  }

  /** Overrides the scene's bounce limit; the tracer's per-bounce timing and queues are sized by it, so it rebuilds. */
  setMaxBounces(bounces: number): void {
    if (bounces === this.maxDepthOverride) return;
    this.maxDepthOverride = bounces;
    this.dirty = true;
  }

  setDisplay(display: DisplaySettings): void {
    this.displaySettings = { ...display };
  }

  /** ReSTIR and denoiser settings; they take effect on the next frame without a rebuild. */
  setRealtimeOptions(options: RealtimeOptions): void {
    this.realtimeOptions = { ...options };
    if (this.tracer instanceof RealtimeTracer) this.tracer.realtime = { ...options };
  }

  /**
   * Renders the current scene with rtadvanced's own CPU path tracer (one thread, in WebAssembly, blocking) and with
   * this GPU tracer at the same small size, and compares them. Two GPU renders with different seeds give the noise
   * floor to judge the difference against. Scattering media are left out of the GPU render, since the CPU bridge
   * never sees them.
   */
  async compareWithCpu(cpuSpp: number, width = 128): Promise<Comparison> {
    // A scene or mode change only marks the renderer dirty; the render loop rebuilds on its next frame. Comparing before
    // that would pair the previous scene's data with the new selection, so finish the rebuild first.
    if (this.dirty) {
      this.rebuild();
      this.loadError = undefined;
    }
    const scene = this.sceneData;
    const current = this.tracer;
    if (!scene || !current) throw new Error("Nothing is loaded to compare.");
    if (scene.sphereLightsPatched) {
      throw new Error(
        "This scene has sphere lights, which rtadvanced's WebAssembly bridge can't load, so its CPU renderer has nothing to compare against.",
      );
    }
    const height = Math.round(width * 0.75);
    const maxDepth = current.options.maxDepth;
    const notes: string[] = [];
    if (scene.mediaBase !== undefined) notes.push("scattering media left out of the GPU render: the CPU bridge doesn't see them");

    const cpuStart = performance.now();
    const cpu = this.rendererB.renderCpu(width, height, cpuSpp, maxDepth, false);
    const cpuSeconds = (performance.now() - cpuStart) / 1000;

    // The same scene data, minus media, so both renders see the same world.
    const comparable: SceneData = { ...scene, mediaBase: undefined };
    const gpuSpp = Math.max(256, 4 * cpuSpp);
    const render = async (seed: number) => {
      const tracer = new WavefrontTracer(this.device, comparable, { width, height, maxDepth, sortMaterials: true, mode: 2, seed });
      try {
        for (let done = 0; done < gpuSpp; done += 32) {
          for (let i = 0; i < Math.min(32, gpuSpp - done); ++i) tracer.renderSample();
          await this.device.queue.onSubmittedWorkDone();
        }
        return await tracer.readImage();
      } finally {
        tracer.destroy();
      }
    };
    const gpuStart = performance.now();
    const gpu = await render(0);
    const gpuSeconds = (performance.now() - gpuStart) / 1000;
    const noise = await render(7919);

    return {
      width,
      height,
      cpu,
      gpu,
      cpuSpp,
      gpuSpp,
      cpuSeconds,
      gpuSeconds,
      mse: relativeMse(cpu, gpu),
      noiseMse: relativeMse(noise, gpu),
      ratio: meanRatio(cpu, gpu),
      notes,
    };
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** Which buffer the display shows: 0 radiance, 1 albedo, 2 normal, 3 depth. */
  setChannel(channel: number): void {
    this.channel = channel;
  }

  /** Sorting paths into per-material queues cuts divergence; it can change between samples, so nothing rebuilds. */
  setSortMaterials(sort: boolean): void {
    this.sortMaterials = sort;
    if (this.tracer) this.tracer.options.sortMaterials = sort;
  }

  get currentEngine(): WebGpuEngine {
    return this.engine;
  }

  get sampleCount(): number {
    return this.tracer ? this.tracer.samples : 0;
  }

  setEngine(engine: WebGpuEngine): void {
    if (engine === this.engine) return;
    const before = this.engine;
    this.engine = engine;
    // Wavefront modes differ only by a shader constant, so switching between them keeps the buffers.
    const tracer = this.tracer;
    if (tracer && before !== "realtime" && engine !== "realtime") {
      tracer.options.mode = WAVEFRONT_MODE[engine];
      tracer.reset();
    } else {
      this.dirty = true;
    }
  }

  setScene(scene: SceneDescription | NativeScene): void {
    this.scene = scene;
    this.dirty = true;
  }

  setSize(width: number, height: number): void {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.dirty = true;
  }

  // Tracers are built for a fixed image size, scene, and mode, so any of those changing rebuilds them.
  private rebuild(): void {
    if (!this.scene || this.width === 0) return;
    // Keep the largest per-pixel buffer inside the device's binding limit by rendering below display resolution.
    const bytesPerPixel = this.engine === "realtime" ? REALTIME_BYTES_PER_PIXEL : WAVEFRONT_BYTES_PER_PIXEL;
    const maxPixels = Math.floor(this.device.limits.maxStorageBufferBindingSize / bytesPerPixel);
    const shrink = Math.min(1, Math.sqrt(maxPixels / (this.width * this.height)));
    const width = Math.max(1, Math.floor(this.width * shrink));
    const height = Math.max(1, Math.floor(this.height * shrink));
    const native = isNative(this.scene);
    const converted = native
      ? { json: "", materialOrder: [], media: {}, unsupported: [] as string[] }
      : convertScene(this.scene as SceneDescription, width, height);
    let sceneData = native
      ? this.rendererB.load((this.scene as NativeScene).native)
      : this.rendererB.loadText("niamh.json", converted.json);
    const warnings = [...converted.unsupported, ...sceneData.unsupported];
    // rtadvanced ignores participating media (its loader never sees them), so they ride along in a table indexed by
    // material. That relies on materials being indexed in sorted-name order; verify rather than assume.
    if (Object.keys(converted.media).length > 0) {
      const aligned = converted.materialOrder.length === sceneData.materialCount &&
        converted.materialOrder.every((m, i) => packedMaterial(sceneData, i).kind === m.kind);
      if (aligned) {
        const table = new Float32Array(4 * sceneData.materialCount);
        converted.materialOrder.forEach((m, i) => {
          const medium = converted.media[m.name];
          if (medium) table.set([...medium.distance, medium.g], 4 * i);
        });
        sceneData = withMedia(sceneData, table);
      } else {
        warnings.push("volumetric scattering (material order did not match rtadvanced's)");
      }
    }
    this.sceneData = sceneData;
    this.unsupported = warnings;
    const options: TracerOptions = {
      width,
      height,
      maxDepth: this.maxDepthOverride ?? (native ? NATIVE_MAX_DEPTH : (this.scene as SceneDescription).maxBounces ?? 6),
      sortMaterials: this.sortMaterials,
      mode: WAVEFRONT_MODE[this.engine] ?? 2,
    };
    // Only now, with the scene loaded, is the old tracer safe to drop: a failed load leaves it on screen.
    this.tracer?.destroy();
    this.tracer = null;
    this.displayGroup = null;
    const tracer = this.engine === "realtime"
      ? new RealtimeTracer(this.device, this.sceneData, options, { ...this.realtimeOptions })
      : new WavefrontTracer(this.device, this.sceneData, options);
    this.tracer = tracer;
    this.home = tracer.initialPose();
    this.yaw = this.pitch = 0;
    this.zoom = 1;

    const image = tracer instanceof RealtimeTracer
      ? { buffer: tracer.state, offset: tracer.outputOffset, size: tracer.pathCount * 16 }
      : { buffer: tracer.image };
    this.displayGroup = this.device.createBindGroup({
      layout: this.display.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.viewBuffer } },
        { binding: 1, resource: image },
        { binding: 2, resource: { buffer: tracer.features } },
      ],
    });
    this.canvas.width = width;
    this.canvas.height = height;
    this.dirty = false;
  }

  private pose(): CameraPose {
    const [px, py, pz] = this.home.position;
    const [tx, ty, tz] = this.home.target;
    const d = [px - tx, py - ty, pz - tz];
    const radius = Math.hypot(d[0], d[1], d[2]) * this.zoom;
    const baseYaw = Math.atan2(d[0], d[2]);
    const basePitch = Math.asin(d[1] / (Math.hypot(d[0], d[1], d[2]) || 1));
    const p = Math.max(MIN_PITCH, Math.min(MAX_PITCH, basePitch + this.pitch));
    const y = baseYaw + this.yaw;
    return {
      position: [tx + radius * Math.cos(p) * Math.sin(y), ty + radius * Math.sin(p), tz + radius * Math.cos(p) * Math.cos(y)],
      target: this.home.target,
    };
  }

  private applyCamera(): void {
    const tracer = this.tracer;
    if (!tracer) return;
    tracer.setCamera(this.pose());
    // Accumulated samples belong to the old view; real time reprojects its history instead.
    if (!(tracer instanceof RealtimeTracer)) tracer.reset();
  }

  resetAccumulation(): void {
    if (this.tracer && !(this.tracer instanceof RealtimeTracer)) this.tracer.reset();
  }

  renderFrame(): void {
    if (this.disposed) return;
    const now = performance.now();
    if (this.lastFrame > 0) this.frameMs = 0.9 * this.frameMs + 0.1 * (now - this.lastFrame);
    this.lastFrame = now;
    if (this.deviceError) throw new Error(`WebGPU error: ${this.deviceError}`);
    if (this.dirty) {
      try {
        this.rebuild();
        this.loadError = undefined;
      } catch (e) {
        // Don't retry every frame; the next scene or mode change sets dirty again.
        this.loadError = e instanceof Error ? e.message : String(e);
        this.dirty = false;
      }
    }
    const tracer = this.tracer;
    if (!tracer || !this.displayGroup) return;

    if (!(tracer instanceof RealtimeTracer) && !this.aliveBusy && tracer.samples > 0 && now - this.aliveAt > 1000) {
      this.aliveBusy = true;
      this.aliveAt = now;
      tracer
        .readAlive()
        .then((counts) => {
          this.alive = counts.map((c) => c / tracer.pathCount);
        })
        .catch(() => {}) // the tracer was destroyed before the readback finished
        .finally(() => {
          this.aliveBusy = false;
        });
    }

    if (!this.inFlight && !this.paused) {
      this.inFlight = true;
      const before = performance.now();
      // Real time renders one sample a frame; accumulation mode fills the frame budget.
      const count = tracer instanceof RealtimeTracer ? 1 : this.samplesPerFrame;
      for (let i = 0; i < count; ++i) tracer.renderSample();
      this.draw(tracer);
      this.device.queue.onSubmittedWorkDone().then(() => {
        this.inFlight = false;
        if (tracer instanceof RealtimeTracer) return;
        const elapsed = performance.now() - before;
        this.samplesPerFrame = Math.max(1, Math.min(MAX_SAMPLES_PER_FRAME, Math.round(this.samplesPerFrame * (FRAME_BUDGET_MS / Math.max(elapsed, 1)))));
      });
    } else {
      this.draw(tracer);
    }
  }

  private draw(tracer: WavefrontTracer | RealtimeTracer): void {
    const view = new ArrayBuffer(32);
    const realtime = tracer instanceof RealtimeTracer;
    new Uint32Array(view, 0, 4).set([tracer.options.width, tracer.options.height, realtime ? 1 : tracer.samples, this.channel]);
    new Float32Array(view, 16, 1)[0] = 2 ** this.displaySettings.exposure;
    new Uint32Array(view, 20, 1)[0] = TONE_MAP_CODE[this.displaySettings.toneMap];
    this.device.queue.writeBuffer(this.viewBuffer, 0, view);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store" }],
    });
    pass.setPipeline(this.display);
    pass.setBindGroup(0, this.displayGroup!);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.disposed = true;
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.tracer?.destroy();
    this.viewBuffer.destroy();
    this.context.unconfigure();
    this.device.destroy();
  }
}
