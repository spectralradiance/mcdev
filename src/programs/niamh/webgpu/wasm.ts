// Chapter 44: rtadvanced, compiled to WebAssembly, loads the scene and builds the BVH. Nothing about the scene is
// reimplemented here; this file only copies rtadvanced's packed arrays into one buffer the GPU can read.

import createModule, { type RendererBModule } from './wasm/rtwasm.mjs';

// Must match the packed::Buffer enum in rtadvanced/src/gpu/pack.h.
const BUFFERS = ['nodes', 'primitives', 'spheres', 'quads', 'triangles', 'materials', 'lights', 'view'] as const;
type BufferName = (typeof BUFFERS)[number];

const UNSUPPORTED: [number, string][] = [
  [1, 'textures (drawn with their base colour)'],
  [2, 'participating media (ignored)'],
  [4, 'subsurface scattering (shaded as diffuse)'],
  [8, 'dispersion (one index of refraction)'],
  [16, 'sheen (shaded as diffuse)'],
  [32, 'mixed materials (the first of each pair)'],
  [64, 'rough glass (drawn smooth)'],
  [128, 'sky and sun (a constant background, the horizon colour)'],
  [256, 'brushed metal (isotropic roughness)'],
];

export interface SceneData {
  // Every array back to back; bases are offsets in vec4 units, as the shader indexes them.
  words: Uint32Array<ArrayBuffer>;
  bases: Record<BufferName, number>;
  width: number;
  height: number;
  lightCount: number;
  nodeCount: number;
  primitiveCount: number;
  unsupported: string[];
  // Where the participating-medium table starts, in vec4 units; undefined when the scene has none.
  mediaBase?: number;
  materialCount: number;
}

export class RendererB {
  private constructor(private readonly module: RendererBModule) {}

  static async create(): Promise<RendererB> {
    return new RendererB(await createModule());
  }

  private call(name: string, ...args: (number | string)[]): number {
    return this.module.ccall(name, 'number', args.map((a) => (typeof a === 'string' ? 'string' : 'number')), args);
  }

  // Scenes are embedded in the module's file system under /scenes.
  load(path: string): SceneData {
    if (!this.call('rt_load', path)) {
      throw new Error(this.module.UTF8ToString(this.call('rt_error')));
    }
    const parts = BUFFERS.map((_, i) => {
      const pointer = this.call('rt_buffer', i) / 4;
      const words = this.call('rt_buffer_words', i);
      // Copy now: the heap view is replaced whenever the module's memory grows.
      return this.module.HEAPU32.slice(pointer, pointer + words);
    });
    const padded = parts.map((p) => Math.ceil(p.length / 4) * 4);
    const words = new Uint32Array(padded.reduce((a, b) => a + b, 0));
    const bases = {} as Record<BufferName, number>;
    let offset = 0;
    parts.forEach((part, i) => {
      bases[BUFFERS[i]] = offset / 4;
      words.set(part, offset);
      offset += padded[i];
    });
    const flags = this.call('rt_unsupported');
    return {
      words,
      bases,
      width: this.call('rt_width'),
      height: this.call('rt_height'),
      lightCount: this.call('rt_light_count'),
      materialCount: parts[5].length / 16,
      nodeCount: parts[0].length / 8,
      primitiveCount: parts[1].length / 4,
      unsupported: UNSUPPORTED.filter(([bit]) => flags & bit).map(([, text]) => text),
    };
  }

  // A scene given as text, written into the module's file system beside the embedded ones and loaded from there.
  loadText(name: string, json: string): SceneData {
    const path = `/scenes/${name}`;
    this.module.FS.writeFile(path, json);
    return this.load(path);
  }

  // rtadvanced's own path tracer (MIS integrator) on the CPU, one thread. Returns linear RGB, three floats per pixel.
  renderCpu(width: number, height: number, spp: number, maxDepth: number, spectral: boolean, seed = 0): Float32Array {
    if (!this.call('rt_render_cpu', width, height, spp, maxDepth, spectral ? 1 : 0, seed)) {
      throw new Error(this.module.UTF8ToString(this.call('rt_error')));
    }
    const pointer = this.call('rt_cpu_pixels') / 4;
    return this.module.HEAPF32.slice(pointer, pointer + width * height * 3);
  }
}

// One vec4 per material, (mean free path rgb, Henyey-Greenstein g), appended after the packed arrays. The tracer
// reads it by material index; rtadvanced's WebAssembly build is not touched.
export function withMedia(scene: SceneData, media: Float32Array): SceneData {
  const words = new Uint32Array(scene.words.length + media.length);
  words.set(scene.words);
  words.set(new Uint32Array(media.buffer, media.byteOffset, media.length), scene.words.length);
  return { ...scene, words, mediaBase: scene.words.length / 4 };
}

// Material `index` as the packed buffer holds it: (kind, ior), to check that names map to indices as assumed.
export function packedMaterial(scene: SceneData, index: number): { kind: number; ior: number } {
  const floats = new Float32Array(scene.words.buffer, scene.words.byteOffset, scene.words.length);
  const base = (scene.bases.materials + 4 * index) * 4;
  return { kind: floats[base + 3], ior: floats[base + 11] };
}
