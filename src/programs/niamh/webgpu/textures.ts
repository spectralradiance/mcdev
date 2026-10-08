// Procedural textures for the WebGPU backend. rtadvanced's packer drops texture data, so the scene JSON is read here
// and turned into two small tables appended to the scene buffer: one entry per texture, then one binding per material.
// Pure data, no WebAssembly or GPU, so it can be tested alone.

export const TEXTURE_CHECKER = 0;
export const TEXTURE_NOISE = 1;

/** vec4s per texture: (kind, scale, 0, 0), first colour, second colour. */
export const TEXTURE_VEC4S = 3;

interface SceneTextureJson {
  type: string;
  colors?: [number[], number[]];
  scale?: number;
}

interface SceneMaterialJson {
  albedo?: unknown;
  bumpMap?: string;
  bumpScale?: number;
  normalMap?: string;
}

export interface SceneJson {
  textures?: Record<string, SceneTextureJson>;
  materials: Record<string, SceneMaterialJson>;
}

export interface TextureTables {
  /** Texture entries, then one (albedo texture + 1, bump texture + 1, bump scale, 0) vec4 per material. */
  data: Float32Array;
  /** Offset of the per-material bindings in vec4s, relative to the start of `data`. */
  bindingsOffset: number;
  /** What the GPU still can't do for this scene (image textures, normal maps). */
  unsupported: string[];
  /** True when at least one material uses a texture the GPU can evaluate. */
  used: boolean;
}

/**
 * Builds the tables for a scene. `materialNames` must be in rtadvanced's material order (sorted by name), since the
 * packed material index is what the shader looks bindings up by.
 */
export function buildTextureTables(scene: SceneJson, materialNames: string[]): TextureTables {
  const textures = scene.textures ?? {};
  const names = Object.keys(textures).sort();
  const index = new Map(names.map((name, i) => [name, i]));
  const unsupported = new Set<string>();

  const data = new Float32Array(4 * (TEXTURE_VEC4S * names.length + materialNames.length));
  names.forEach((name, i) => {
    const t = textures[name];
    const base = 4 * TEXTURE_VEC4S * i;
    if (t.type === "checker" || t.type === "noise") {
      const [a, b] = t.colors ?? [[1, 1, 1], [0, 0, 0]];
      data.set([t.type === "checker" ? TEXTURE_CHECKER : TEXTURE_NOISE, t.scale ?? 1, 0, 0], base);
      data.set([...a, 0], base + 4);
      data.set([...b, 0], base + 8);
    } else {
      // Left as a flat grey so a binding to it is harmless; the warning says what was dropped.
      data.set([TEXTURE_CHECKER, 1, 0, 0, 0.5, 0.5, 0.5, 0, 0.5, 0.5, 0.5, 0], base);
      unsupported.add(`${t.type} textures (drawn with their base colour)`);
    }
  });

  const bindingsOffset = TEXTURE_VEC4S * names.length;
  let used = false;
  materialNames.forEach((name, m) => {
    const material = scene.materials[name];
    let albedo = 0;
    let bump = 0;
    if (typeof material.albedo === "string") {
      const found = index.get(material.albedo);
      if (found !== undefined && ["checker", "noise"].includes(textures[material.albedo].type)) {
        albedo = found + 1;
        used = true;
      }
    }
    if (material.bumpMap !== undefined) {
      const found = index.get(material.bumpMap);
      // Bumps are taken from the noise's gradient in world space, which a uv-based checker doesn't have.
      if (found !== undefined && textures[material.bumpMap].type === "noise") {
        bump = found + 1;
        used = true;
      } else {
        unsupported.add("bump maps other than noise (ignored)");
      }
    }
    if (material.normalMap !== undefined) unsupported.add("normal maps (ignored)");
    data.set([albedo, bump, material.bumpScale ?? 1, 0], 4 * (bindingsOffset + m));
  });

  return { data, bindingsOffset, unsupported: [...unsupported], used };
}
