import { describe, expect, it } from "vitest";
import { restoreSphereLights, sphereCentresAndRadii } from "./lights";

// A packed sphere is the 3x4 matrix (1/r) R^T | t taking world space to the unit sphere: t = -(1/r) R^T c.
function packSphere(centre: number[], radius: number, yawRadians = 0): number[] {
  const c = Math.cos(yawRadians);
  const s = Math.sin(yawRadians);
  const rt = [[c, 0, -s], [0, 1, 0], [s, 0, c]]; // R^T for a rotation about y
  const t = rt.map((row) => (-(row[0] * centre[0] + row[1] * centre[1] + row[2] * centre[2])) / radius);
  return rt.flatMap((row, i) => [row[0] / radius, row[1] / radius, row[2] / radius, t[i]]);
}

const asWords = (floats: number[]) => new Uint32Array(new Float32Array(floats).buffer);

describe("sphereCentresAndRadii", () => {
  it("recovers centre and radius from the packed transform", () => {
    const out = sphereCentresAndRadii(asWords([...packSphere([-0.55, 1.6, -1], 0.05), ...packSphere([0.4, 0.33, -0.6], 0.33)]));
    expect(Array.from(out.slice(0, 4))).toEqual([-0.55, 1.6, -1, 0.05].map((v) => expect.closeTo(v, 5)));
    expect(Array.from(out.slice(4, 8))).toEqual([0.4, 0.33, -0.6, 0.33].map((v) => expect.closeTo(v, 5)));
  });

  it("still works when the sphere was rotated by an instance transform", () => {
    const out = sphereCentresAndRadii(asWords(packSphere([1, 2, 3], 0.7, 0.9)));
    expect(Array.from(out)).toEqual([1, 2, 3, 0.7].map((v) => expect.closeTo(v, 4)));
  });

  it("returns a single zero entry when the scene has no spheres", () => {
    expect(Array.from(sphereCentresAndRadii(new Uint32Array(4)))).toEqual([0, 0, 0, 0]);
  });
});

describe("restoreSphereLights", () => {
  // Three primitives (shape, index, material, light): a sphere and quad on emissive material 1, a quad on material 0.
  const build = () => {
    const materials = new Float32Array(32); // two materials, kind at +3
    const primitives = new Uint32Array([0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0]);
    const parts: Uint32Array[] = [];
    parts[1] = primitives;
    parts[5] = new Uint32Array(materials.buffer);
    parts[6] = new Uint32Array(4);
    return parts;
  };

  it("puts emission and the emissive kind back and lists every primitive on the material as a light", () => {
    const parts = build();
    const count = restoreSphereLights(parts, { radiance: new Map([[1, [17, 12, 4]]]) });
    expect(count).toBe(2);
    expect(Array.from(parts[6])).toEqual([0, 1]);
    const materials = new Float32Array(parts[5].buffer);
    expect(Array.from(materials.slice(16 + 3, 16 + 7))).toEqual([4, 17, 12, 4]);
    expect(parts[1][3]).toBe(0); // each light's index is written back on its primitive
    expect(parts[1][7]).toBe(1);
  });

  it("refuses to proceed if the material order is not what it assumed", () => {
    const parts = build();
    new Float32Array(parts[5].buffer)[16 + 3] = 3; // material 1 packs as a dielectric, not the switched-off diffuse
    expect(() => restoreSphereLights(parts, { radiance: new Map([[1, [1, 1, 1]]]) })).toThrow(/material order/);
  });
});
