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
}

fn materialAt(i: u32) -> Material {
  let base = params.materialBase + 4u * i;
  let a = scene[base];
  let b = scene[base + 1u];
  let c = scene[base + 2u];
  return Material(a.xyz, u32(a.w), b.xyz, b.w, c.xyz, c.w, scene[base + 3u].xyz);
}

fn isDelta(m: Material) -> bool {
  return m.kind == DIELECTRIC || (m.kind == CONDUCTOR && m.roughness < 0.01);
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
}

fn surfaceAt(hit: Hit, o: vec3f, d: vec3f) -> Surface {
  let p = primitiveAt(hit.primitive);
  let point = o + d * hit.t;
  var outward: vec3f;
  var interpolated = vec3f(0.0);
  if (p.x == SPHERE) {
    // The inverse transpose: toObject's transpose applied to the object-space point.
    let base = params.sphereBase + 3u * p.y;
    let local = toSphereSpace(p.y, point, 1.0);
    outward = normalize(scene[base].xyz * local.x + scene[base + 1u].xyz * local.y + scene[base + 2u].xyz * local.z);
  } else if (p.x == QUAD) {
    outward = normalize(scene[params.quadBase + 4u * p.y + 3u].xyz);
  } else {
    let base = params.triangleBase + 6u * p.y;
    let p0 = scene[base];
    outward = normalize(cross(scene[base + 1u].xyz - p0.xyz, scene[base + 2u].xyz - p0.xyz));
    if (p0.w > 0.0) {
      let b0 = 1.0 - hit.uv.x - hit.uv.y;
      interpolated = normalize(scene[base + 3u].xyz * b0 + scene[base + 4u].xyz * hit.uv.x + scene[base + 5u].xyz * hit.uv.y);
    }
  }
  let frontFace = dot(d, outward) < 0.0;
  let normal = select(-outward, outward, frontFace);
  var shading = normal;
  if (dot(interpolated, interpolated) > 0.0) {
    shading = select(interpolated, -interpolated, dot(interpolated, normal) < 0.0);
  }
  return Surface(point, normal, shading, frontFace, p.z);
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

const GLOSSY_SPECULAR_PROBABILITY = 0.5;

fn evalBsdf(m: Material, wo: vec3f, wi: vec3f) -> vec3f {
  if (isDelta(m) || wo.z <= 0.0 || wi.z <= 0.0) { return vec3f(0.0); }
  if (m.kind == GLOSSY) {
    let alpha = alphaFor(m.roughness);
    let h = normalize(wo + wi);
    let specular = ggxD(h, alpha) * ggxG(wo, wi, alpha) * fresnelDielectric(dot(wo, h), m.ior) / (4.0 * wo.z * wi.z);
    let coat = (1.0 - fresnelDielectric(wo.z, m.ior)) * (1.0 - fresnelDielectric(wi.z, m.ior));
    return m.albedo * (coat * INV_PI) + vec3f(specular);
  }
  if (m.kind == CONDUCTOR) {
    let alpha = alphaFor(m.roughness);
    let h = normalize(wo + wi);
    return conductorFresnel(m, dot(wo, h)) * (ggxD(h, alpha) * ggxG(wo, wi, alpha) / (4.0 * wo.z * wi.z));
  }
  return m.albedo * INV_PI;
}

fn bsdfPdf(m: Material, wo: vec3f, wi: vec3f) -> f32 {
  if (isDelta(m) || wo.z <= 0.0 || wi.z <= 0.0) { return 0.0; }
  if (m.kind == GLOSSY) {
    return GLOSSY_SPECULAR_PROBABILITY * ggxReflectionPdf(wo, normalize(wo + wi), alphaFor(m.roughness)) +
           (1.0 - GLOSSY_SPECULAR_PROBABILITY) * wi.z * INV_PI;
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
  if (m.kind == CONDUCTOR || (m.kind == GLOSSY && uLobe < GLOSSY_SPECULAR_PROBABILITY)) {
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
    let background = scene[params.viewBase + 4u].xyz;
    addRadiance(path.pixel, path.throughput * background);
    if (pending) { recordFeatures(&path, background, vec3f(0.0)); }
    return;
  }
  let surface = surfaceAt(hit, path.origin, path.direction);
  let material = materialAt(surface.material);
  if (path.depth == 0u) { features[2u * path.pixel].w += hit.t; }
  if (material.kind == EMISSIVE) {
    if (pending) { recordFeatures(&path, material.emission, surface.shadingNormal); }
    if (surface.frontFace) {
      var weight = 1.0;
      if (params.lightCount > 0u && (path.flags & FLAG_PREVIOUS_DELTA) == 0u) {
        if (params.mode == MODE_NEE) {
          weight = powerHeuristic(path.previousPdf, lightPdf(path.origin, surface.point, surface.normal, hit.primitive));
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
  // Subsurface isn't supported on the GPU and shades as diffuse; the page warns about it.
  let k = select(material.kind, DIFFUSE, material.kind == SUBSURFACE);
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
  let surface = surfaceAt(Hit(bitcast<f32>(h.x), h.y, bitcast<vec2f>(h.zw)), path.origin, path.direction);
  let material = materialAt(surface.material);
  let dimension = 4u + 8u * path.depth;
  let frame = frameFromNormal(surface.shadingNormal);
  let wo = toLocal(frame, -path.direction);

  if (params.mode != MODE_PATH && params.lightCount > 0u && !isDelta(material) && !(params.restir != 0u && path.depth == 0u)) {
    let light = sampleLightPoint(random(path.pixel, dimension), random2(path.pixel, dimension + 1u));
    let toLight = light.point - surface.point;
    let distance = length(toLight);
    let wiWorld = toLight / distance;
    let cosLight = -dot(wiWorld, light.normal);
    if (distance > 0.0 && cosLight > 0.0 && dot(wiWorld, surface.normal) > 0.0) {
      let wi = toLocal(frame, wiWorld);
      let f = evalBsdf(material, wo, wi);
      if (any(f > vec3f(0.0))) {
        let pdf = light.areaPdf * distance * distance / cosLight;
        let emission = materialAt(primitiveAt(light.primitive).z).emission;
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
