// Pure helpers for sphere lights on the WebGPU backend: no WebAssembly or GPU here, so they can be tested alone.

const MATERIAL_WORDS = 16;
const PRIMITIVE_WORDS = 4;
const EMISSIVE = 4;
const DIFFUSE = 0;

export interface SphereLights {
  /** Emissive material index (sorted-name order, as the loader indexes them) to the radiance it should have. */
  radiance: Map<number, [number, number, number]>;
}

// Puts emission back on the materials that were switched off and lists every primitive that uses one as a light.
// Returns the new light count.
export function restoreSphereLights(parts: Uint32Array[], { radiance }: SphereLights): number {
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
export function sphereCentresAndRadii(spheres: Uint32Array): Float32Array {
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
