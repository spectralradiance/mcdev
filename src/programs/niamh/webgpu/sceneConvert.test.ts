import { describe, expect, it } from "vitest";
import { cornellBoxScene, cornellFogScene, cornellSphereScene, type SceneDescription } from "../scene";
import { convertScene } from "./sceneConvert";

const parse = (scene: SceneDescription) => JSON.parse(convertScene(scene, 640, 480).json);
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: number[]) => Math.hypot(a[0], a[1], a[2]);

describe("convertScene", () => {
  it("rescales so the camera sits a fixed distance from its target", () => {
    const { camera } = parse(cornellBoxScene);
    const d = camera.position.map((p: number, i: number) => p - camera.target[i]);
    expect(norm(d)).toBeCloseTo(2.5, 5);
  });

  it("maps the Cornell box to quads for planes and boxes for boxes, keeping the film size", () => {
    const json = parse(cornellBoxScene);
    expect(json.film).toEqual({ width: 640, height: 480 });
    const types = json.shapes.map((s: { type: string }) => s.type);
    expect(types.filter((t: string) => t === "quad")).toHaveLength(5);
    expect(types.filter((t: string) => t === "box")).toHaveLength(3);
  });

  it("orients each plane quad so cross(edgeU, edgeV) points along the plane normal", () => {
    const json = parse(cornellBoxScene);
    const planes = cornellBoxScene.objects.filter((o) => o.type === "plane");
    const quads = json.shapes.filter((s: { type: string }) => s.type === "quad");
    planes.forEach((plane, i) => {
      if (plane.type !== "plane") return;
      const n = cross(quads[i].edgeU, quads[i].edgeV);
      const unit = n.map((c) => c / norm(n));
      const want = plane.normal.map((c) => c / norm(plane.normal));
      expect(dot(unit, want)).toBeCloseTo(1, 5);
    });
  });

  it("sorts materials by name, as rtadvanced's loader indexes them, and records each packed kind", () => {
    const { materialOrder } = convertScene(cornellBoxScene, 64, 64);
    const names = materialOrder.map((m) => m.name);
    expect(names).toEqual([...names].sort());
    const kinds = Object.fromEntries(materialOrder.map((m) => [m.name, m.kind]));
    expect(kinds).toMatchObject({ white: 0, glass: 3, mirror: 2, light: 4 });
  });

  it("converts GGX alpha to rtadvanced roughness (which is squared into alpha)", () => {
    const json = parse(cornellBoxScene);
    expect(json.materials.mirror.roughness).toBeCloseTo(Math.sqrt(0.02), 6);
  });

  it("attaches a scaled medium to a transparent scattering material only", () => {
    const { media } = convertScene(cornellFogScene, 64, 64);
    expect(Object.keys(media)).toEqual(["fogGlass"]);
    const s = 2.5 / norm(cornellFogScene.camera.position.map((p, i) => p - cornellFogScene.camera.target[i]));
    expect(media.fogGlass.distance[0]).toBeCloseTo(90 * s, 6);
    expect(media.fogGlass.g).toBe(0.4);
  });

  it("warns when scattering is set on a material light can't enter", () => {
    const scene: SceneDescription = {
      ...cornellBoxScene,
      materials: { ...cornellBoxScene.materials, white: { diffuse: [1, 1, 1], scatteringDistance: [10, 10, 10] } },
    };
    expect(convertScene(scene, 64, 64).unsupported.join()).toContain("non-transparent");
  });

  it("converts spheres and scales their radius", () => {
    const sphere = parse(cornellSphereScene).shapes.find((s: { type: string }) => s.type === "sphere");
    expect(sphere.radius).toBeCloseTo(100 * (2.5 / 800), 6);
  });

  it("rejects an emissive sphere, which only boxes can be", () => {
    const scene: SceneDescription = {
      ...cornellBoxScene,
      objects: [{ type: "sphere", material: "light", position: [0, 0, 0], radius: 5 }],
    };
    expect(() => convertScene(scene, 64, 64)).toThrow(/emissive sphere/);
  });
});
