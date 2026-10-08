import { describe, expect, it } from "vitest";
import { expectedMse, meanRatio, relativeMse, verdict } from "./compare";

const image = (...values: number[]) => new Float32Array(values);

describe("relativeMse", () => {
  it("is zero for identical images", () => {
    expect(relativeMse(image(0.2, 0.5, 1), image(0.2, 0.5, 1))).toBe(0);
  });

  it("divides each squared difference by the reference squared plus 0.01, then averages", () => {
    // (1 - 0)^2 / (0 + 0.01) = 100, and (2 - 2)^2 / ... = 0, over 2 values.
    expect(relativeMse(image(1, 2), image(0, 2))).toBeCloseTo(50, 6);
  });

  it("takes the second image as the reference, so swapping the arguments changes the answer", () => {
    expect(relativeMse(image(0), image(1))).toBeCloseTo(1 / 1.01, 6);
    expect(relativeMse(image(1), image(0))).toBeCloseTo(100, 6);
  });

  it("rejects images of different sizes", () => {
    expect(() => relativeMse(image(1, 2), image(1))).toThrow(/size/);
  });
});

describe("meanRatio", () => {
  it("is 1 for equal total radiance and below 1 for a darker first image", () => {
    expect(meanRatio(image(1, 2, 3), image(3, 2, 1))).toBe(1);
    expect(meanRatio(image(1, 1), image(2, 2))).toBe(0.5);
  });

  it("is NaN when the reference is black, rather than a misleading number", () => {
    expect(meanRatio(image(1), image(0))).toBeNaN();
  });
});

describe("expectedMse", () => {
  it("is half the GPU-vs-GPU error for each render, with the CPU's share scaled by the sample counts", () => {
    // Equal sample counts: two renders' variance, each half the GPU-vs-GPU error.
    expect(expectedMse({ noiseMse: 0.04, cpuSpp: 64, gpuSpp: 64 })).toBeCloseTo(0.04, 9);
    // A CPU render with an eighth of the samples has eight times the variance.
    expect(expectedMse({ noiseMse: 0.0616, cpuSpp: 32, gpuSpp: 256 })).toBeCloseTo(0.0308 * 9, 6);
  });
});

describe("verdict", () => {
  const counts = { cpuSpp: 32, gpuSpp: 256 };

  it("calls out a brightness difference noise can't explain, and says which way", () => {
    expect(verdict({ mse: 0.05, noiseMse: 0.05, ratio: 0.8, ...counts })).toMatch(/darker overall by 20%/);
    expect(verdict({ mse: 0.05, noiseMse: 0.05, ratio: 1.25, ...counts })).toMatch(/brighter overall by 25%/);
  });

  it("flags an error far above what noise predicts even when brightness agrees", () => {
    expect(verdict({ mse: 2.5, noiseMse: 0.0616, ratio: 1.01, ...counts })).toMatch(/some feature may differ/);
  });

  it("accepts the Cornell box result seen in practice: 32 CPU spp against 256 GPU spp", () => {
    // Measured: mse 0.2971, GPU-vs-GPU 0.0616, ratio 0.999. Noise at these counts predicts about 0.277.
    expect(verdict({ mse: 0.2971, noiseMse: 0.0616, ratio: 0.999, ...counts })).toMatch(/noise at these sample counts predicts/);
  });
});
