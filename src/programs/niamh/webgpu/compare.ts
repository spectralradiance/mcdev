// Measures how closely two renders of the same scene agree. Used to check the WebGPU tracer against rtadvanced's own
// CPU path tracer. Pure functions over linear RGB (three floats per pixel), so they can be tested alone.

/**
 * The page's original measure: the mean over channels of (a - b)^2 / (b^2 + 0.01), taking b as the reference. The
 * 0.01 keeps near-black pixels from dominating. It falls as either image takes more samples.
 */
export function relativeMse(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error("images differ in size");
  let error = 0;
  for (let i = 0; i < a.length; ++i) error += (a[i] - b[i]) ** 2 / (b[i] * b[i] + 0.01);
  return error / a.length;
}

/** Mean radiance of `a` over that of `b`: 1 for unbiased agreement, below 1 when `a` is darker overall. */
export function meanRatio(a: Float32Array, b: Float32Array): number {
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < a.length; ++i) {
    sumA += a[i];
    sumB += b[i];
  }
  return sumB > 0 ? sumA / sumB : NaN;
}

export interface Comparison {
  width: number;
  height: number;
  /** rtadvanced's CPU render and the GPU render, linear RGB. */
  cpu: Float32Array;
  gpu: Float32Array;
  cpuSpp: number;
  gpuSpp: number;
  cpuSeconds: number;
  gpuSeconds: number;
  /** relativeMse(cpu, gpu). */
  mse: number;
  /** relativeMse between two independent GPU renders: what noise alone does at this sample count. */
  noiseMse: number;
  /** meanRatio(cpu, gpu). */
  ratio: number;
  /** Anything that makes the two renders differ on purpose. */
  notes: string[];
}

/**
 * The error two unbiased renders of the same scene should show from noise alone. Two GPU renders differ by twice the
 * GPU's variance, so one render's is half of `noiseMse`. Variance falls as 1 / samples, so the CPU render, with its own
 * sample count, contributes that variance scaled by gpuSpp / cpuSpp, and the two add.
 */
export function expectedMse(c: Pick<Comparison, "noiseMse" | "cpuSpp" | "gpuSpp">): number {
  return (c.noiseMse / 2) * (1 + c.gpuSpp / c.cpuSpp);
}

/**
 * A plain-language reading of the numbers: whether the renders are the same brightness, and whether the remaining
 * error is what noise at these sample counts predicts. The estimate is rough (it assumes both tracers have the same
 * per-sample variance), so the bar is loose; a clear excess means a feature differs, not a small bias.
 */
export function verdict(c: Pick<Comparison, "mse" | "noiseMse" | "ratio" | "cpuSpp" | "gpuSpp">): string {
  const off = Math.abs(c.ratio - 1);
  if (off > 0.1) {
    return `The CPU render is ${c.ratio < 1 ? "darker" : "brighter"} overall by ${(off * 100).toFixed(0)}%, which noise doesn't explain.`;
  }
  if (c.mse > 2 * expectedMse(c) + 0.01) {
    return "Brightness agrees, but the error is well above what noise predicts: some feature may differ.";
  }
  return "Brightness agrees and the error is what noise at these sample counts predicts.";
}
