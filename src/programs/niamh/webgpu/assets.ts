// Scenes that come with files of their own: a scene JSON served over HTTP and the image files its textures name. The
// bytes go into the WebAssembly file system, where rtadvanced decodes them for the CPU renderer, and are decoded again
// here, with the browser, for the GPU's copy. Browser APIs, so not covered by the unit tests.

import type { DecodedImage } from "./images";

export interface AssetScene {
  /** The scene's JSON as text, as the loader will read it. */
  json: string;
  /** The raw bytes of each image file, keyed by the path the scene gives. */
  files: Map<string, Uint8Array>;
  /** The same images decoded to pixels. */
  images: Map<string, DecodedImage>;
}

/** Decodes PNG, JPEG and the like to 8-bit RGBA, leaving the pixel values as stored (no colour conversion). */
export async function decodeImage(bytes: Uint8Array): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D canvas is unavailable, so images can't be decoded");
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, rgba: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
  } finally {
    bitmap.close();
  }
}

/** Fetches a scene file and every image its textures refer to, relative to the scene's own address. */
export async function loadAssetScene(url: string): Promise<AssetScene> {
  const base = new URL(url, window.location.href);
  const response = await fetch(base);
  if (!response.ok) throw new Error(`couldn't load scene ${url} (${response.status})`);
  const json = await response.text();
  const parsed = JSON.parse(json) as { textures?: Record<string, { type: string; file?: string }> };

  const files = new Map<string, Uint8Array>();
  const images = new Map<string, DecodedImage>();
  for (const texture of Object.values(parsed.textures ?? {})) {
    if (texture.type !== "image" || !texture.file || files.has(texture.file)) continue;
    const imageResponse = await fetch(new URL(texture.file, base));
    if (!imageResponse.ok) throw new Error(`couldn't load image ${texture.file} (${imageResponse.status})`);
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    files.set(texture.file, bytes);
    images.set(texture.file, await decodeImage(bytes));
  }
  return { json, files, images };
}
