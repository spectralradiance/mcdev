import { describe, expect, it } from "vitest";
import { buildPyramid, packImages, type DecodedImage } from "./images";

// A width x height image whose texel i has the red value given by `red(i)`; green and blue are zero, alpha opaque.
const image = (width: number, height: number, red: (i: number) => number): DecodedImage => {
  const rgba = new Uint8ClampedArray(4 * width * height);
  for (let i = 0; i < width * height; ++i) rgba.set([red(i), 0, 0, 255], 4 * i);
  return { width, height, rgba };
};

describe("buildPyramid", () => {
  it("decodes sRGB bytes to linear, and leaves linear data as it is", () => {
    const one = image(1, 1, () => 128);
    expect(buildPyramid(one, true)[0].texels[0]).toBeCloseTo(0.2158605, 5); // sRGB 128/255 in linear light
    expect(buildPyramid(one, false)[0].texels[0]).toBeCloseTo(128 / 255, 6);
    expect(buildPyramid(image(1, 1, () => 255), true)[0].texels[0]).toBeCloseTo(1, 6);
    expect(buildPyramid(image(1, 1, () => 0), true)[0].texels[0]).toBe(0);
  });

  it("drops alpha: a transparent pixel keeps its colour", () => {
    const rgba = new Uint8ClampedArray([200, 100, 50, 0]);
    const [level] = buildPyramid({ width: 1, height: 1, rgba }, false);
    expect(Array.from(level.texels)).toEqual([200 / 255, 100 / 255, 50 / 255].map(Math.fround));
  });

  it("builds levels down to 1x1, each averaging 2x2 blocks of the one before", () => {
    // A 4x4 image of reds 0, 40, 80, ... as raw (linear) values.
    const pyramid = buildPyramid(image(4, 4, (i) => i * 16), false);
    expect(pyramid.map((l) => [l.width, l.height])).toEqual([[4, 4], [2, 2], [1, 1]]);
    // Level 1, top-left: mean of reds at texels 0, 1, 4, 5 = (0 + 16 + 64 + 80) / 4 = 40.
    expect(pyramid[1].texels[0]).toBeCloseTo(40 / 255, 6);
    // Level 2 is the mean of the whole image: reds average (0 + ... + 240) / 16 = 120.
    expect(pyramid[2].texels[0]).toBeCloseTo(120 / 255, 6);
  });

  it("halves each side with a floor of one, so a non-square image keeps going on its long side", () => {
    const pyramid = buildPyramid(image(8, 2, () => 100), false);
    expect(pyramid.map((l) => [l.width, l.height])).toEqual([[8, 2], [4, 1], [2, 1], [1, 1]]);
  });

  it("drops the last row and column of an odd size, as the CPU does", () => {
    const pyramid = buildPyramid(image(3, 3, (i) => i * 10), false);
    expect(pyramid.map((l) => [l.width, l.height])).toEqual([[3, 3], [1, 1]]);
    // The 1x1 level averages the top-left 2x2 block: reds at texels 0, 1, 3, 4 = (0 + 10 + 30 + 40) / 4 = 20.
    expect(pyramid[1].texels[0]).toBeCloseTo(20 / 255, 6);
  });

  it("rejects pixel data too short for the stated size", () => {
    expect(() => buildPyramid({ width: 2, height: 2, rgba: new Uint8ClampedArray(4) }, false)).toThrow(/size/);
  });
});

describe("packImages", () => {
  const a = buildPyramid(image(2, 2, (i) => 10 * (i + 1)), false); // levels 2x2, 1x1
  const b = buildPyramid(image(1, 1, () => 255), false); // one level
  const packed = packImages([a, b]);
  const vec4 = (i: number) => Array.from(packed.slice(4 * i, 4 * i + 4));

  it("starts with one header per image: level count and where its level records begin", () => {
    // Layout, in vec4s: 2 headers, 3 level records (2 for a, 1 for b), then texels.
    expect(vec4(0)).toEqual([2, 2, 0, 0]);
    expect(vec4(1)).toEqual([1, 4, 0, 0]);
  });

  it("follows with a record per level: size and where its texels begin", () => {
    const firstTexel = 2 + 3; // headers + level records
    expect(vec4(2)).toEqual([2, 2, firstTexel, 0]); // a, level 0: four texels
    expect(vec4(3)).toEqual([1, 1, firstTexel + 4, 0]); // a, level 1: one texel
    expect(vec4(4)).toEqual([1, 1, firstTexel + 5, 0]); // b: one texel
  });

  it("stores the texels as vec4 linear RGB", () => {
    const firstTexel = 5;
    expect(vec4(firstTexel)).toEqual([10 / 255, 0, 0, 0].map(Math.fround));
    expect(vec4(firstTexel + 3)).toEqual([40 / 255, 0, 0, 0].map(Math.fround));
    expect(vec4(firstTexel + 5)[0]).toBe(1); // b's only texel
    expect(packed.length).toBe(4 * (2 + 3 + 4 + 1 + 1));
  });
});
