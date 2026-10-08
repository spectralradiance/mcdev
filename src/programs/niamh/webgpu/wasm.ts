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
  // Where the sphere table (centre, radius per sphere) starts, in vec4 units; sphere lights are sampled from it.
  sphereBase?: number;
  materialCount: number;
}

// rtadvanced's packer refuses emissive spheres, but nothing about a sphere light is hard for the GPU. Scenes that
// have them are loaded with every emissive material switched off, then the emission is put back and the light list
// rebuilt from the packed primitives. Switching off all of them, not just the sphere ones, covers instances, which
// can override the material of the spheres inside them.
const SPHERE_LIGHT_ERROR = 'not spheres';
const MATERIAL_WORDS = 16;
const PRIMITIVE_WORDS = 4;
const EMISSIVE = 4;
const DIFFUSE = 0;

interface SphereLights {
  /** Emissive material index (sorted-name order, as the loader indexes them) to the radiance it should have. */
  radiance: Map<number, [number, number, number]>;
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
      const message = this.module.UTF8ToString(this.call('rt_error'));
      if (!message.includes(SPHERE_LIGHT_ERROR)) throw new Error(message);
      return this.loadWithSphereLights(path);
    }
    return this.collect();
  }

  private loadWithSphereLights(path: string): SceneData {
    const scene = JSON.parse(this.module.FS.readFile(path, { encoding: 'utf8' }));
    const names = Object.keys(scene.materials).sort();
    const radiance = new Map<number, [number, number, number]>();
    names.forEach((name, index) => {
      const material = scene.materials[name];
      if (material.type !== 'emissive') return;
      if (!Array.isArray(material.radiance)) throw new Error(`emissive material '${name}' has no constant radiance`);
      radiance.set(index, material.radiance);
    });
    for (const index of radiance.keys()) scene.materials[names[index]] = { type: 'diffuse', albedo: [0, 0, 0] };
    const patched = '/scenes/__sphere-lights.json';
    this.module.FS.writeFile(patched, JSON.stringify(scene));
    if (!this.call('rt_load', patched)) throw new Error(this.module.UTF8ToString(this.call('rt_error')));
    return this.collect({ radiance });
  }

  private collect(sphereLights?: SphereLights): SceneData {
    const parts = BUFFERS.map((_, i) => {
      const pointer = this.call('rt_buffer', i) / 4;
      const words = this.call('rt_buffer_words', i);
      // Copy now: the heap view is replaced whenever the module's memory grows.
      return this.module.HEAPU32.slice(pointer, pointer + words);
    });
    let lightCount = this.call('rt_light_count');
    if (sphereLights) lightCount = restoreSphereLights(parts, sphereLights);
    const padded = parts.map((p) => Math.ceil(p.length / 4) * 4);
    const words = new Uint32Array(padded.reduce((a, b) => a + b, 0));
    const bases = {} as Record<BufferName, number>;
    let offset = 0;
    parts.forEach((part, i) => {
      bases[BUFFERS[i]] = offset / 4;
      words.set(part, offset);
      offset += padded[i];
    });
    // The sphere table goes after everything rtadvanced packed.
    const sphereTable = sphereCentresAndRadii(parts[2]);
    const sphereBase = offset / 4;
    const withSpheres = new Uint32Array(words.length + sphereTable.length);
    withSpheres.set(words);
    withSpheres.set(new Uint32Array(sphereTable.buffer), words.length);
    const flags = this.call('rt_unsupported');
    return {
      words: withSpheres,
      sphereBase,
      bases,
      width: this.call('rt_width'),
      height: this.call('rt_height'),
      lightCount,
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

// Puts emission back on the materials that were switched off and lists every primitive that uses one as a light.
// Returns the new light count.
function restoreSphereLights(parts: Uint32Array[], { radiance }: SphereLights): number {
  const materials = new Float32Array(parts[5].buffer);
  const primitives = parts[1];
  for (const [index, rgb] of radiance) {
    const base = index * MATERIAL_WORDS;
    // The loader indexes materials in sorted-name order; the patched ones are diffuse now, so check that they are.
    if (materials[base + 3] !== DIFFUSE) throw new Error('material order does not match rtadvanced for sphere lights');
    materials[base + 3] = EMISSIVE;
    materials.set(rgb, base + 4);
  }
  const lights: number[] = [];
  for (let slot = 0; slot < primitives.length / PRIMITIVE_WORDS; ++slot) {
    const at = slot * PRIMITIVE_WORDS;
    if (radiance.has(primitives[at + 2])) {
      primitives[at + 3] = lights.length;
      lights.push(slot);
    }
  }
  parts[6] = Uint32Array.from(lights.length > 0 ? lights : [0, 0, 0, 0]);
  return lights.length;
}

// Each packed sphere is the 3x4 matrix taking world space to its unit sphere, (1/r) R^T | t. Uniform scale makes the
// inverse r^2 A^T, so the centre is -r^2 A^T t and the radius is 1 / |row 0|. One vec4 per sphere: (centre, radius).
function sphereCentresAndRadii(spheres: Uint32Array): Float32Array {
  const m = new Float32Array(spheres.buffer, spheres.byteOffset, spheres.length);
  const count = Math.floor(spheres.length / 12);
  const out = new Float32Array(Math.max(1, count) * 4);
  for (let i = 0; i < count; ++i) {
    const row = (r: number) => [m[12 * i + 4 * r], m[12 * i + 4 * r + 1], m[12 * i + 4 * r + 2], m[12 * i + 4 * r + 3]];
    const [a, b, c] = [row(0), row(1), row(2)];
    const radius = 1 / Math.hypot(a[0], a[1], a[2]);
    const t = [a[3], b[3], c[3]];
    const centre = [0, 1, 2].map((k) => -radius * radius * (a[k] * t[0] + b[k] * t[1] + c[k] * t[2]));
    out.set([...centre, radius], 4 * i);
  }
  return out;
}
