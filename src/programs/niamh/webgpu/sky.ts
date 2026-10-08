// The sky and sun for the WebGPU backend. rtadvanced's packer keeps only a constant background (the horizon colour), so
// the scene JSON's "sky" block is read here into a small table the shader evaluates, as Scene::skyRadiance and
// Scene::sunRadiance do on the CPU. Pure data, so it can be tested alone.

type Vec3 = [number, number, number];

export interface SkyJson {
  background?: number[];
  sky?: {
    zenith?: number[];
    horizon?: number[];
    ground?: number[];
    sun?: { direction: number[]; radiusDegrees?: number; irradiance: number[] };
  };
}

/** vec4s in the table: zenith, horizon, ground, sun direction, sun radiance. */
export const SKY_VEC4S = 5;

const normalize = (v: number[]): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Five vec4s: (zenith, 1), (horizon, has sun), (ground, cos of the sun's angular radius), (sun direction, 0),
 * (sun radiance, 0). Undefined when the scene has no sky, so the constant background applies.
 */
export function buildSkyTable(scene: SkyJson): Float32Array | undefined {
  const sky = scene.sky;
  if (!sky) return undefined;
  // The same defaults the loader uses: each colour falls back to the one above it.
  const background = (scene.background ?? [0, 0, 0]) as Vec3;
  const zenith = (sky.zenith ?? background) as Vec3;
  const horizon = (sky.horizon ?? zenith) as Vec3;
  const ground = (sky.ground ?? horizon) as Vec3;

  const table = new Float32Array(4 * SKY_VEC4S);
  let cosRadius = 1;
  if (sky.sun) {
    cosRadius = Math.cos(((sky.sun.radiusDegrees ?? 0.27) * Math.PI) / 180);
    // Authored as the irradiance on a surface facing the sun, which stays put as the disc is resized.
    const solidAngle = 2 * Math.PI * (1 - cosRadius);
    const radiance = sky.sun.irradiance.map((e) => e / solidAngle);
    table.set([...normalize(sky.sun.direction), 0], 12);
    table.set([...radiance, 0], 16);
  }
  table.set([...zenith, 1], 0);
  table.set([...horizon, sky.sun ? 1 : 0], 4);
  table.set([...ground, cosRadius], 8);
  return table;
}
