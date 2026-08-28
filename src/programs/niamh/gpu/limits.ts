// Fixed capacities baked into the shader as #define constants (see renderer.ts,
// which substitutes these into the GLSL source so the two never drift apart).

export const MAX_OBJECTS = 16;
export const MAX_MATERIALS = 16;
export const MAX_LIGHTS = 4;
export const MAX_BOUNCES = 16;
