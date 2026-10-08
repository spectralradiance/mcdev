// Translates a renderer-agnostic SceneDescription (see ../scene.ts) into the JSON scene format rtadvanced's loader
// reads, so the WebGPU tracer can render the same scenes as the WebGL2 one. Everything is rescaled to a unit-ish
// size first: lighting is scale-invariant, but the WGSL ray epsilons are not.

import type { Material, SceneDescription } from "../scene";

type Vec3 = [number, number, number];

const TARGET_CAMERA_DISTANCE = 2.5;

const mean = (c: Vec3 | undefined) => (c ? (c[0] + c[1] + c[2]) / 3 : 0);
const scaled = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// rtadvanced's MaterialType values, as the packed material buffer stores them.
const KIND_CODE: Record<string, number> = { diffuse: 0, glossy: 1, conductor: 2, dielectric: 3, emissive: 4 };

export interface MediumEntry {
  /** Mean free path per channel, in converted (rescaled) scene units. */
  distance: Vec3;
  /** Henyey-Greenstein anisotropy. */
  g: number;
  kind: number;
}

export interface ConvertedScene {
  json: string;
  /**
   * Material names in the order rtadvanced indexes them (its loader walks the JSON object in sorted key order),
   * with the packed kind each should have, so the host can check the assumption before trusting it.
   */
  materialOrder: { name: string; kind: number }[];
  /** Participating media by material name; only materials that refract can hold one. */
  media: Record<string, MediumEntry>;
  /** Features of the description the WebGPU tracer can't represent (yet). */
  unsupported: string[];
}

// Roughness in a SceneDescription is the GGX alpha; rtadvanced's roughness is squared into alpha.
const alphaToRoughness = (alpha: number) => Math.sqrt(Math.max(alpha, 0));

function convertMaterial(m: Material, unsupported: Set<string>) {
  // Scattering distance on a material that can't be entered (opaque, emissive) has no volume to fill.
  if (mean(m.scatteringDistance) > 0 && !(mean(m.transparency) > 0)) {
    unsupported.add("scattering on a non-transparent material (nothing to fill)");
  }
  if (mean(m.emission) > 0) return { type: "emissive", radiance: m.emission };
  const roughness = alphaToRoughness(m.roughness ?? 0);
  if (mean(m.transparency) > 0) return { type: "dielectric", ior: m.ior ?? 1.5, roughness };
  const diffuse = m.diffuse ?? [0, 0, 0];
  if (mean(m.reflectivity) > 0) {
    // A specular surface with no diffuse base is a metal mirror; with one it is a glossy coat.
    if (mean(diffuse) <= 0.01) return { type: "conductor", metal: "aluminium", roughness };
    return { type: "glossy", albedo: diffuse, roughness: Math.max(roughness, 0.02) };
  }
  return { type: "diffuse", albedo: diffuse };
}

export function convertScene(scene: SceneDescription, width: number, height: number): ConvertedScene {
  const unsupported = new Set<string>();
  const cam = scene.camera;
  const distance = Math.hypot(...sub(cam.position, cam.target)) || 1;
  const s = TARGET_CAMERA_DISTANCE / distance;
  const planeExtent = 20 * TARGET_CAMERA_DISTANCE;

  const materials: Record<string, unknown> = {};
  const media: Record<string, MediumEntry> = {};
  const names = Object.keys(scene.materials).sort();
  const materialOrder: ConvertedScene["materialOrder"] = [];
  for (const name of names) {
    const m = scene.materials[name];
    const converted = convertMaterial(m, unsupported) as { type: string };
    materials[name] = converted;
    materialOrder.push({ name, kind: KIND_CODE[converted.type] });
    // A scattering distance only means something inside an object, which light enters by refraction.
    if (m.scatteringDistance && mean(m.scatteringDistance) > 0 && converted.type === "dielectric") {
      media[name] = { distance: scaled(m.scatteringDistance, s), g: m.scatteringAnisotropy ?? 0, kind: KIND_CODE.dielectric };
    }
  }

  const shapes = scene.objects.map((obj, i) => {
    if (obj.type === "plane") {
      const n = normalize(obj.normal);
      const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const u = scaled(normalize(cross(helper, n)), planeExtent);
      const v = scaled(normalize(cross(n, normalize(cross(helper, n)))), planeExtent);
      const c = scaled(obj.position, s);
      return {
        name: `plane${i}`,
        type: "quad",
        corner: [c[0] - (u[0] + v[0]) / 2, c[1] - (u[1] + v[1]) / 2, c[2] - (u[2] + v[2]) / 2],
        edgeU: u,
        edgeV: v,
        material: obj.material,
      };
    }
    if (obj.type === "sphere") {
      if (mean(scene.materials[obj.material]?.emission) > 0) {
        throw new Error(`Object ${i} is an emissive sphere; only boxes can be area lights.`);
      }
      return { name: `sphere${i}`, type: "sphere", center: scaled(obj.position, s), radius: obj.radius * s, material: obj.material };
    }
    return {
      name: `box${i}`,
      type: "box",
      size: scaled(obj.size, 2 * s),
      rotateYDegrees: obj.rotationDeg ?? 0,
      translate: scaled(obj.position, s),
      material: obj.material,
    };
  });

  const json = {
    film: { width, height },
    camera: {
      position: scaled(cam.position, s),
      target: scaled(cam.target, s),
      up: cam.up,
      verticalFovDegrees: cam.fovDeg,
      apertureRadius: (cam.aperture ?? 0) * s,
      focusDistance: (cam.focusDistance ?? distance) * s,
    },
    materials,
    shapes,
  };
  return { json: JSON.stringify(json), materialOrder, media, unsupported: [...unsupported] };
}
