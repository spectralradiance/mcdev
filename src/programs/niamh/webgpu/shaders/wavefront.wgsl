// Chapters 43-44: a wavefront path tracer. rtadvanced's path loop, split at its natural seams into kernels that
// each run over a queue of the paths needing that step: extend (trace), shade (one pipeline per material class),
// and connect (shadow rays). Transport follows rtadvanced/src/integrators/path.cpp in RGB: next-event estimation,
// MIS with the power heuristic, and Russian roulette.

struct Params {
  width: u32, height: u32, maxDepth: u32, sampleIndex: u32,
  seed: u32, lightCount: u32, pathCount: u32, sortMaterials: u32,
  nodeBase: u32, primitiveBase: u32, sphereBase: u32, quadBase: u32,
  triangleBase: u32, materialBase: u32, lightBase: u32, viewBase: u32,
  // Chapter 47: direct light at the primary hit comes from ReSTIR instead of the path's own light sample.
  restir: u32,
  // 0 Whitted, 1 path tracing, 2 path tracing with NEE and MIS (the only mode ReSTIR works with).
  mode: u32,
  // Where the per-material participating-medium table starts, in vec4s; 0 when the scene has none.
  mediaBase: u32,
  // Where the sphere table starts, in vec4s: (centre, radius) per sphere, for sampling sphere lights.
  sphereTableBase: u32,
  // Texture table and per-material texture bindings, in vec4s; 0 when no material is textured.
  textureBase: u32, materialTexBase: u32,
  // Per-material extensions (sheen colour, mix definition), two vec4s each, in vec4s; 0 when there are none.
  materialExtBase: u32,
  // The sky table (zenith, horizon, ground, sun direction, sun radiance), in vec4s; 0 for a constant background.
  skyBase: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
// Every array rtadvanced packed, back to back in vec4 units; the *Base fields say where each starts.
@group(0) @binding(1) var<storage, read> scene: array<vec4f>;
// Structure of arrays: field f of path i is at f * pathCount + i, so neighbouring threads read neighbouring memory.
// Stored as u32: an integer bit-cast into f32 storage is a denormal, which D3D12 flushes to zero.
@group(0) @binding(2) var<storage, read_write> paths: array<vec4u>;
@group(0) @binding(3) var<storage, read_write> queues: array<u32>;
@group(0) @binding(4) var<storage, read_write> shadowRays: array<vec4u>;
@group(0) @binding(5) var<storage, read_write> counters: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> image: array<vec4f>;
// Two per pixel, summed over samples like the image: (albedo, depth), (normal, 0).
@group(0) @binding(7) var<storage, read_write> features: array<vec4f>;
@group(1) @binding(0) var<storage, read_write> dispatchArgs: array<u32>;

// Counter slots; must match wavefront.ts.
const RAY_COUNT = 0u;       // two: the ray queue being traced and the one being filled
const MATERIAL_COUNT = 2u;  // four: diffuse, glossy, conductor, dielectric
const ANY_COUNT = 6u;
const SHADOW_COUNT = 7u;
const PARITY = 8u;
const BOUNCE = 9u;
const ALIVE = 16u;          // 32: paths entering each bounce, summed over samples

// Queue slots, in units of pathCount.
const RAY_QUEUE = 0u;
const MATERIAL_QUEUE = 2u;
const ANY_QUEUE = 6u;

// Indirect dispatch argument slots, three words each.
const ARGS_EXTEND = 0u;
const ARGS_SHADE = 1u;  // five: four material classes, then unsorted
const ARGS_CONNECT = 6u;

const WORKGROUP = 64u;
const PI = 3.14159265358979;
const INV_PI = 0.318309886183791;
const INFINITY = 1e30;
const NO_HIT = 0xffffffffu;
const RAY_EPSILON = 1e-4;
const SHADOW_SHORTENING = 1e-3;
const ROULETTE_START = 3u;

const SPHERE = 0u;
const QUAD = 1u;

const DIFFUSE = 0u;
const GLOSSY = 1u;
const CONDUCTOR = 2u;
const DIELECTRIC = 3u;
const EMISSIVE = 4u;
const SUBSURFACE = 5u;
const SHEEN = 6u;  // not in rtadvanced's packed kinds (it packs sheen as diffuse); set from the extension table
const MIX = 7u;    // likewise, and resolved to one of its parts before shading
const ANISOTROPIC = 8u;  // an extension kind only: a conductor brushed along the surface's u direction

const FLAG_PREVIOUS_DELTA = 256u;
const FLAG_FEATURES_PENDING = 512u;
// Set while the path is inside a scattering medium; the material that owns the medium sits in bits 16..27.
const FLAG_IN_MEDIUM = 1024u;
const MEDIUM_SHIFT = 16u;
const MEDIUM_MASK = 0xfffu;

const MODE_WHITTED = 0u;
const MODE_PATH = 1u;
const MODE_NEE = 2u;

// ---- Random numbers: hashes of (seed, pixel, sample, dimension), as rtadvanced's sampler, but unstratified.

fn pcgHash(value: u32) -> u32 {
  let state = value * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn mixHash(seed: u32, value: u32) -> u32 {
  return pcgHash(seed ^ (pcgHash(value) + 0x9e3779b9u + (seed << 6u) + (seed >> 2u)));
}

fn random(pixel: u32, dimension: u32) -> f32 {
  let h = mixHash(mixHash(mixHash(params.seed, pixel), params.sampleIndex), dimension);
  return f32(h >> 8u) * (1.0 / 16777216.0);
}

fn random2(pixel: u32, dimension: u32) -> vec2f {
  return vec2f(random(pixel, dimension), random(pixel, dimension + 1u));
}

// ---- Path state: rtadvanced's PathState, now one entry in an array.

struct Path {
  origin: vec3f,
  pixel: u32,
  direction: vec3f,
  depth: u32,
  flags: u32,
  throughput: vec3f,
  previousPdf: f32,
}

fn loadPath(i: u32) -> Path {
  let n = params.pathCount;
  let a = paths[i];
  let b = paths[n + i];
  let c = paths[2u * n + i];
  return Path(bitcast<vec3f>(a.xyz), a.w, bitcast<vec3f>(b.xyz), b.w & 255u, b.w & ~255u, bitcast<vec3f>(c.xyz),
              bitcast<f32>(c.w));
}

fn storePath(i: u32, p: Path) {
  let n = params.pathCount;
  paths[i] = vec4u(bitcast<vec3u>(p.origin), p.pixel);
  paths[n + i] = vec4u(bitcast<vec3u>(p.direction), p.depth | p.flags);
  paths[2u * n + i] = vec4u(bitcast<vec3u>(p.throughput), bitcast<u32>(p.previousPdf));
}

// ---- Scene access

fn primitiveAt(i: u32) -> vec4u { return bitcast<vec4u>(scene[params.primitiveBase + i]); }
fn lightPrimitive(i: u32) -> u32 { return bitcast<u32>(scene[params.lightBase + i / 4u][i % 4u]); }

struct Material {
  albedo: vec3f,
  kind: u32,
  emission: vec3f,
  roughness: f32,
  eta: vec3f,
  ior: f32,
  k: vec3f,
  sheen: vec3f,
  // Brushed metal: roughness along v (negative when isotropic) and where u points in the shading frame, (cos, sin).
  roughnessV: f32,
  tangent: vec2f,
}

fn materialAt(i: u32) -> Material {
  let base = params.materialBase + 4u * i;
  let a = scene[base];
  let b = scene[base + 1u];
  let c = scene[base + 2u];
  var m = Material(a.xyz, u32(a.w), b.xyz, b.w, c.xyz, c.w, scene[base + 3u].xyz, vec3f(0.0), -1.0, vec2f(1.0, 0.0));
  let extension = materialExtension(i);
  if (u32(extension.w) == SHEEN) {
    m.kind = SHEEN;
    m.sheen = extension.xyz;
  } else if (u32(extension.w) == ANISOTROPIC) {
    m.roughnessV = extension.x;
  }
  return m;
}

// What the packed material can't say: (sheen rgb, SHEEN or MIX) and, for a mix, (part A, part B, amount, texture + 1).
fn materialExtension(material: u32) -> vec4f {
  if (params.materialExtBase == 0u) { return vec4f(0.0); }
  return scene[params.materialExtBase + 2u * material];
}

fn mixDefinition(material: u32) -> vec4f { return scene[params.materialExtBase + 2u * material + 1u]; }

// ---- Procedural textures, as rtadvanced/src/textures/texture.cpp. Lookups are point-sampled: progressive accumulation
// averages the jittered samples over each pixel, which is the box filter the CPU applies analytically.

const TEXTURE_CHECKER = 0u;
const BUMP_WIDTH = 0.002;  // world-space footprint for a bump where the ray cone isn't tracked

// (albedo texture + 1, bump texture + 1, bump scale, 0); all zero when the scene has no textures.
fn textureBinding(material: u32) -> vec4f {
  if (params.materialTexBase == 0u) { return vec4f(0.0); }
  return scene[params.materialTexBase + material];
}

fn isOdd(x: f32) -> bool { return (i32(floor(x)) & 1) != 0; }

fn fade(t: f32) -> f32 { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

fn gradientAt(h: u32) -> vec3f {
  var gradients = array<vec3f, 12>(
    vec3f(1, 1, 0), vec3f(-1, 1, 0), vec3f(1, -1, 0), vec3f(-1, -1, 0), vec3f(1, 0, 1), vec3f(-1, 0, 1),
    vec3f(1, 0, -1), vec3f(-1, 0, -1), vec3f(0, 1, 1), vec3f(0, -1, 1), vec3f(0, 1, -1), vec3f(0, -1, -1));
  return gradients[h % 12u];
}

// Perlin's gradient noise with a hash in place of the permutation table, the same lattice gradients as the CPU.
fn gradientNoise(p: vec3f) -> f32 {
  let cell = floor(p);
  let f = p - cell;
  let c = vec3i(cell);
  var corners: array<f32, 8>;
  for (var k = 0u; k < 8u; k += 1u) {
    let d = vec3i(i32(k & 1u), i32((k >> 1u) & 1u), i32((k >> 2u) & 1u));
    let q = c + d;
    let h = mixHash(mixHash(pcgHash(bitcast<u32>(q.x)), bitcast<u32>(q.y)), bitcast<u32>(q.z));
    corners[k] = dot(gradientAt(h), f - vec3f(d));
  }
  let u = fade(f.x);
  let v = fade(f.y);
  let w = fade(f.z);
  let x00 = mix(corners[0], corners[1], u);
  let x10 = mix(corners[2], corners[3], u);
  let x01 = mix(corners[4], corners[5], u);
  let x11 = mix(corners[6], corners[7], u);
  return mix(mix(x00, x10, v), mix(x01, x11, v), w);
}

// Octaves finer than the footprint fade out; width 0 keeps all eight.
fn fractalNoise(point: vec3f, width: f32) -> f32 {
  var octaves = 8.0;
  if (width > 0.0) { octaves = clamp(-1.0 - log2(width), 0.0, 8.0); }
  let whole = u32(octaves);
  var p = point;
  var sum = 0.0;
  var amplitude = 1.0;
  for (var i = 0u; i < whole; i += 1u) {
    sum += amplitude * gradientNoise(p);
    amplitude *= 0.5;
    p = p * 2.0;
  }
  return sum + amplitude * (octaves - f32(whole)) * gradientNoise(p);
}

// The fraction of [x - r, x + r] where floor(x) is odd, from the closed-form integral of that square wave.
fn oddIntegral(y: f32) -> f32 {
  let half = y / 2.0;
  let whole = floor(half);
  return whole + 2.0 * max(half - whole - 0.5, 0.0);
}

fn oddFraction(x: f32, r: f32) -> f32 {
  if (floor(x - r) == floor(x + r)) { return select(0.0, 1.0, isOdd(x)); }
  return (oddIntegral(x + r) - oddIntegral(x - r)) / (2.0 * r);
}

// A checker cell is the second colour when exactly one coordinate has an odd floor; box filtering is separable.
fn checkerWeight(st: vec2f, radius: f32) -> f32 {
  if (radius <= 0.0) { return select(0.0, 1.0, isOdd(st.x) != isOdd(st.y)); }
  let s = oddFraction(st.x, radius);
  let t = oddFraction(st.y, radius);
  return s + t - 2.0 * s * t;
}

// width is the ray cone's world-space footprint at the hit and uvWidth the same in uv units; both are zero where the
// footprint isn't tracked (every bounce after the camera ray), which gives the unfiltered texture.
fn evalTexture(texture: u32, uv: vec2f, point: vec3f, width: f32, uvWidth: f32) -> vec3f {
  let base = params.textureBase + 3u * texture;
  let header = scene[base];
  let color1 = scene[base + 1u].xyz;
  let color2 = scene[base + 2u].xyz;
  let scale = header.y;
  if (u32(header.x) == TEXTURE_CHECKER) {
    return mix(color1, color2, checkerWeight(uv * scale, 0.5 * uvWidth * scale));
  }
  let n = fractalNoise(point * scale, width * scale);
  return mix(color1, color2, clamp(0.5 + 0.5 * n, 0.0, 1.0));
}

fn luminance(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

// Bump mapping from the noise's gradient in world space: a displaced surface's normal is the outward normal minus the
// height's gradient across the tangent plane (what applyBump computes from uv derivatives on the CPU).
fn bumpedNormal(material: u32, point: vec3f, outward: vec3f, frontFace: bool, footprint: f32) -> vec3f {
  let binding = textureBinding(material);
  if (binding.y == 0.0) { return select(-outward, outward, frontFace); }
  let texture = u32(binding.y) - 1u;
  let t1 = frameFromNormal(outward).s;
  let t2 = cross(outward, t1);
  // Finite differences across half the footprint, so bumps smaller than a pixel smooth out, as the CPU does. Where the
  // footprint isn't tracked, a fixed small one stands in.
  let width = select(BUMP_WIDTH, footprint, footprint > 0.0);
  let delta = max(0.5 * width, 1e-4);
  let h0 = binding.z * luminance(evalTexture(texture, vec2f(0.0), point, width, 0.0));
  let h1 = binding.z * luminance(evalTexture(texture, vec2f(0.0), point + t1 * delta, width, 0.0));
  let h2 = binding.z * luminance(evalTexture(texture, vec2f(0.0), point + t2 * delta, width, 0.0));
  let bent = normalize(outward - t1 * ((h1 - h0) / delta) - t2 * ((h2 - h0) / delta));
  return select(-bent, bent, frontFace);
}

fn isDelta(m: Material) -> bool {
  return (m.kind == DIELECTRIC || m.kind == CONDUCTOR) && max(m.roughness, m.roughnessV) < 0.01;
}

// ---- Participating media. A material with a scattering distance fills the objects that use it with a homogeneous
// medium (xyz: mean free path per channel, w: Henyey-Greenstein anisotropy), appended to the scene by the host.

fn mediumAt(material: u32) -> vec4f {
  if (params.mediaBase == 0u) { return vec4f(0.0); }
  return scene[params.mediaBase + material];
}

fn hasMedium(material: u32) -> bool {
  let m = mediumAt(material);
  return m.x + m.y + m.z > 0.0;
}

fn sampleHenyeyGreenstein(w: vec3f, g: f32, u: vec2f) -> vec3f {
  var cosTheta = 1.0 - 2.0 * u.x;
  if (abs(g) > 1e-3) {
    let k = (1.0 - g * g) / (1.0 - g + 2.0 * g * u.x);
    cosTheta = (1.0 + g * g - k * k) / (2.0 * g);
  }
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  let phi = 2.0 * PI * u.y;
  let f = frameFromNormal(w);
  return toWorld(f, vec3f(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta));
}

// ---- Intersection, as rtadvanced/src/geometry/shapes.cpp. Each returns t, or INFINITY for a miss.

fn toSphereSpace(index: u32, p: vec3f, w: f32) -> vec3f {
  let base = params.sphereBase + 3u * index;
  let r0 = scene[base];
  let r1 = scene[base + 1u];
  let r2 = scene[base + 2u];
  return vec3f(dot(r0.xyz, p) + r0.w * w, dot(r1.xyz, p) + r1.w * w, dot(r2.xyz, p) + r2.w * w);
}

fn intersectSphere(index: u32, o: vec3f, d: vec3f, tMax: f32) -> f32 {
  let lo = toSphereSpace(index, o, 1.0);
  let ld = toSphereSpace(index, d, 0.0);
  let a = dot(ld, ld);
  let halfB = dot(lo, ld);
  let discriminant = halfB * halfB - a * (dot(lo, lo) - 1.0);
  if (discriminant < 0.0) { return INFINITY; }
  let root = sqrt(discriminant);
  var t = (-halfB - root) / a;
  if (t <= 0.0 || t >= tMax) {
    t = (-halfB + root) / a;
    if (t <= 0.0 || t >= tMax) { return INFINITY; }
  }
  return t;
}

fn intersectQuad(index: u32, o: vec3f, d: vec3f, tMax: f32) -> vec3f {
  let base = params.quadBase + 4u * index;
  let corner = scene[base].xyz;
  let w = scene[base + 3u].xyz;
  let normal = normalize(w);
  let denominator = dot(d, normal);
  if (abs(denominator) < 1e-9) { return vec3f(INFINITY, 0.0, 0.0); }
  let t = dot(corner - o, normal) / denominator;
  if (t <= 0.0 || t >= tMax) { return vec3f(INFINITY, 0.0, 0.0); }
  let local = o + d * t - corner;
  let a = dot(w, cross(local, scene[base + 2u].xyz));
  let b = dot(w, cross(scene[base + 1u].xyz, local));
  if (a < 0.0 || a > 1.0 || b < 0.0 || b > 1.0) { return vec3f(INFINITY, 0.0, 0.0); }
  return vec3f(t, a, b);
}

fn intersectTriangle(index: u32, o: vec3f, d: vec3f, tMax: f32) -> vec3f {
  let base = params.triangleBase + 6u * index;
  let p0 = scene[base].xyz;
  let edge1 = scene[base + 1u].xyz - p0;
  let edge2 = scene[base + 2u].xyz - p0;
  let p = cross(d, edge2);
  let determinant = dot(edge1, p);
  if (determinant == 0.0) { return vec3f(INFINITY, 0.0, 0.0); }
  let inverse = 1.0 / determinant;
  let s = o - p0;
  let u = dot(s, p) * inverse;
  if (u < 0.0 || u > 1.0) { return vec3f(INFINITY, 0.0, 0.0); }
  let q = cross(s, edge1);
  let v = dot(d, q) * inverse;
  if (v < 0.0 || u + v > 1.0) { return vec3f(INFINITY, 0.0, 0.0); }
  let t = dot(edge2, q) * inverse;
  if (t <= 0.0 || t >= tMax) { return vec3f(INFINITY, 0.0, 0.0); }
  return vec3f(t, u, v);
}

// (t, u, v), with t = INFINITY for a miss.
fn intersectPrimitive(i: u32, o: vec3f, d: vec3f, tMax: f32) -> vec3f {
  let p = primitiveAt(i);
  if (p.x == SPHERE) { return vec3f(intersectSphere(p.y, o, d, tMax), 0.0, 0.0); }
  if (p.x == QUAD) { return intersectQuad(p.y, o, d, tMax); }
  return intersectTriangle(p.y, o, d, tMax);
}

// ---- BVH traversal by hand: WebGPU exposes no ray tracing hardware (chapter 46 uses it through Vulkan).

struct Hit {
  t: f32,
  primitive: u32,
  uv: vec2f,
}

fn slab(node: u32, o: vec3f, inverse: vec3f, tMax: f32) -> f32 {
  let a = (scene[params.nodeBase + 2u * node].xyz - o) * inverse;
  let b = (scene[params.nodeBase + 2u * node + 1u].xyz - o) * inverse;
  let enter = max(max(min(a.x, b.x), min(a.y, b.y)), max(min(a.z, b.z), 0.0));
  let exit = min(min(max(a.x, b.x), max(a.y, b.y)), min(max(a.z, b.z), tMax));
  return select(INFINITY, enter, enter <= exit);
}

// Nearest-first, as Bvh::traverse. anyHit stops at the first hit, as shadow rays need.
fn traverse(o: vec3f, d: vec3f, tLimit: f32, anyHit: bool) -> Hit {
  var hit = Hit(tLimit, NO_HIT, vec2f(0.0));
  // WGSL leaves 1 / 0 undefined, so near-zero components are nudged away from zero.
  let safe = select(d, select(vec3f(-1e-12), vec3f(1e-12), d >= vec3f(0.0)), abs(d) < vec3f(1e-12));
  let inverse = 1.0 / safe;
  var stack: array<u32, 64>;
  var stackEnter: array<f32, 64>;
  let rootEnter = slab(0u, o, inverse, hit.t);
  if (rootEnter == INFINITY) { return hit; }
  stack[0] = 0u;
  stackEnter[0] = rootEnter;
  var top = 1u;
  while (top > 0u) {
    top -= 1u;
    if (stackEnter[top] > hit.t) { continue; }
    let node = stack[top];
    let first = bitcast<u32>(scene[params.nodeBase + 2u * node].w);
    let count = bitcast<u32>(scene[params.nodeBase + 2u * node + 1u].w);
    if (count > 0u) {
      for (var i = first; i < first + count; i += 1u) {
        let h = intersectPrimitive(i, o, d, hit.t);
        if (h.x < hit.t) {
          hit = Hit(h.x, i, h.yz);
          if (anyHit) { return hit; }
        }
      }
      continue;
    }
    let leftEnter = slab(first, o, inverse, hit.t);
    let rightEnter = slab(first + 1u, o, inverse, hit.t);
    if (leftEnter != INFINITY && rightEnter != INFINITY) {
      // The farther child goes on first, so the nearer is visited first and shrinks hit.t sooner.
      let leftFirst = leftEnter <= rightEnter;
      stack[top] = select(first, first + 1u, leftFirst);
      stackEnter[top] = select(leftEnter, rightEnter, leftFirst);
      stack[top + 1u] = select(first + 1u, first, leftFirst);
      stackEnter[top + 1u] = select(rightEnter, leftEnter, leftFirst);
      top += 2u;
    } else if (leftEnter != INFINITY) {
      stack[top] = first;
      stackEnter[top] = leftEnter;
      top += 1u;
    } else if (rightEnter != INFINITY) {
      stack[top] = first + 1u;
      stackEnter[top] = rightEnter;
      top += 1u;
    }
  }
  return hit;
}

// ---- Surfaces

struct Surface {
  point: vec3f,
  normal: vec3f,         // geometric, facing the incoming ray
  shadingNormal: vec3f,  // interpolated on smooth meshes, on the same side as normal
  frontFace: bool,
  material: u32,
  uv: vec2f,
  dpdu: vec3f,  // where u increases, in world units per unit of u
  width: f32,    // the ray cone's world-space footprint here, 1 / cos wider on a tilted surface; 0 if untracked
  uvWidth: f32,  // the same in uv units
}

// The ray cone the camera ray carries to a hit: one pixel's spread times the distance. The CPU keeps widening it along
// the path; here only camera rays have a footprint, and later bounces get none (full texture detail).
fn coneWidthAt(t: f32, depth: u32) -> f32 {
  if (depth != 0u) { return 0.0; }
  return t * 2.0 * scene[params.viewBase].w / f32(params.height);
}

fn surfaceAt(hit: Hit, o: vec3f, d: vec3f, coneWidth: f32) -> Surface {
  let p = primitiveAt(hit.primitive);
  let point = o + d * hit.t;
  var outward: vec3f;
  var interpolated = vec3f(0.0);
  var uv = hit.uv;  // quads and triangles: the intersection's (u, v) or barycentrics
  var dpdu = vec3f(1.0, 0.0, 0.0);
  var dpdv = vec3f(0.0, 1.0, 0.0);
  if (p.x == SPHERE) {
    // The inverse transpose: toObject's transpose applied to the object-space point.
    let base = params.sphereBase + 3u * p.y;
    let local = toSphereSpace(p.y, point, 1.0);
    outward = normalize(scene[base].xyz * local.x + scene[base + 1u].xyz * local.y + scene[base + 2u].xyz * local.z);
    uv = vec2f((atan2(local.z, local.x) + PI) / (2.0 * PI), acos(clamp(local.y, -1.0, 1.0)) / PI);
    // u runs around the y axis in object space; carry that direction to world space like a normal.
    // With uniform scale, A^-1 = r^2 A^T, so r^2 times the transpose gives world lengths.
    let r2 = pow(sphereInfo(p.y).w, 2.0);
    let around = vec3f(-local.z, 0.0, local.x) * (2.0 * PI);
    let sinTheta = max(sqrt(local.x * local.x + local.z * local.z), 1e-6);
    let down = vec3f(local.y * local.x / sinTheta, -sinTheta, local.y * local.z / sinTheta) * PI;
    dpdu = (scene[base].xyz * around.x + scene[base + 1u].xyz * around.y + scene[base + 2u].xyz * around.z) * r2;
    dpdv = (scene[base].xyz * down.x + scene[base + 1u].xyz * down.y + scene[base + 2u].xyz * down.z) * r2;
  } else if (p.x == QUAD) {
    outward = normalize(scene[params.quadBase + 4u * p.y + 3u].xyz);
    dpdu = scene[params.quadBase + 4u * p.y + 1u].xyz;
    dpdv = scene[params.quadBase + 4u * p.y + 2u].xyz;
  } else {
    let base = params.triangleBase + 6u * p.y;
    let p0 = scene[base];
    outward = normalize(cross(scene[base + 1u].xyz - p0.xyz, scene[base + 2u].xyz - p0.xyz));
    dpdu = scene[base + 1u].xyz - p0.xyz;
    dpdv = scene[base + 2u].xyz - p0.xyz;
    if (p0.w > 0.0) {
      let b0 = 1.0 - hit.uv.x - hit.uv.y;
      interpolated = normalize(scene[base + 3u].xyz * b0 + scene[base + 4u].xyz * hit.uv.x + scene[base + 5u].xyz * hit.uv.y);
    }
  }
  let frontFace = dot(d, outward) < 0.0;
  // The cone's cross-section stretches by 1 / cos on a tilted surface, and |dpdu x dpdv| is world area per unit of uv
  // area, so its square root turns world lengths into uv lengths.
  let width = coneWidth / max(abs(dot(d, outward)), 1e-3);
  let uvArea = length(cross(dpdu, dpdv));
  let uvWidth = select(0.0, width / sqrt(uvArea), uvArea > 0.0);
  let normal = select(-outward, outward, frontFace);
  var shading = normal;
  if (dot(interpolated, interpolated) > 0.0) {
    shading = select(interpolated, -interpolated, dot(interpolated, normal) < 0.0);
  }
  // A mix is resolved to one of its parts here, so textures, bumps and the BSDF all see the part. As the CPU does, a hash
  // of the point picks the part, so the extend and shade kernels, which both come through here, agree.
  var material = p.z;
  if (u32(materialExtension(material).w) == MIX) {
    let mix = mixDefinition(material);
    var amount = mix.z;
    if (mix.w != 0.0 && params.textureBase != 0u) {
      amount = luminance(evalTexture(u32(mix.w) - 1u, uv, point, width, uvWidth));
    }
    var h = 0x6d6978u;
    h = mixHash(h, bitcast<u32>(point.x));
    h = mixHash(h, bitcast<u32>(point.y));
    h = mixHash(h, bitcast<u32>(point.z));
    let r = f32(pcgHash(h) >> 8u) * (1.0 / 16777216.0);
    material = u32(select(mix.x, mix.y, r < amount));
  }
  shading = bumpedNormal(material, point, select(-shading, shading, frontFace), frontFace, width);
  return Surface(point, normal, shading, frontFace, material, uv, dpdu, width, uvWidth);
}

// The material at a surface point: its constant parameters, with the albedo replaced by its texture where it has one.
fn surfaceMaterial(surface: Surface) -> Material {
  var material = materialAt(surface.material);
  let binding = textureBinding(surface.material);
  if (binding.x != 0.0) {
    material.albedo = evalTexture(u32(binding.x) - 1u, surface.uv, surface.point, surface.width, surface.uvWidth);
  }
  if (material.kind == CONDUCTOR && isAnisotropic(material)) {
    // Where u points, in the plane of the frame the integrator builds from the shading normal.
    let frame = frameFromNormal(surface.shadingNormal);
    let t = vec2f(dot(surface.dpdu, frame.s), dot(surface.dpdu, frame.t));
    let size = length(t);
    if (size > 0.0) { material.tangent = t / size; }
  }
  return material;
}

fn spawnOrigin(point: vec3f, normal: vec3f, direction: vec3f) -> vec3f {
  return point + normal * select(-RAY_EPSILON, RAY_EPSILON, dot(direction, normal) > 0.0);
}

struct Frame {
  s: vec3f,
  t: vec3f,
  n: vec3f,
}

fn frameFromNormal(n: vec3f) -> Frame {
  let sign = select(-1.0, 1.0, n.z >= 0.0);
  let a = -1.0 / (sign + n.z);
  let b = n.x * n.y * a;
  return Frame(vec3f(1.0 + sign * n.x * n.x * a, sign * b, -sign * n.x), vec3f(b, sign + n.y * n.y * a, -n.y), n);
}

fn toLocal(f: Frame, v: vec3f) -> vec3f { return vec3f(dot(v, f.s), dot(v, f.t), dot(v, f.n)); }
fn toWorld(f: Frame, v: vec3f) -> vec3f { return f.s * v.x + f.t * v.y + f.n * v.z; }

// ---- Sampling, as rtadvanced/src/sampling/warp.h

fn concentricDisk(u: vec2f) -> vec2f {
  let x = 2.0 * u.x - 1.0;
  let y = 2.0 * u.y - 1.0;
  if (x == 0.0 && y == 0.0) { return vec2f(0.0); }
  if (abs(x) > abs(y)) {
    let theta = PI / 4.0 * (y / x);
    return x * vec2f(cos(theta), sin(theta));
  }
  let theta = PI / 2.0 - PI / 4.0 * (x / y);
  return y * vec2f(cos(theta), sin(theta));
}

fn cosineHemisphere(u: vec2f) -> vec3f {
  let d = concentricDisk(u);
  return vec3f(d, sqrt(max(0.0, 1.0 - dot(d, d))));
}

// ---- The sky and the sun, as Scene::skyRadiance / sunRadiance / sampleSun. Without a sky table the background is the
// constant one in the view block, as before.

fn skyRadiance(direction: vec3f) -> vec3f {
  let base = params.skyBase;
  if (base == 0u || scene[base].w == 0.0) { return scene[params.viewBase + 4u].xyz; }
  let zenith = scene[base].xyz;
  let horizon = scene[base + 1u].xyz;
  let ground = scene[base + 2u].xyz;
  let y = direction.y / length(direction);
  // The square root keeps the sky pale near the horizon and deepens it overhead; below, the ground fades in.
  if (y >= 0.0) { return horizon + (zenith - horizon) * sqrt(y); }
  return horizon + (ground - horizon) * min(1.0, -y * 10.0);
}

fn hasSun() -> bool { return params.skyBase != 0u && scene[params.skyBase + 1u].w != 0.0; }

fn sunRadiance(direction: vec3f) -> vec3f {
  if (!hasSun()) { return vec3f(0.0); }
  let base = params.skyBase;
  if (dot(direction, scene[base + 3u].xyz) < scene[base + 2u].w * length(direction)) { return vec3f(0.0); }
  return scene[base + 4u].xyz;
}

fn sunPdf() -> f32 { return 1.0 / (2.0 * PI * (1.0 - scene[params.skyBase + 2u].w)); }

// The chance a light sample goes to the sun, which competes with the area lights as one more light. ReSTIR resamples
// area lights only, so with it the sun is found by BSDF sampling alone.
fn sunChoice() -> f32 {
  if (!hasSun() || params.restir != 0u) { return 0.0; }
  return 1.0 / (f32(params.lightCount) + 1.0);
}

// Uniform over the cone of directions the disc subtends.
fn sampleSunDirection(u: vec2f) -> vec3f {
  let base = params.skyBase;
  let cosTheta = 1.0 - u.x * (1.0 - scene[base + 2u].w);
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  let phi = 2.0 * PI * u.y;
  return toWorld(frameFromNormal(scene[base + 3u].xyz), vec3f(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta));
}

// ---- The camera, as rtadvanced/src/camera/camera.h. The view block adds (background, projection) and
// (blades, blade rotation, half the field of view, 0) after the four rows setCamera rewrites.

const PERSPECTIVE = 0u;
const ORTHOGRAPHIC = 1u;
const FISHEYE = 2u;
const EQUIRECTANGULAR = 3u;

// Uniform over a regular polygon inscribed in the unit disk: pick a wedge, then a point in its triangle.
fn sampleAperture(u: vec2f, blades: u32, rotation: f32) -> vec2f {
  if (blades < 3u) { return concentricDisk(u); }
  let scaled = u.x * f32(blades);
  let wedge = min(u32(scaled), blades - 1u);
  let s = sqrt(scaled - f32(wedge));
  let step = 2.0 * PI / f32(blades);
  let a0 = rotation + step * f32(wedge);
  return (1.0 - s) * vec2f(cos(a0), sin(a0)) + (u.y * s) * vec2f(cos(a0 + step), sin(a0 + step));
}

struct CameraRay {
  origin: vec3f,
  direction: vec3f,
}

fn cameraRay(film: vec2f, lens: vec2f) -> CameraRay {
  let v = params.viewBase;
  let position = scene[v];
  let forward = scene[v + 1u];
  let right = scene[v + 2u];
  let up = scene[v + 3u].xyz;
  let projection = u32(scene[v + 4u].w);
  let aperture = scene[v + 5u];
  let halfHeight = position.w;
  let aspect = f32(params.width) / f32(params.height);
  let x = 2.0 * film.x - 1.0;
  let y = 1.0 - 2.0 * film.y;
  if (projection == ORTHOGRAPHIC) {
    return CameraRay(position.xyz + (right.xyz * (x * aspect) + up * y) * (halfHeight * right.w), forward.xyz);
  }
  if (projection == FISHEYE) {
    let p = vec2f(x * aspect, y);
    let r = length(p);
    if (r == 0.0) { return CameraRay(position.xyz, forward.xyz); }
    let theta = r * aperture.z;
    return CameraRay(position.xyz, normalize(forward.xyz * cos(theta) + (right.xyz * p.x + up * p.y) * (sin(theta) / r)));
  }
  if (projection == EQUIRECTANGULAR) {
    let longitude = x * PI;
    let latitude = y * PI / 2.0;
    let c = cos(latitude);
    return CameraRay(position.xyz, normalize(forward.xyz * (c * cos(longitude)) + right.xyz * (c * sin(longitude)) +
                                             up * sin(latitude)));
  }
  var direction = forward.xyz + right.xyz * (x * halfHeight * aspect) + up * (y * halfHeight);
  var origin = position.xyz;
  if (forward.w > 0.0) {
    let focusPoint = origin + direction * right.w;
    let disk = sampleAperture(lens, u32(aperture.x), aperture.y);
    origin += (right.xyz * disk.x + up * disk.y) * forward.w;
    direction = focusPoint - origin;
  }
  return CameraRay(origin, normalize(direction));
}

fn powerHeuristic(pdf: f32, other: f32) -> f32 {
  let a = pdf * pdf;
  let b = other * other;
  return select(a / (a + b), 0.0, a + b == 0.0);
}

// ---- Materials, as rtadvanced/src/materials/bsdf.cpp, in RGB

fn alphaFor(roughness: f32) -> f32 { return max(roughness * roughness, 1e-3); }

fn ggxD(h: vec3f, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let denominator = h.z * h.z * (a2 - 1.0) + 1.0;
  return a2 / (PI * denominator * denominator);
}

fn ggxLambda(w: vec3f, alpha: f32) -> f32 {
  let cos2 = w.z * w.z;
  if (cos2 == 0.0) { return INFINITY; }
  let tan2 = max(0.0, 1.0 - cos2) / cos2;
  return (sqrt(1.0 + alpha * alpha * tan2) - 1.0) / 2.0;
}

fn ggxG(wo: vec3f, wi: vec3f, alpha: f32) -> f32 {
  return 1.0 / (1.0 + ggxLambda(wo, alpha) + ggxLambda(wi, alpha));
}

fn sampleGgxVisibleNormal(wo: vec3f, alpha: f32, u: vec2f) -> vec3f {
  let v = normalize(vec3f(alpha * wo.x, alpha * wo.y, wo.z));
  let lengthSquared = v.x * v.x + v.y * v.y;
  let t1 = select(vec3f(1.0, 0.0, 0.0), vec3f(-v.y, v.x, 0.0) / sqrt(lengthSquared), lengthSquared > 0.0);
  let t2 = cross(v, t1);
  let r = sqrt(u.x);
  let phi = 2.0 * PI * u.y;
  let p1 = r * cos(phi);
  let s = 0.5 * (1.0 + v.z);
  let p2 = (1.0 - s) * sqrt(max(0.0, 1.0 - p1 * p1)) + s * r * sin(phi);
  let n = t1 * p1 + t2 * p2 + v * sqrt(max(0.0, 1.0 - p1 * p1 - p2 * p2));
  return normalize(vec3f(alpha * n.x, alpha * n.y, max(1e-6, n.z)));
}

fn ggxReflectionPdf(wo: vec3f, h: vec3f, alpha: f32) -> f32 {
  return ggxD(h, alpha) / ((1.0 + ggxLambda(wo, alpha)) * 4.0 * wo.z);
}

fn fresnelDielectric(cosThetaI: f32, eta: f32) -> f32 {
  let cosI = clamp(cosThetaI, 0.0, 1.0);
  let sin2T = (1.0 - cosI * cosI) / (eta * eta);
  if (sin2T >= 1.0) { return 1.0; }
  let cosT = sqrt(1.0 - sin2T);
  let parallel = (eta * cosI - cosT) / (eta * cosI + cosT);
  let perpendicular = (cosI - eta * cosT) / (cosI + eta * cosT);
  return (parallel * parallel + perpendicular * perpendicular) / 2.0;
}

// Complex numbers as (real, imaginary), for the conductor Fresnel term.
fn cMul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
fn cDiv(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }
fn cSqrt(z: vec2f) -> vec2f {
  let m = length(z);
  return vec2f(sqrt(max(0.0, (m + z.x) / 2.0)), select(-1.0, 1.0, z.y >= 0.0) * sqrt(max(0.0, (m - z.x) / 2.0)));
}

fn fresnelConductor(cosThetaI: f32, eta: f32, k: f32) -> f32 {
  let cosI = clamp(cosThetaI, 0.0, 1.0);
  let e = vec2f(eta, k);
  let cosT = cSqrt(vec2f(1.0, 0.0) - cDiv(vec2f(1.0 - cosI * cosI, 0.0), cMul(e, e)));
  let parallel = cDiv(e * cosI - cosT, e * cosI + cosT);
  let ect = cMul(e, cosT);
  let perpendicular = cDiv(vec2f(cosI, 0.0) - ect, vec2f(cosI, 0.0) + ect);
  return (dot(parallel, parallel) + dot(perpendicular, perpendicular)) / 2.0;
}

fn conductorFresnel(m: Material, cosTheta: f32) -> vec3f {
  return vec3f(fresnelConductor(cosTheta, m.eta.x, m.k.x), fresnelConductor(cosTheta, m.eta.y, m.k.y),
               fresnelConductor(cosTheta, m.eta.z, m.k.z));
}

// ---- Rough dielectric: GGX microfacet reflection and transmission, after pbrt-v4's DielectricBxDF. wo is always on the
// +z side (the shading frame faces the incoming ray); wi.z < 0 is transmission. eta is n_transmitted / n_incident for wo.

// Whether the ray is entering the object; eval and pdf need it for eta. Set where a surface is shaded.
var<private> bsdfEntering = true;

fn isRoughDielectric(m: Material) -> bool { return m.kind == DIELECTRIC && !isDelta(m); }

fn dielectricEta(entering: bool, ior: f32) -> f32 { return select(1.0 / ior, ior, entering); }

struct Microfacet {
  wm: vec3f,
  valid: bool,
  reflect: bool,
  etap: f32,
}

// The microfacet normal that sends wo to wi, whether by reflection or refraction.
fn dielectricHalfVector(wo: vec3f, wi: vec3f, eta: f32) -> Microfacet {
  let cosO = wo.z;
  let cosI = wi.z;
  let reflect = cosI * cosO > 0.0;
  let etap = select(eta, 1.0, reflect);
  var wm = wi * etap + wo;
  if (cosI == 0.0 || cosO == 0.0 || dot(wm, wm) == 0.0) { return Microfacet(vec3f(0.0), false, reflect, etap); }
  wm = normalize(wm);
  if (wm.z < 0.0) { wm = -wm; }
  // A microfacet facing away from either direction can't have scattered between them.
  if (dot(wm, wi) * cosI < 0.0 || dot(wm, wo) * cosO < 0.0) { return Microfacet(wm, false, reflect, etap); }
  return Microfacet(wm, true, reflect, etap);
}

// The density of visible normals from wo, as sampleGgxVisibleNormal draws them.
fn visibleNormalDensity(wo: vec3f, wm: vec3f, alpha: f32) -> f32 {
  return ggxD(wm, alpha) / (1.0 + ggxLambda(wo, alpha)) * abs(dot(wo, wm)) / abs(wo.z);
}

fn roughDielectricEval(m: Material, wo: vec3f, wi: vec3f, eta: f32) -> vec3f {
  if (wo.z <= 0.0) { return vec3f(0.0); }
  let alpha = alphaFor(m.roughness);
  let mf = dielectricHalfVector(wo, wi, eta);
  if (!mf.valid) { return vec3f(0.0); }
  let F = fresnelDielectric(dot(wo, mf.wm), eta);
  let D = ggxD(mf.wm, alpha);
  let G = ggxG(wo, wi, alpha);
  if (mf.reflect) { return vec3f(D * G * F / abs(4.0 * wi.z * wo.z)); }
  let denominator = pow(dot(wi, mf.wm) + dot(wo, mf.wm) / mf.etap, 2.0);
  let transmitted = D * (1.0 - F) * G * abs(dot(wi, mf.wm) * dot(wo, mf.wm) / (wi.z * wo.z * denominator));
  // Radiance, not importance, is what travels back along a camera path: the 1 / eta^2 compresses it.
  return m.albedo * (transmitted / (mf.etap * mf.etap));
}

fn roughDielectricPdf(m: Material, wo: vec3f, wi: vec3f, eta: f32) -> f32 {
  if (wo.z <= 0.0) { return 0.0; }
  let alpha = alphaFor(m.roughness);
  let mf = dielectricHalfVector(wo, wi, eta);
  if (!mf.valid) { return 0.0; }
  // Reflection or transmission is chosen with probability F or 1 - F at the sampled microfacet normal.
  let F = fresnelDielectric(dot(wo, mf.wm), eta);
  let density = visibleNormalDensity(wo, mf.wm, alpha);
  if (mf.reflect) { return density / (4.0 * abs(dot(wo, mf.wm))) * F; }
  let denominator = pow(dot(wi, mf.wm) + dot(wo, mf.wm) / mf.etap, 2.0);
  return density * (abs(dot(wi, mf.wm)) / denominator) * (1.0 - F);
}

fn sampleRoughDielectric(m: Material, wo: vec3f, uLobe: f32, u: vec2f, entering: bool) -> BsdfSample {
  var s = BsdfSample(vec3f(0.0), vec3f(0.0), 0.0, false, false);
  let eta = dielectricEta(entering, m.ior);
  let wm = sampleGgxVisibleNormal(wo, alphaFor(m.roughness), u);
  let cosI = dot(wo, wm);
  if (cosI <= 0.0) { return s; }
  var wi: vec3f;
  if (uLobe < fresnelDielectric(cosI, eta)) {
    wi = reflectAbout(wo, wm);
    if (wi.z <= 0.0) { return s; }
  } else {
    let sin2T = (1.0 - cosI * cosI) / (eta * eta);
    if (sin2T >= 1.0) { return s; }
    wi = -wo / eta + (cosI / eta - sqrt(1.0 - sin2T)) * wm;
    if (wi.z >= 0.0) { return s; }
  }
  // Evaluate through the same functions NEE and MIS use, so the three always agree.
  let pdf = roughDielectricPdf(m, wo, wi, eta);
  if (pdf <= 0.0) { return s; }
  s.wi = wi;
  s.pdf = pdf;
  s.weight = roughDielectricEval(m, wo, wi, eta) * (abs(wi.z) / pdf);
  s.ok = true;
  return s;
}

// ---- Brushed metal: GGX with a different alpha along each tangent axis, as rtadvanced/src/materials/bsdf.cpp.

fn isAnisotropic(m: Material) -> bool { return m.roughnessV >= 0.0 && m.roughnessV != m.roughness; }

// Turns a local direction so the surface's u direction lies along +x, where the anisotropic formulas expect it.
fn toTangentFrame(w: vec3f, t: vec2f) -> vec3f { return vec3f(t.x * w.x + t.y * w.y, -t.y * w.x + t.x * w.y, w.z); }
fn fromTangentFrame(w: vec3f, t: vec2f) -> vec3f { return vec3f(t.x * w.x - t.y * w.y, t.y * w.x + t.x * w.y, w.z); }

fn brushedAlpha(m: Material) -> vec2f { return vec2f(alphaFor(m.roughness), alphaFor(m.roughnessV)); }

fn ggxDAniso(h: vec3f, alpha: vec2f) -> f32 {
  let e = h.x * h.x / (alpha.x * alpha.x) + h.y * h.y / (alpha.y * alpha.y) + h.z * h.z;
  return 1.0 / (PI * alpha.x * alpha.y * e * e);
}

fn ggxLambdaAniso(w: vec3f, alpha: vec2f) -> f32 {
  let cos2 = w.z * w.z;
  if (cos2 == 0.0) { return INFINITY; }
  let tan2Alpha2 = (alpha.x * alpha.x * w.x * w.x + alpha.y * alpha.y * w.y * w.y) / cos2;
  return (sqrt(1.0 + tan2Alpha2) - 1.0) / 2.0;
}

fn ggxGAniso(wo: vec3f, wi: vec3f, alpha: vec2f) -> f32 {
  return 1.0 / (1.0 + ggxLambdaAniso(wo, alpha) + ggxLambdaAniso(wi, alpha));
}

fn sampleGgxVisibleNormalAniso(wo: vec3f, alpha: vec2f, u: vec2f) -> vec3f {
  let v = normalize(vec3f(alpha.x * wo.x, alpha.y * wo.y, wo.z));
  let lengthSquared = v.x * v.x + v.y * v.y;
  let t1 = select(vec3f(1.0, 0.0, 0.0), vec3f(-v.y, v.x, 0.0) / sqrt(lengthSquared), lengthSquared > 0.0);
  let t2 = cross(v, t1);
  let r = sqrt(u.x);
  let phi = 2.0 * PI * u.y;
  let p1 = r * cos(phi);
  let s = 0.5 * (1.0 + v.z);
  let p2 = (1.0 - s) * sqrt(max(0.0, 1.0 - p1 * p1)) + s * r * sin(phi);
  let n = t1 * p1 + t2 * p2 + v * sqrt(max(0.0, 1.0 - p1 * p1 - p2 * p2));
  return normalize(vec3f(alpha.x * n.x, alpha.y * n.y, max(1e-6, n.z)));
}

fn ggxReflectionPdfAniso(wo: vec3f, h: vec3f, alpha: vec2f) -> f32 {
  return ggxDAniso(h, alpha) / ((1.0 + ggxLambdaAniso(wo, alpha)) * 4.0 * wo.z);
}

const GLOSSY_SPECULAR_PROBABILITY = 0.5;

fn evalBsdf(m: Material, wo: vec3f, wi: vec3f) -> vec3f {
  if (isRoughDielectric(m)) { return roughDielectricEval(m, wo, wi, dielectricEta(bsdfEntering, m.ior)); }
  if (isDelta(m) || wo.z <= 0.0 || wi.z <= 0.0) { return vec3f(0.0); }
  if (m.kind == GLOSSY) {
    let alpha = alphaFor(m.roughness);
    let h = normalize(wo + wi);
    let specular = ggxD(h, alpha) * ggxG(wo, wi, alpha) * fresnelDielectric(dot(wo, h), m.ior) / (4.0 * wo.z * wi.z);
    let coat = (1.0 - fresnelDielectric(wo.z, m.ior)) * (1.0 - fresnelDielectric(wi.z, m.ior));
    return m.albedo * (coat * INV_PI) + vec3f(specular);
  }
  if (m.kind == CONDUCTOR && isAnisotropic(m)) {
    let o = toTangentFrame(wo, m.tangent);
    let i = toTangentFrame(wi, m.tangent);
    let alpha = brushedAlpha(m);
    let h = normalize(o + i);
    return conductorFresnel(m, dot(o, h)) * (ggxDAniso(h, alpha) * ggxGAniso(o, i, alpha) / (4.0 * o.z * i.z));
  }
  if (m.kind == CONDUCTOR) {
    let alpha = alphaFor(m.roughness);
    let h = normalize(wo + wi);
    return conductorFresnel(m, dot(wo, h)) * (ggxD(h, alpha) * ggxG(wo, wi, alpha) / (4.0 * wo.z * wi.z));
  }
  if (m.kind == SHEEN) { return evalSheen(m, wo, wi); }
  return m.albedo * INV_PI;
}

// Velvet and cloth: a Lambertian base plus a lobe that brightens toward grazing angles. The Charlie distribution and
// Neubelt and Pettineo's visibility term (Estevez and Kulla 2017), as rtadvanced/src/materials/bsdf.cpp.
fn evalSheen(m: Material, wo: vec3f, wi: vec3f) -> vec3f {
  let h = normalize(wo + wi);
  let inverseAlpha = 1.0 / max(m.roughness * m.roughness, 1e-3);
  let sinTheta = sqrt(max(0.0, 1.0 - h.z * h.z));
  let d = (2.0 + inverseAlpha) * pow(sinTheta, inverseAlpha) / (2.0 * PI);
  let visibility = 1.0 / (4.0 * (wi.z + wo.z - wi.z * wo.z));
  return m.albedo * INV_PI + m.sheen * (d * visibility);
}

fn bsdfPdf(m: Material, wo: vec3f, wi: vec3f) -> f32 {
  if (isRoughDielectric(m)) { return roughDielectricPdf(m, wo, wi, dielectricEta(bsdfEntering, m.ior)); }
  if (isDelta(m) || wo.z <= 0.0 || wi.z <= 0.0) { return 0.0; }
  if (m.kind == GLOSSY) {
    return GLOSSY_SPECULAR_PROBABILITY * ggxReflectionPdf(wo, normalize(wo + wi), alphaFor(m.roughness)) +
           (1.0 - GLOSSY_SPECULAR_PROBABILITY) * wi.z * INV_PI;
  }
  if (m.kind == CONDUCTOR && isAnisotropic(m)) {
    let o = toTangentFrame(wo, m.tangent);
    let i = toTangentFrame(wi, m.tangent);
    return ggxReflectionPdfAniso(o, normalize(o + i), brushedAlpha(m));
  }
  if (m.kind == CONDUCTOR) { return ggxReflectionPdf(wo, normalize(wo + wi), alphaFor(m.roughness)); }
  return wi.z * INV_PI;
}

struct BsdfSample {
  wi: vec3f,
  weight: vec3f,  // f cos / pdf
  pdf: f32,
  delta: bool,
  ok: bool,
}

fn reflectAbout(w: vec3f, h: vec3f) -> vec3f { return h * (2.0 * dot(w, h)) - w; }

fn sampleBsdf(m: Material, wo: vec3f, uLobe: f32, u: vec2f, entering: bool) -> BsdfSample {
  var s = BsdfSample(vec3f(0.0), vec3f(0.0), 0.0, false, false);
  if (wo.z <= 0.0) { return s; }
  if (isRoughDielectric(m)) { return sampleRoughDielectric(m, wo, uLobe, u, entering); }
  if (m.kind == DIELECTRIC) {
    let eta = select(1.0 / m.ior, m.ior, entering);
    let reflectance = fresnelDielectric(wo.z, eta);
    s.delta = true;
    s.ok = true;
    if (uLobe < reflectance) {
      s.wi = vec3f(-wo.x, -wo.y, wo.z);
      s.pdf = reflectance;
      s.weight = vec3f(1.0);
      return s;
    }
    let cosT = sqrt(max(0.0, 1.0 - (1.0 - wo.z * wo.z) / (eta * eta)));
    s.wi = vec3f(-wo.x / eta, -wo.y / eta, -cosT);
    s.pdf = 1.0 - reflectance;
    s.weight = m.albedo / (eta * eta);
    return s;
  }
  if (m.kind == CONDUCTOR && isDelta(m)) {
    s.wi = vec3f(-wo.x, -wo.y, wo.z);
    s.pdf = 1.0;
    s.weight = conductorFresnel(m, wo.z);
    s.delta = true;
    s.ok = true;
    return s;
  }
  if (m.kind == CONDUCTOR && isAnisotropic(m)) {
    let local = toTangentFrame(wo, m.tangent);
    s.wi = fromTangentFrame(reflectAbout(local, sampleGgxVisibleNormalAniso(local, brushedAlpha(m), u)), m.tangent);
  } else if (m.kind == CONDUCTOR || (m.kind == GLOSSY && uLobe < GLOSSY_SPECULAR_PROBABILITY)) {
    s.wi = reflectAbout(wo, sampleGgxVisibleNormal(wo, alphaFor(m.roughness), u));
  } else {
    s.wi = cosineHemisphere(u);
  }
  s.pdf = bsdfPdf(m, wo, s.wi);
  if (s.pdf <= 0.0) { return s; }
  s.weight = evalBsdf(m, wo, s.wi) * (abs(s.wi.z) / s.pdf);
  s.ok = true;
  return s;
}

// ---- Lights, as Scene::sampleLightPoint and Scene::lightPdf

fn sphereInfo(index: u32) -> vec4f { return scene[params.sphereTableBase + index]; }

fn lightArea(primitive: u32) -> f32 {
  let p = primitiveAt(primitive);
  if (p.x == SPHERE) {
    let radius = sphereInfo(p.y).w;
    return 4.0 * PI * radius * radius;
  }
  if (p.x == QUAD) { return scene[params.quadBase + 4u * p.y].w; }
  let base = params.triangleBase + 6u * p.y;
  let p0 = scene[base].xyz;
  return 0.5 * length(cross(scene[base + 1u].xyz - p0, scene[base + 2u].xyz - p0));
}

struct LightPoint {
  point: vec3f,
  normal: vec3f,
  primitive: u32,
  areaPdf: f32,
}

fn sampleLightPoint(uSelect: f32, u: vec2f) -> LightPoint {
  let count = params.lightCount;
  return lightPointOn(lightPrimitive(min(u32(uSelect * f32(count)), count - 1u)), u);
}

// The point u picks on one light, uniformly by area. ReSTIR stores (primitive, u) and comes back here.
fn lightPointOn(primitive: u32, u: vec2f) -> LightPoint {
  let count = params.lightCount;
  let p = primitiveAt(primitive);
  var point: vec3f;
  var normal: vec3f;
  if (p.x == SPHERE) {
    // Uniform by area. Points on the far side face away from the shading point and are rejected by the cosine test.
    let s = sphereInfo(p.y);
    let z = 1.0 - 2.0 * u.x;
    let ring = sqrt(max(0.0, 1.0 - z * z));
    let phi = 2.0 * PI * u.y;
    normal = vec3f(ring * cos(phi), ring * sin(phi), z);
    point = s.xyz + normal * s.w;
  } else if (p.x == QUAD) {
    let base = params.quadBase + 4u * p.y;
    point = scene[base].xyz + scene[base + 1u].xyz * u.x + scene[base + 2u].xyz * u.y;
    normal = normalize(scene[base + 3u].xyz);
  } else {
    let base = params.triangleBase + 6u * p.y;
    let p0 = scene[base].xyz;
    let p1 = scene[base + 1u].xyz;
    let p2 = scene[base + 2u].xyz;
    let s = sqrt(u.x);
    point = p0 * s * (1.0 - u.y) + p1 * (1.0 - s) + p2 * (u.y * s);
    normal = normalize(cross(p1 - p0, p2 - p0));
  }
  return LightPoint(point, normal, primitive, 1.0 / (lightArea(primitive) * f32(count)));
}

fn lightPdf(reference: vec3f, point: vec3f, normal: vec3f, primitive: u32) -> f32 {
  let toLight = point - reference;
  let distanceSquared = dot(toLight, toLight);
  let cosLight = abs(dot(toLight, normal)) / sqrt(distanceSquared);
  if (cosLight == 0.0) { return 0.0; }
  return distanceSquared / (cosLight * lightArea(primitive) * f32(params.lightCount));
}

// ---- Output. Each path owns its pixel for the whole sample, so no atomics are needed.

fn recordFeatures(p: ptr<function, Path>, albedo: vec3f, normal: vec3f) {
  let tinted = min(albedo * ((*p).throughput.x + (*p).throughput.y + (*p).throughput.z) / 3.0, vec3f(1.0));
  features[2u * (*p).pixel] += vec4f(tinted, 0.0);
  features[2u * (*p).pixel + 1u] += vec4f(normal, 0.0);
  (*p).flags &= ~FLAG_FEATURES_PENDING;
}

fn addRadiance(pixel: u32, value: vec3f) {
  image[pixel] += vec4f(value, 0.0);
}

// ---- Kernels

@compute @workgroup_size(WORKGROUP)
fn generate(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i == 0u) {
    // prepareExtend flips parity before each bounce, so the first bounce reads queue 0.
    atomicStore(&counters[PARITY], 1u);
    atomicStore(&counters[BOUNCE], 0u);
    atomicStore(&counters[RAY_COUNT], params.pathCount);
  }
  if (i >= params.pathCount) { return; }
  let jitter = random2(i, 0u);
  let film = vec2f((f32(i % params.width) + jitter.x) / f32(params.width),
                   (f32(i / params.width) + jitter.y) / f32(params.height));
  let ray = cameraRay(film, random2(i, 2u));
  storePath(i, Path(ray.origin, i, ray.direction, 0u, FLAG_PREVIOUS_DELTA | FLAG_FEATURES_PENDING, vec3f(1.0), 0.0));
  queues[RAY_QUEUE * params.pathCount + i] = i;
}

fn setArgs(slot: u32, count: u32) {
  dispatchArgs[3u * slot] = (count + WORKGROUP - 1u) / WORKGROUP;
  dispatchArgs[3u * slot + 1u] = 1u;
  dispatchArgs[3u * slot + 2u] = 1u;
}

// A single thread between stages turns queue lengths into dispatch sizes, so the CPU never reads them back.
@compute @workgroup_size(1)
fn prepareExtend() {
  let parity = atomicLoad(&counters[PARITY]) ^ 1u;
  atomicStore(&counters[PARITY], parity);
  let count = atomicLoad(&counters[RAY_COUNT + parity]);
  setArgs(ARGS_EXTEND, count);
  let bounce = atomicLoad(&counters[BOUNCE]);
  if (bounce < 32u) { atomicAdd(&counters[ALIVE + bounce], count); }
  atomicStore(&counters[BOUNCE], bounce + 1u);
  atomicStore(&counters[RAY_COUNT + (parity ^ 1u)], 0u);
  for (var k = 0u; k < 4u; k += 1u) { atomicStore(&counters[MATERIAL_COUNT + k], 0u); }
  atomicStore(&counters[ANY_COUNT], 0u);
  atomicStore(&counters[SHADOW_COUNT], 0u);
}

@compute @workgroup_size(1)
fn prepareShade() {
  for (var k = 0u; k < 4u; k += 1u) { setArgs(ARGS_SHADE + k, atomicLoad(&counters[MATERIAL_COUNT + k])); }
  setArgs(ARGS_SHADE + 4u, atomicLoad(&counters[ANY_COUNT]));
}

@compute @workgroup_size(1)
fn prepareConnect() {
  setArgs(ARGS_CONNECT, atomicLoad(&counters[SHADOW_COUNT]));
}

// Trace each queued ray. Misses and lights finish here; everything else is sorted into its material's queue.
@compute @workgroup_size(WORKGROUP)
fn extend(@builtin(global_invocation_id) id: vec3u) {
  let parity = atomicLoad(&counters[PARITY]);
  if (id.x >= atomicLoad(&counters[RAY_COUNT + parity])) { return; }
  let i = queues[(RAY_QUEUE + parity) * params.pathCount + id.x];
  var path = loadPath(i);
  let hit = traverse(path.origin, path.direction, INFINITY, false);
  let pending = (path.flags & FLAG_FEATURES_PENDING) != 0u;
  if (path.depth == 0u) {
    // Kept for every primary ray, misses included: the real-time passes read it.
    paths[3u * params.pathCount + i] = vec4u(bitcast<u32>(hit.t), hit.primitive, bitcast<vec2u>(hit.uv));
  }
  if ((path.flags & FLAG_IN_MEDIUM) != 0u) {
    let m = mediumAt((path.flags >> MEDIUM_SHIFT) & MEDIUM_MASK);
    let meanFreePath = (m.x + m.y + m.z) / 3.0;
    if (meanFreePath > 0.0) {
      let scatterAt = -log(max(random(path.pixel, 1000u + 4u * path.depth), 1e-6)) * meanFreePath;
      if (scatterAt < select(INFINITY, hit.t, hit.primitive != NO_HIT)) {
        // Scattered before reaching the surface. No light sampling inside the medium: the boundary would block it,
        // so light is found by the path leaving the medium, which makes this a delta-like event for MIS.
        if (path.depth >= params.maxDepth) { return; }
        path.origin += path.direction * scatterAt;
        path.direction = sampleHenyeyGreenstein(path.direction, m.w, random2(path.pixel, 1001u + 4u * path.depth));
        path.throughput *= m.xyz / meanFreePath;
        path.flags |= FLAG_PREVIOUS_DELTA;
        path.depth += 1u;
        storePath(i, path);
        let next = atomicLoad(&counters[PARITY]) ^ 1u;
        queues[(RAY_QUEUE + next) * params.pathCount + atomicAdd(&counters[RAY_COUNT + next], 1u)] = i;
        return;
      }
    }
  }
  if (hit.primitive == NO_HIT) {
    let sky = skyRadiance(path.direction);
    var arriving = sky;
    let sun = sunRadiance(path.direction);
    if (any(sun > vec3f(0.0))) {
      var weight = 1.0;
      if (params.mode != MODE_PATH && (path.flags & FLAG_PREVIOUS_DELTA) == 0u) {
        if (params.mode == MODE_NEE) {
          if (sunChoice() > 0.0) { weight = powerHeuristic(path.previousPdf, sunPdf() * sunChoice()); }
        } else {
          weight = 0.0;  // the shadow ray toward the sun already counted it
        }
      }
      arriving += sun * weight;
    }
    addRadiance(path.pixel, path.throughput * arriving);
    if (pending) { recordFeatures(&path, sky, vec3f(0.0)); }
    return;
  }
  let surface = surfaceAt(hit, path.origin, path.direction, coneWidthAt(hit.t, path.depth));
  let material = surfaceMaterial(surface);
  if (path.depth == 0u) { features[2u * path.pixel].w += hit.t; }
  if (material.kind == EMISSIVE) {
    if (pending) { recordFeatures(&path, material.emission, surface.shadingNormal); }
    if (surface.frontFace) {
      var weight = 1.0;
      if (params.lightCount > 0u && (path.flags & FLAG_PREVIOUS_DELTA) == 0u) {
        if (params.mode == MODE_NEE) {
          weight = powerHeuristic(path.previousPdf, lightPdf(path.origin, surface.point, surface.normal, hit.primitive) * (1.0 - sunChoice()));
          // ReSTIR already counted all direct light at the primary hit.
          if (params.restir != 0u && path.depth == 1u) { weight = 0.0; }
        } else if (params.mode == MODE_WHITTED) {
          weight = 0.0;  // direct light was already added by the shadow ray
        }
        // MODE_PATH: no light sampling, so BSDF-sampled emission counts in full.
      }
      addRadiance(path.pixel, path.throughput * material.emission * weight);
    }
    return;
  }
  if (pending && !isDelta(material)) { recordFeatures(&path, material.albedo, surface.shadingNormal); }
  if (path.depth >= params.maxDepth) { return; }
  storePath(i, path);
  paths[3u * params.pathCount + i] = vec4u(bitcast<u32>(hit.t), hit.primitive, bitcast<vec2u>(hit.uv));
  // Subsurface isn't supported on the GPU and shades as diffuse, and sheen is a diffuse variant; the page warns about the former.
  let k = select(material.kind, DIFFUSE, material.kind == SUBSURFACE || material.kind == SHEEN);
  if (params.sortMaterials != 0u) {
    queues[(MATERIAL_QUEUE + k) * params.pathCount + atomicAdd(&counters[MATERIAL_COUNT + k], 1u)] = i;
  } else {
    queues[ANY_QUEUE * params.pathCount + atomicAdd(&counters[ANY_COUNT], 1u)] = i;
  }
}

// The queue this pipeline drains: a material class, or 99 for the unsorted queue.
override MATERIAL_CLASS: u32 = 99u;

// Light sampling (a shadow ray for connect to trace) and BSDF sampling (the next ray for extend).
@compute @workgroup_size(WORKGROUP)
fn shade(@builtin(global_invocation_id) id: vec3u) {
  let sorted = MATERIAL_CLASS < 4u;
  if (id.x >= atomicLoad(&counters[select(ANY_COUNT, MATERIAL_COUNT + MATERIAL_CLASS, sorted)])) { return; }
  let i = queues[select(ANY_QUEUE, MATERIAL_QUEUE + MATERIAL_CLASS, sorted) * params.pathCount + id.x];
  var path = loadPath(i);
  let h = paths[3u * params.pathCount + i];
  let surface = surfaceAt(Hit(bitcast<f32>(h.x), h.y, bitcast<vec2f>(h.zw)), path.origin, path.direction,
                          coneWidthAt(bitcast<f32>(h.x), path.depth));
  let material = surfaceMaterial(surface);
  let dimension = 4u + 8u * path.depth;
  bsdfEntering = surface.frontFace;
  let frame = frameFromNormal(surface.shadingNormal);
  let wo = toLocal(frame, -path.direction);

  let sun = sunChoice();
  if (params.mode != MODE_PATH && (params.lightCount > 0u || sun > 0.0) && !isDelta(material) &&
      !(params.restir != 0u && path.depth == 0u)) {
    // One light is picked: the sun with probability sunChoice, otherwise an area light.
    let uSelect = random(path.pixel, dimension);
    var wiWorld = vec3f(0.0);
    var distance = INFINITY;
    var pdf = 0.0;
    var emission = vec3f(0.0);
    if (uSelect < sun) {
      wiWorld = sampleSunDirection(random2(path.pixel, dimension + 1u));
      pdf = sunPdf() * sun;
      emission = sunRadiance(wiWorld);
    } else {
      let light = sampleLightPoint(min((uSelect - sun) / (1.0 - sun), 0.99999994), random2(path.pixel, dimension + 1u));
      let toLight = light.point - surface.point;
      distance = length(toLight);
      wiWorld = toLight / distance;
      let cosLight = -dot(wiWorld, light.normal);
      if (distance > 0.0 && cosLight > 0.0) {
        pdf = light.areaPdf * (1.0 - sun) * distance * distance / cosLight;
        emission = materialAt(primitiveAt(light.primitive).z).emission;
      }
    }
    if (pdf > 0.0 && (dot(wiWorld, surface.normal) > 0.0 || isRoughDielectric(material))) {
      let wi = toLocal(frame, wiWorld);
      let f = evalBsdf(material, wo, wi);
      if (any(f > vec3f(0.0))) {
        // Whitted shades direct light only, so there is no BSDF strategy to weigh the light sample against.
        let misWeight = select(1.0, powerHeuristic(pdf, bsdfPdf(material, wo, wi)), params.mode == MODE_NEE);
        let contribution = path.throughput * f * emission * (abs(wi.z) * misWeight / pdf);
        let slot = atomicAdd(&counters[SHADOW_COUNT], 1u);
        shadowRays[3u * slot] = vec4u(bitcast<vec3u>(spawnOrigin(surface.point, surface.normal, wiWorld)),
                                      bitcast<u32>(distance * (1.0 - SHADOW_SHORTENING)));
        shadowRays[3u * slot + 1u] = vec4u(bitcast<vec3u>(wiWorld), path.pixel);
        shadowRays[3u * slot + 2u] = vec4u(bitcast<vec3u>(contribution), 0u);
      }
    }
  }

  // Whitted ray tracing only follows mirror and glass bounces; a diffuse surface is lit directly and ends the path.
  if (params.mode == MODE_WHITTED && !isDelta(material)) { return; }

  let s = sampleBsdf(material, wo, random(path.pixel, dimension + 3u), random2(path.pixel, dimension + 4u), surface.frontFace);
  if (!s.ok) { return; }
  let wi = toWorld(frame, s.wi);
  // A direction the shading normal calls reflected but the surface calls transmitted would leak light.
  if ((dot(wi, surface.normal) > 0.0) != (s.wi.z > 0.0)) { return; }
  path.throughput *= s.weight;
  path.flags = select(path.flags & ~FLAG_PREVIOUS_DELTA, path.flags | FLAG_PREVIOUS_DELTA, s.delta);
  if (s.wi.z < 0.0) {
    // Refracted through the surface: entering an object brings its medium along, leaving it drops the medium.
    path.flags &= ~(FLAG_IN_MEDIUM | (MEDIUM_MASK << MEDIUM_SHIFT));
    if (surface.frontFace && hasMedium(surface.material)) {
      path.flags |= FLAG_IN_MEDIUM | (surface.material << MEDIUM_SHIFT);
    }
  }
  path.previousPdf = s.pdf;
  path.origin = spawnOrigin(surface.point, surface.normal, wi);
  path.direction = wi;
  path.depth += 1u;
  if (path.depth >= ROULETTE_START) {
    let survival = min(max(path.throughput.x, max(path.throughput.y, path.throughput.z)), 0.95);
    if (random(path.pixel, dimension + 6u) >= survival) { return; }
    path.throughput /= survival;
  }
  storePath(i, path);
  let next = atomicLoad(&counters[PARITY]) ^ 1u;
  queues[(RAY_QUEUE + next) * params.pathCount + atomicAdd(&counters[RAY_COUNT + next], 1u)] = i;
}

@compute @workgroup_size(WORKGROUP)
fn connect(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= atomicLoad(&counters[SHADOW_COUNT])) { return; }
  let a = shadowRays[3u * id.x];
  let b = shadowRays[3u * id.x + 1u];
  if (traverse(bitcast<vec3f>(a.xyz), bitcast<vec3f>(b.xyz), bitcast<f32>(a.w), true).primitive == NO_HIT) {
    addRadiance(b.w, bitcast<vec3f>(shadowRays[3u * id.x + 2u].xyz));
  }
}
