// Scene description: plain, renderer-agnostic data. The GPU path tracer
// (see gpu/packScene.ts) compiles this into the uniforms its shader expects,
// so a scene can be authored or swapped without touching any rendering code.

export interface Material {
  /** Base reflected color for diffuse (Lambertian) light. */
  diffuse?: [number, number, number];
  /** Light emitted by the surface. Any box using an emissive material becomes a sampled area light. */
  emission?: [number, number, number];
  /** Specular reflectance tint (Fresnel base reflectivity). Zero disables the specular lobe. */
  reflectivity?: [number, number, number];
  /** Specular transmittance tint. Zero means opaque. */
  transparency?: [number, number, number];
  /** Index of refraction, used when transparency is non-zero. */
  ior?: number;
  /** GGX roughness; 0 is mirror-smooth. */
  roughness?: number;
  /** Mean free path for subsurface/volumetric scattering, per channel. Zero disables it. */
  scatteringDistance?: [number, number, number];
  /** Henyey-Greenstein anisotropy for volumetric scattering, in (-1, 1). 0 is isotropic. */
  scatteringAnisotropy?: number;
}

export interface PlaneObject {
  type: "plane";
  material: string;
  /** Any point on the plane. */
  position: [number, number, number];
  /** Plane normal (need not be normalized). */
  normal: [number, number, number];
}

export interface BoxObject {
  type: "box";
  material: string;
  /** Box center. */
  position: [number, number, number];
  /** Half-extents along the box's local axes. */
  size: [number, number, number];
  /** Rotation around the world Y axis, in degrees. */
  rotationDeg?: number;
}

export type SceneObject = PlaneObject | BoxObject;

export interface CameraDescription {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  /** Vertical field of view, in degrees. */
  fovDeg: number;
  /** Lens aperture radius; 0 gives a pinhole camera with no depth of field. */
  aperture?: number;
  /** Distance from the camera at which the image is in focus. Defaults to the distance to `target`. */
  focusDistance?: number;
}

export interface SceneDescription {
  camera: CameraDescription;
  /** Materials keyed by name and referenced from objects by that name. */
  materials: Record<string, Material>;
  objects: SceneObject[];
  /** Bounces of light transport before a path is terminated. */
  maxBounces?: number;
}

/** Classic Cornell box. The "light" material makes the thin box near the ceiling a sampled area light. */
export const cornellBoxScene: SceneDescription = {
  camera: {
    position: [278, 273, -800],
    target: [278, 273, 0],
    up: [0, 1, 0],
    fovDeg: 40,
    aperture: 0,
    focusDistance: 1000,
  },
  materials: {
    white: { diffuse: [0.73, 0.73, 0.73] },
    red: { diffuse: [0.65, 0.05, 0.05] },
    green: { diffuse: [0.12, 0.45, 0.15] },
    mirror: { diffuse: [0, 0, 0], reflectivity: [0.9, 0.9, 0.9], roughness: 0.02 },
    glass: { diffuse: [0, 0, 0], reflectivity: [0.05, 0.05, 0.05], transparency: [0.95, 0.95, 0.95], ior: 1.5, roughness: 0 },
    light: { diffuse: [0, 0, 0], emission: [17, 12, 8] },
  },
  objects: [
    { type: "plane", material: "green", position: [0, 0, 0], normal: [1, 0, 0] },
    { type: "plane", material: "red", position: [555, 0, 0], normal: [-1, 0, 0] },
    { type: "plane", material: "white", position: [0, 0, 0], normal: [0, 1, 0] },
    { type: "plane", material: "white", position: [0, 559, 0], normal: [0, -1, 0] },
    { type: "plane", material: "white", position: [0, 0, 559], normal: [0, 0, -1] },
    { type: "box", material: "glass", position: [186, 82.5, 169], size: [82.5, 82.5, 82.5], rotationDeg: -18 },
    { type: "box", material: "mirror", position: [368, 165, 351], size: [82.5, 165, 82.5], rotationDeg: 18 },
    { type: "box", material: "light", position: [278, 548.6, 279.5], size: [65, 0.1, 52.5] },
  ],
  maxBounces: 6,
};
