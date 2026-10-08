import { describe, expect, it } from "vitest";
import { buildTextureTables, TEXTURE_CHECKER, TEXTURE_NOISE, TEXTURE_VEC4S, type SceneJson } from "./textures";

// Mirrors texture-study.json: a checker floor albedo, a noise albedo, and a glossy material bump-mapped by noise.
const scene: SceneJson = {
  textures: {
    floorTiles: { type: "checker", colors: [[0.8, 0.8, 0.8], [0.08, 0.08, 0.08]], scale: 100 },
    marble: { type: "noise", colors: [[0.15, 0.2, 0.45], [0.9, 0.85, 0.75]], scale: 3 },
    stucco: { type: "noise", colors: [[0, 0, 0], [1, 1, 1]], scale: 12 },
  },
  materials: {
    floor: { albedo: "floorTiles" },
    marble: { albedo: "marble" },
    stucco: { albedo: [0.7, 0.25, 0.15], bumpMap: "stucco", bumpScale: 0.02 },
  },
};
const materialNames = ["floor", "marble", "stucco"]; // sorted, as rtadvanced indexes them

const entry = (t: ReturnType<typeof buildTextureTables>, texture: number) =>
  Array.from(t.data.slice(4 * TEXTURE_VEC4S * texture, 4 * TEXTURE_VEC4S * (texture + 1)));
const binding = (t: ReturnType<typeof buildTextureTables>, material: number) =>
  Array.from(t.data.slice(4 * (t.bindingsOffset + material), 4 * (t.bindingsOffset + material + 1)));

describe("buildTextureTables", () => {
  const tables = buildTextureTables(scene, materialNames);

  it("lays out textures in sorted-name order with kind, scale and both colours", () => {
    // sorted: floorTiles, marble, stucco
    expect(entry(tables, 0)).toEqual([TEXTURE_CHECKER, 100, 0, 0, ...[0.8, 0.8, 0.8].map(Math.fround), 0, ...[0.08, 0.08, 0.08].map(Math.fround), 0]);
    expect(entry(tables, 1).slice(0, 2)).toEqual([TEXTURE_NOISE, 3]);
    expect(entry(tables, 2).slice(0, 2)).toEqual([TEXTURE_NOISE, 12]);
  });

  it("binds each material to its albedo and bump texture, one-based so zero means none", () => {
    expect(binding(tables, 0)).toEqual([1, 0, 1, 0]); // floor -> floorTiles
    expect(binding(tables, 1)).toEqual([2, 0, 1, 0]); // marble -> marble
    expect(binding(tables, 2)).toEqual([0, 3, Math.fround(0.02), 0]); // stucco -> bump by stucco
  });

  it("reports that textures are used and nothing is unsupported", () => {
    expect(tables.used).toBe(true);
    expect(tables.unsupported).toEqual([]);
  });

  it("flags image textures and normal maps as unsupported, and leaves the material untextured", () => {
    const t = buildTextureTables(
      { textures: { photo: { type: "image" } }, materials: { wall: { albedo: "photo", normalMap: "photo" } } },
      ["wall"],
    );
    expect(t.used).toBe(false);
    expect(t.unsupported.join()).toMatch(/image textures/);
    expect(t.unsupported.join()).toMatch(/normal maps/);
    expect(binding(t, 0)).toEqual([0, 0, 1, 0]);
  });

  it("ignores a bump map that isn't noise, since it needs uv derivatives", () => {
    const t = buildTextureTables(
      { textures: { grid: { type: "checker", colors: [[0, 0, 0], [1, 1, 1]] } }, materials: { m: { bumpMap: "grid" } } },
      ["m"],
    );
    expect(t.used).toBe(false);
    expect(t.unsupported.join()).toMatch(/bump maps other than noise/);
  });

  it("handles a scene with no textures", () => {
    const t = buildTextureTables({ materials: { a: {} } }, ["a"]);
    expect(t.used).toBe(false);
    expect(t.unsupported).toEqual([]);
    expect(t.bindingsOffset).toBe(0);
  });
});
