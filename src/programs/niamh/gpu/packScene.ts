// Compiles a SceneDescription (see ../scene.ts) into flat typed arrays ready
// to upload as shader uniforms. Pure data transformation — no WebGL calls here,
// so it can be tested or reused independently of the renderer.

import type { SceneDescription } from "../scene";
import { MAX_LIGHTS, MAX_MATERIALS, MAX_OBJECTS } from "./limits";
import { IDENTITY_MAT3, length, lookAtBasis, rotationY, sub, type Vec3 } from "./vec3";

export interface PackedCamera {
  position: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
  fov: number; // radians
  aperture: number;
  focusDistance: number;
}

export interface PackedScene {
  objectCount: number;
  objectType: Int32Array;
  objectPosition: Float32Array;
  objectRotation: Float32Array; // column-major mat3 per object
  objectParams: Float32Array; // plane normal, or box half-size
  objectMaterial: Int32Array;

  materialCount: number;
  matDiffuse: Float32Array;
  matEmission: Float32Array;
  matReflectivity: Float32Array;
  matTransparency: Float32Array;
  matIor: Float32Array;
  matRoughness: Float32Array;
  matScatterDistance: Float32Array;
  matScatterAnisotropy: Float32Array;

  lightCount: number;
  lightObject: Int32Array; // 1-based object id, matches find_intersection's convention
  lightArea: Float32Array;

  camera: PackedCamera;
  maxBounces: number;
}

function boxArea(size: Vec3): number {
  const [hx, hy, hz] = size;
  return 8 * (hx * hy + hx * hz + hy * hz);
}

export function packScene(scene: SceneDescription): PackedScene {
  const { objects, materials, camera } = scene;

  if (objects.length > MAX_OBJECTS) {
    throw new Error(`Scene has ${objects.length} objects; the shader supports at most ${MAX_OBJECTS}.`);
  }
  const materialNames = Object.keys(materials);
  if (materialNames.length > MAX_MATERIALS) {
    throw new Error(`Scene has ${materialNames.length} materials; the shader supports at most ${MAX_MATERIALS}.`);
  }
  const materialIndex = new Map(materialNames.map((name, i) => [name, i]));

  const objectType = new Int32Array(MAX_OBJECTS);
  const objectPosition = new Float32Array(MAX_OBJECTS * 3);
  const objectRotation = new Float32Array(MAX_OBJECTS * 9);
  const objectParams = new Float32Array(MAX_OBJECTS * 3);
  const objectMaterial = new Int32Array(MAX_OBJECTS);

  const lightObject: number[] = [];
  const lightArea: number[] = [];

  objects.forEach((obj, i) => {
    const matIdx = materialIndex.get(obj.material);
    if (matIdx === undefined) {
      throw new Error(`Object ${i} references unknown material "${obj.material}".`);
    }
    objectMaterial[i] = matIdx;
    objectPosition.set(obj.position, i * 3);

    if (obj.type === "plane") {
      objectType[i] = 0;
      objectRotation.set(IDENTITY_MAT3, i * 9);
      const [nx, ny, nz] = obj.normal;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      objectParams.set([nx / len, ny / len, nz / len], i * 3);
    } else {
      objectType[i] = 1;
      objectRotation.set(rotationY(obj.rotationDeg ?? 0), i * 9);
      objectParams.set(obj.size, i * 3);

      const material = materials[obj.material];
      if (material.emission && material.emission.some((c) => c > 0)) {
        lightObject.push(i + 1);
        lightArea.push(boxArea(obj.size));
      }
    }
  });

  if (lightObject.length > MAX_LIGHTS) {
    throw new Error(`Scene has ${lightObject.length} emissive boxes; the shader supports at most ${MAX_LIGHTS} lights.`);
  }

  const matDiffuse = new Float32Array(MAX_MATERIALS * 3);
  const matEmission = new Float32Array(MAX_MATERIALS * 3);
  const matReflectivity = new Float32Array(MAX_MATERIALS * 3);
  const matTransparency = new Float32Array(MAX_MATERIALS * 3);
  const matIor = new Float32Array(MAX_MATERIALS);
  const matRoughness = new Float32Array(MAX_MATERIALS);
  const matScatterDistance = new Float32Array(MAX_MATERIALS * 3);
  const matScatterAnisotropy = new Float32Array(MAX_MATERIALS);

  materialNames.forEach((name, i) => {
    const m = materials[name];
    matDiffuse.set(m.diffuse ?? [0, 0, 0], i * 3);
    matEmission.set(m.emission ?? [0, 0, 0], i * 3);
    matReflectivity.set(m.reflectivity ?? [0, 0, 0], i * 3);
    matTransparency.set(m.transparency ?? [0, 0, 0], i * 3);
    matIor[i] = m.ior ?? 1;
    matRoughness[i] = m.roughness ?? 0;
    matScatterDistance.set(m.scatteringDistance ?? [0, 0, 0], i * 3);
    matScatterAnisotropy[i] = m.scatteringAnisotropy ?? 0;
  });

  const basis = lookAtBasis(camera.position, camera.target, camera.up);

  return {
    objectCount: objects.length,
    objectType,
    objectPosition,
    objectRotation,
    objectParams,
    objectMaterial,

    materialCount: materialNames.length,
    matDiffuse,
    matEmission,
    matReflectivity,
    matTransparency,
    matIor,
    matRoughness,
    matScatterDistance,
    matScatterAnisotropy,

    lightCount: lightObject.length,
    lightObject: Int32Array.from({ length: MAX_LIGHTS }, (_, i) => lightObject[i] ?? 0),
    lightArea: Float32Array.from({ length: MAX_LIGHTS }, (_, i) => lightArea[i] ?? 0),

    camera: {
      position: basis.position,
      x: basis.x,
      y: basis.y,
      z: basis.z,
      fov: (camera.fovDeg * Math.PI) / 180,
      aperture: camera.aperture ?? 0,
      focusDistance: camera.focusDistance ?? length(sub(camera.target, camera.position)),
    },
    maxBounces: scene.maxBounces ?? 6,
  };
}
