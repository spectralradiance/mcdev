// Minimal vector/matrix helpers shared by packScene (initial camera setup)
// and the renderer's orbit controls (camera updates after user input).

export type Vec3 = [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  return len > 0 ? scale(a, 1 / len) : [0, 0, 0];
};

export interface CameraBasis {
  position: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

/** Right-handed camera basis: z = forward (target - position), x = right, y = up. */
export function lookAtBasis(position: Vec3, target: Vec3, up: Vec3): CameraBasis {
  const z = normalize(sub(target, position));
  const x = normalize(cross(z, up));
  const y = cross(x, z);
  return { position, x, y, z };
}

/** Column-major 3x3 rotation about the world Y axis, for uniformMatrix3fv. */
export function rotationY(deg: number): number[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    c, 0, -s,
    0, 1, 0,
    s, 0, c,
  ];
}

export const IDENTITY_MAT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
