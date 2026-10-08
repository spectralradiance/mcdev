import { describe, expect, it } from "vitest";
import { buildSkyTable } from "./sky";

const f = Math.fround;

describe("buildSkyTable", () => {
  it("returns nothing for a scene without a sky, so the constant background applies", () => {
    expect(buildSkyTable({ background: [0.9, 0.95, 1] })).toBeUndefined();
  });

  it("lays out zenith, horizon and ground, and marks the sky as enabled and sunless", () => {
    const t = buildSkyTable({ sky: { zenith: [0.1, 0.2, 0.6], horizon: [0.5, 0.6, 0.7], ground: [0.2, 0.2, 0.2] } })!;
    expect(Array.from(t.slice(0, 4))).toEqual([f(0.1), f(0.2), f(0.6), 1]);
    expect(Array.from(t.slice(4, 8))).toEqual([f(0.5), f(0.6), f(0.7), 0]); // w = has sun
    expect(Array.from(t.slice(8, 11))).toEqual([f(0.2), f(0.2), f(0.2)]);
    expect(t[11]).toBe(1); // cos(radius) of a sun that isn't there
  });

  it("falls back horizon -> zenith -> background -> black, as the loader does", () => {
    const t = buildSkyTable({ background: [0.3, 0.3, 0.3], sky: {} })!;
    expect(Array.from(t.slice(0, 3))).toEqual([f(0.3), f(0.3), f(0.3)]);
    expect(Array.from(t.slice(4, 7))).toEqual([f(0.3), f(0.3), f(0.3)]);
    expect(Array.from(t.slice(8, 11))).toEqual([f(0.3), f(0.3), f(0.3)]);
  });

  it("normalises the sun direction and turns irradiance into radiance over the disc's solid angle", () => {
    const radius = 1.5;
    const t = buildSkyTable({ sky: { sun: { direction: [0, 3, 4], radiusDegrees: radius, irradiance: [3.4, 3.1, 2.7] } } })!;
    expect(t[7]).toBe(1); // has sun
    expect(Array.from(t.slice(12, 15))).toEqual([0, f(0.6), f(0.8)]);
    const cosRadius = Math.cos((radius * Math.PI) / 180);
    expect(t[11]).toBeCloseTo(cosRadius, 6);
    const solidAngle = 2 * Math.PI * (1 - cosRadius);
    expect(t[16]).toBeCloseTo(3.4 / solidAngle, 3);
    expect(t[18]).toBeCloseTo(2.7 / solidAngle, 3);
  });

  it("defaults the sun's radius to the real sun's 0.27 degrees", () => {
    const t = buildSkyTable({ sky: { sun: { direction: [0, 1, 0], irradiance: [1, 1, 1] } } })!;
    expect(t[11]).toBeCloseTo(Math.cos((0.27 * Math.PI) / 180), 6);
  });
});
