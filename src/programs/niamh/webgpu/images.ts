// Image textures for the WebGPU backend. rtadvanced decodes an image into a mip pyramid of linear RGB (mipmap.cpp);
// this builds the same pyramid in JS from the decoded pixels and packs it into a flat float array the shader reads from
// the scene buffer. Pure data, so it can be tested alone.

/** A decoded image: 8-bit RGBA, rows top to bottom, as a canvas hands them back. */
export interface DecodedImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray | Uint8Array;
}

export interface PyramidLevel {
  width: number;
  height: number;
  /** Linear RGB, three floats per texel, rows top to bottom. */
  texels: Float32Array;
}

export type Pyramid = PyramidLevel[];

const decodeSrgb = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

const wrap = (i: number, n: number) => ((i % n) + n) % n;

/**
 * The image and its chain of half-size copies down to 1x1, in linear RGB. Photographs and albedo maps are sRGB encoded
 * and get decoded; data such as normal maps is stored linearly, so pass srgb = false. Alpha is dropped, as the CPU
 * loader does by asking stb_image for three channels.
 */
export function buildPyramid(image: DecodedImage, srgb: boolean): Pyramid {
  const { width, height, rgba } = image;
  if (width <= 0 || height <= 0 || rgba.length < 4 * width * height) throw new Error("image data doesn't match its size");
  const base = new Float32Array(3 * width * height);
  for (let i = 0; i < width * height; ++i) {
    for (let c = 0; c < 3; ++c) {
      const v = rgba[4 * i + c] / 255;
      base[3 * i + c] = srgb ? decodeSrgb(v) : v;
    }
  }
  const pyramid: Pyramid = [{ width, height, texels: base }];
  // Each level averages 2x2 blocks of the one before; an odd row or column count drops the last one.
  while (pyramid[pyramid.length - 1].width > 1 || pyramid[pyramid.length - 1].height > 1) {
    const fine = pyramid[pyramid.length - 1];
    const w = Math.max(1, fine.width >> 1);
    const h = Math.max(1, fine.height >> 1);
    const texels = new Float32Array(3 * w * h);
    const at = (x: number, y: number, c: number) => fine.texels[3 * (wrap(y, fine.height) * fine.width + wrap(x, fine.width)) + c];
    for (let y = 0; y < h; ++y) {
      for (let x = 0; x < w; ++x) {
        for (let c = 0; c < 3; ++c) {
          texels[3 * (y * w + x) + c] = (at(2 * x, 2 * y, c) + at(2 * x + 1, 2 * y, c) + at(2 * x, 2 * y + 1, c) + at(2 * x + 1, 2 * y + 1, c)) * 0.25;
        }
      }
    }
    pyramid.push({ width: w, height: h, texels });
  }
  return pyramid;
}

/**
 * Packs pyramids into one float array, four floats (a vec4) per entry, with offsets in vec4s from its start:
 *   one header per image:   (level count, index of its first level record, 0, 0)
 *   one record per level:   (width, height, index of its first texel, 0)
 *   then the texels:        (r, g, b, 0)
 */
export function packImages(pyramids: Pyramid[]): Float32Array {
  const levelCount = pyramids.reduce((n, p) => n + p.length, 0);
  const texelCount = pyramids.reduce((n, p) => n + p.reduce((m, l) => m + l.width * l.height, 0), 0);
  const headers = pyramids.length;
  const data = new Float32Array(4 * (headers + levelCount + texelCount));
  let record = headers;
  let texel = headers + levelCount;
  pyramids.forEach((pyramid, image) => {
    data.set([pyramid.length, record, 0, 0], 4 * image);
    for (const level of pyramid) {
      data.set([level.width, level.height, texel, 0], 4 * record);
      for (let i = 0; i < level.width * level.height; ++i) {
        data.set([level.texels[3 * i], level.texels[3 * i + 1], level.texels[3 * i + 2], 0], 4 * (texel + i));
      }
      texel += level.width * level.height;
      record += 1;
    }
  });
  return data;
}
