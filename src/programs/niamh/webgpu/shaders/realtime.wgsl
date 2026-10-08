// Chapter 47: real time. One sample per pixel per frame, made usable by reuse:
//  - ReSTIR DI (Bitterli et al. 2020) picks the primary hit's light sample by resampling many candidates, then
//    reuses samples from last frame's reservoir and from neighbouring pixels.
//  - Temporal accumulation reprojects last frame's result through the camera motion and blends.
//  - An edge-avoiding a-trous filter, as rtadvanced/src/film/denoise.cpp, cleans up what's left.
// Appended to wavefront.wgsl at build time, so it shares the scene, traversal, and BSDF code.

// Everything real-time mode keeps, in one buffer so the kernels stay within WebGPU's default of 8 storage buffers
// per stage. Sections, in vec4 units from the *Base fields:
//   reservoirs: three slots (scratch, and this and last frame's final), two per pixel:
//               (light primitive, u, v, M), (weight sum, W, target function value, 0)
//   gbuffer:    per parity and pixel, (position, distance from the camera), (shading normal, material + 1; 0 for none)
//   history:    per parity and pixel, (demodulated illumination, frames), (first moment, second moment, variance, 0)
//   filtered:   two ping-pong slots per pixel, (illumination, variance)
//   output:     per pixel, the final colour
@group(2) @binding(0) var<storage, read_write> rt: array<vec4u>;
@group(2) @binding(1) var<uniform> frame: FrameParams;

struct FrameParams {
  // Last frame's camera, laid out as the scene's view block: (position, halfHeight), forward, right, up.
  previousPosition: vec4f,
  previousForward: vec4f,
  previousRight: vec4f,
  previousUp: vec4f,
  parity: u32,
  candidates: u32,
  temporalReuse: u32,
  spatialReuse: u32,
  maxHistory: f32,
  hasPrevious: u32,
  reservoirBase: u32,
  gbufferBase: u32,
  historyBase: u32,
  filteredBase: u32,
  outputBase: u32,
  pad: u32,
}

const SCRATCH = 0u;
const FINAL = 1u;  // two slots: FINAL + parity
// Targets below this count as zero: D3D12 flushes denormals, and dividing by a flushed one gives infinity.
const MIN_TARGET = 1e-20;

fn loadF(i: u32) -> vec4f { return bitcast<vec4f>(rt[i]); }
fn storeF(i: u32, v: vec4f) { rt[i] = bitcast<vec4u>(v); }

fn gbufferIndex(parity: u32, pixel: u32) -> u32 { return frame.gbufferBase + 2u * (parity * params.pathCount + pixel); }
fn historyIndex(parity: u32, pixel: u32) -> u32 { return frame.historyBase + 2u * (parity * params.pathCount + pixel); }
fn filteredIndex(slot: u32, pixel: u32) -> u32 { return frame.filteredBase + slot * params.pathCount + pixel; }

// ---- Reservoirs

struct Reservoir {
  primitive: u32,
  uv: vec2f,
  m: f32,
  weightSum: f32,
  w: f32,            // the unbiased contribution weight W
  targetValue: f32,  // the target function at the pixel that owns this reservoir
}

fn emptyReservoir() -> Reservoir { return Reservoir(NO_HIT, vec2f(0.0), 0.0, 0.0, 0.0, 0.0); }

fn loadReservoir(slot: u32, pixel: u32) -> Reservoir {
  let base = frame.reservoirBase + 2u * (slot * params.pathCount + pixel);
  let a = rt[base];
  let b = rt[base + 1u];
  return Reservoir(a.x, bitcast<vec2f>(a.yz), bitcast<f32>(a.w), bitcast<f32>(b.x), bitcast<f32>(b.y), bitcast<f32>(b.z));
}

fn storeReservoir(slot: u32, pixel: u32, r: Reservoir) {
  let base = frame.reservoirBase + 2u * (slot * params.pathCount + pixel);
  rt[base] = vec4u(r.primitive, bitcast<vec2u>(r.uv), bitcast<u32>(r.m));
  rt[base + 1u] = vec4u(bitcast<u32>(r.weightSum), bitcast<u32>(r.w), bitcast<u32>(r.targetValue), 0u);
}

// Weighted reservoir sampling: keep the new sample with probability weight / running total.
fn update(r: ptr<function, Reservoir>, primitive: u32, uv: vec2f, weight: f32, targetValue: f32, u: f32) {
  if (!(weight > 0.0) || targetValue <= MIN_TARGET) { return; }
  (*r).weightSum += weight;
  if (u * (*r).weightSum < weight) {
    (*r).primitive = primitive;
    (*r).uv = uv;
    (*r).targetValue = targetValue;
  }
}

fn finalize(r: ptr<function, Reservoir>) {
  (*r).w = select(0.0, (*r).weightSum / ((*r).m * (*r).targetValue), (*r).targetValue > MIN_TARGET && (*r).m > 0.0);
}

// ---- The primary surface

struct Primary {
  surface: Surface,
  material: Material,
  frame: Frame,
  wo: vec3f,
  valid: bool,
}

fn primaryAt(pixel: u32) -> Primary {
  let h = paths[3u * params.pathCount + pixel];
  var p: Primary;
  p.valid = false;
  if (h.y == NO_HIT) { return p; }
  let path = loadPath(pixel);
  p.surface = surfaceAt(Hit(bitcast<f32>(h.x), h.y, bitcast<vec2f>(h.zw)), path.origin, path.direction);
  p.material = materialAt(p.surface.material);
  p.frame = frameFromNormal(p.surface.shadingNormal);
  p.wo = toLocal(p.frame, -path.direction);
  p.valid = !isDelta(p.material) && p.material.kind != EMISSIVE;
  return p;
}

// The light's point for a stored sample, and the unshadowed contribution f Le cos cos / d^2 it brings.
struct LightContribution {
  point: vec3f,
  value: vec3f,
}

fn lightContribution(p: Primary, primitive: u32, uv: vec2f) -> LightContribution {
  let light = lightPointOn(primitive, uv);
  let toLight = light.point - p.surface.point;
  let d2 = dot(toLight, toLight);
  let wiWorld = toLight * inverseSqrt(d2);
  let cosLight = -dot(wiWorld, light.normal);
  if (cosLight <= 0.0 || dot(wiWorld, p.surface.normal) <= 0.0) { return LightContribution(light.point, vec3f(0.0)); }
  let wi = toLocal(p.frame, wiWorld);
  let emission = materialAt(primitiveAt(primitive).z).emission;
  return LightContribution(light.point, evalBsdf(p.material, p.wo, wi) * emission * (abs(wi.z) * cosLight / d2));
}

fn luminanceOf(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

fn visible(origin: vec3f, normal: vec3f, to: vec3f) -> bool {
  let d = to - origin;
  let distance = length(d);
  let direction = d / distance;
  return traverse(spawnOrigin(origin, normal, direction), direction, distance * (1.0 - SHADOW_SHORTENING), true).primitive == NO_HIT;
}

// ---- ReSTIR, one thread per pixel, after the primary rays are traced

// Resample `candidates` light samples by their unshadowed contribution; keep one, and check it can see the light.
@compute @workgroup_size(WORKGROUP)
fn restirCandidates(@builtin(global_invocation_id) id: vec3u) {
  let pixel = id.x;
  if (pixel >= params.pathCount) { return; }
  let p = primaryAt(pixel);
  let g = gbufferIndex(frame.parity, pixel);
  let h = paths[3u * params.pathCount + pixel];
  if (h.y == NO_HIT) {
    storeF(g, vec4f(0.0));
    storeF(g + 1u, vec4f(0.0));
  } else {
    storeF(g, vec4f(p.surface.point, bitcast<f32>(h.x)));
    storeF(g + 1u, vec4f(p.surface.shadingNormal, f32(p.surface.material + 1u)));
  }
  var r = emptyReservoir();
  if (p.valid && params.lightCount > 0u) {
    for (var k = 0u; k < frame.candidates; k += 1u) {
      let uv = random2(pixel, 1001u + 3u * k);
      let light = sampleLightPoint(random(pixel, 1000u + 3u * k), uv);
      let value = luminanceOf(lightContribution(p, light.primitive, uv).value);
      update(&r, light.primitive, uv, value / light.areaPdf, value, random(pixel, 2000u + k));
    }
    r.m = f32(frame.candidates);
    finalize(&r);
    if (r.w > 0.0 && !visible(p.surface.point, p.surface.normal, lightPointOn(r.primitive, r.uv).point)) { r.w = 0.0; }
  }
  storeReservoir(SCRATCH, pixel, r);
}

// Where a world point was on screen last frame, or -1 when it was off screen or behind the camera.
fn reproject(point: vec3f) -> i32 {
  if (frame.hasPrevious == 0u) { return -1; }
  let d = point - frame.previousPosition.xyz;
  let depth = dot(d, frame.previousForward.xyz);
  if (depth <= 0.0) { return -1; }
  let halfHeight = frame.previousPosition.w;
  let aspect = f32(params.width) / f32(params.height);
  let fx = (dot(d, frame.previousRight.xyz) / (depth * halfHeight * aspect) + 1.0) * 0.5;
  let fy = (1.0 - dot(d, frame.previousUp.xyz) / (depth * halfHeight)) * 0.5;
  if (fx < 0.0 || fx >= 1.0 || fy < 0.0 || fy >= 1.0) { return -1; }
  return i32(u32(fy * f32(params.height)) * params.width + u32(fx * f32(params.width)));
}

// Same surface? Same material, normals within about 25 degrees, and distances from the camera within 10%.
fn similar(a: u32, aParity: u32, b: u32, bParity: u32, expectedDistance: f32) -> bool {
  let ma = loadF(gbufferIndex(aParity, a) + 1u);
  let mb = loadF(gbufferIndex(bParity, b) + 1u);
  let distance = loadF(gbufferIndex(bParity, b)).w;
  return ma.w > 0.0 && ma.w == mb.w && dot(ma.xyz, mb.xyz) > 0.9 && abs(distance - expectedDistance) < 0.1 * expectedDistance;
}

// Merge a reservoir from another pixel or frame, re-weighting its sample by its value here.
fn merge(r: ptr<function, Reservoir>, other: Reservoir, p: Primary, u: f32) {
  if (other.primitive != NO_HIT) {
    let value = luminanceOf(lightContribution(p, other.primitive, other.uv).value);
    update(r, other.primitive, other.uv, value * other.w * other.m, value, u);
  }
  (*r).m += other.m;
}

@compute @workgroup_size(WORKGROUP)
fn restirTemporal(@builtin(global_invocation_id) id: vec3u) {
  let pixel = id.x;
  if (pixel >= params.pathCount || frame.temporalReuse == 0u) { return; }
  let p = primaryAt(pixel);
  if (!p.valid) { return; }
  let previousPixel = reproject(p.surface.point);
  if (previousPixel < 0) { return; }
  let q = u32(previousPixel);
  if (!similar(pixel, frame.parity, q, frame.parity ^ 1u, length(p.surface.point - frame.previousPosition.xyz))) { return; }
  let current = loadReservoir(SCRATCH, pixel);
  var previous = loadReservoir(FINAL + (frame.parity ^ 1u), q);
  // Capping history at 20 frames' worth keeps a stale sample from dominating forever.
  previous.m = min(previous.m, 20.0 * max(current.m, 1.0));
  var r = emptyReservoir();
  merge(&r, current, p, random(pixel, 3000u));
  merge(&r, previous, p, random(pixel, 3001u));
  finalize(&r);
  storeReservoir(SCRATCH, pixel, r);
}

@compute @workgroup_size(WORKGROUP)
fn restirSpatial(@builtin(global_invocation_id) id: vec3u) {
  let pixel = id.x;
  if (pixel >= params.pathCount) { return; }
  let current = loadReservoir(SCRATCH, pixel);
  let p = primaryAt(pixel);
  if (!p.valid || frame.spatialReuse == 0u) {
    storeReservoir(FINAL + frame.parity, pixel, current);
    return;
  }
  var r = emptyReservoir();
  merge(&r, current, p, random(pixel, 4000u));
  let x = i32(pixel % params.width);
  let y = i32(pixel / params.width);
  let distance = loadF(gbufferIndex(frame.parity, pixel)).w;
  for (var k = 0u; k < 3u; k += 1u) {
    // About 3% of the image width, as the paper's 30 pixels at 1080p: close enough that the lighting is similar.
    let radius = max(2.0, 0.03 * f32(params.width));
    let offset = (random2(pixel, 4001u + 2u * k) * 2.0 - 1.0) * radius;
    let nx = x + i32(offset.x);
    let ny = y + i32(offset.y);
    if (nx < 0 || ny < 0 || nx >= i32(params.width) || ny >= i32(params.height)) { continue; }
    let neighbour = u32(ny) * params.width + u32(nx);
    if (neighbour == pixel || !similar(pixel, frame.parity, neighbour, frame.parity, distance)) { continue; }
    merge(&r, loadReservoir(SCRATCH, neighbour), p, random(pixel, 4010u + k));
  }
  // The biased 1/M normalization: a neighbour that can't see the chosen light still counts, which darkens shadow
  // edges slightly. The unbiased version (Bitterli et al. 2020, algorithm 6) divides by only the reservoirs that
  // could see it, but fed back through temporal reuse its weights ran away; see the curriculum, chapter 47.
  finalize(&r);
  storeReservoir(FINAL + frame.parity, pixel, r);
}

// Direct light at the primary hit from the chosen sample, with its own shadow ray.
@compute @workgroup_size(WORKGROUP)
fn restirShade(@builtin(global_invocation_id) id: vec3u) {
  let pixel = id.x;
  if (pixel >= params.pathCount) { return; }
  let p = primaryAt(pixel);
  if (!p.valid) { return; }
  let r = loadReservoir(FINAL + frame.parity, pixel);
  if (r.primitive == NO_HIT || r.w <= 0.0) { return; }
  let c = lightContribution(p, r.primitive, r.uv);
  if (any(c.value > vec3f(0.0)) && visible(p.surface.point, p.surface.normal, c.point)) {
    addRadiance(pixel, c.value * r.w);
  }
}

// ---- Temporal accumulation and filtering, on illumination with the albedo divided out, as denoise.cpp does

@compute @workgroup_size(WORKGROUP)
fn accumulate(@builtin(global_invocation_id) id: vec3u) {
  let pixel = id.x;
  if (pixel >= params.pathCount) { return; }
  let current = image[pixel].xyz / max(features[2u * pixel].xyz, vec3f(0.01));
  let brightness = luminanceOf(current);
  var color = current;
  var moments = vec2f(brightness, brightness * brightness);
  var frames = 1.0;
  let g = loadF(gbufferIndex(frame.parity, pixel));
  if (loadF(gbufferIndex(frame.parity, pixel) + 1u).w > 0.0) {
    let previousPixel = reproject(g.xyz);
    if (previousPixel >= 0) {
      let q = u32(previousPixel);
      if (similar(pixel, frame.parity, q, frame.parity ^ 1u, length(g.xyz - frame.previousPosition.xyz))) {
        let h = loadF(historyIndex(frame.parity ^ 1u, q));
        let m = loadF(historyIndex(frame.parity ^ 1u, q) + 1u);
        frames = min(h.w + 1.0, frame.maxHistory);
        color = mix(h.xyz, current, 1.0 / frames);
        moments = mix(m.xy, moments, 1.0 / frames);
      }
    }
  }
  // Until a few frames have accumulated, the moments say little; assume the worst so the filter works hard.
  let variance = select(1e3, max(moments.y - moments.x * moments.x, 0.0) / frames, frames >= 4.0);
  storeF(historyIndex(frame.parity, pixel), vec4f(color, frames));
  storeF(historyIndex(frame.parity, pixel) + 1u, vec4f(moments, variance, 0.0));
  storeF(filteredIndex(0u, pixel), vec4f(color, variance));
}

override STEP: u32 = 1u;
override SOURCE: u32 = 0u;

@compute @workgroup_size(WORKGROUP)
fn atrous(@builtin(global_invocation_id) id: vec3u) {
  let pixel = id.x;
  if (pixel >= params.pathCount) { return; }
  let centre = loadF(filteredIndex(SOURCE, pixel));
  let g = loadF(gbufferIndex(frame.parity, pixel));
  let normal = loadF(gbufferIndex(frame.parity, pixel) + 1u);
  let brightness = luminanceOf(centre.xyz);
  let sigma = 4.0 * sqrt(max(centre.w, 0.0)) + 1e-4;
  let kernel = array<f32, 5>(1.0 / 16.0, 1.0 / 4.0, 3.0 / 8.0, 1.0 / 4.0, 1.0 / 16.0);
  var sum = vec3f(0.0);
  var weights = 0.0;
  var varianceSum = 0.0;
  let x = i32(pixel % params.width);
  let y = i32(pixel / params.width);
  for (var dy = -2; dy <= 2; dy += 1) {
    for (var dx = -2; dx <= 2; dx += 1) {
      let qx = x + dx * i32(STEP);
      let qy = y + dy * i32(STEP);
      if (qx < 0 || qy < 0 || qx >= i32(params.width) || qy >= i32(params.height)) { continue; }
      let q = u32(qy) * params.width + u32(qx);
      let tap = loadF(filteredIndex(SOURCE, q));
      var weight = kernel[dx + 2] * kernel[dy + 2];
      if (q != pixel) {
        weight *= exp(-abs(brightness - luminanceOf(tap.xyz)) / sigma);
        let qNormal = loadF(gbufferIndex(frame.parity, q) + 1u);
        if ((normal.w > 0.0) != (qNormal.w > 0.0)) {
          weight = 0.0;
        } else if (normal.w > 0.0) {
          weight *= pow(max(0.0, dot(normal.xyz, qNormal.xyz)), 64.0);
          let reach = 0.02 * g.w * f32(STEP) + 1e-4;
          weight *= exp(-abs(g.w - loadF(gbufferIndex(frame.parity, q)).w) / reach);
        }
      }
      sum += tap.xyz * weight;
      weights += weight;
      varianceSum += weight * weight * tap.w;
    }
  }
  storeF(filteredIndex(SOURCE ^ 1u, pixel), vec4f(sum / weights, varianceSum / (weights * weights)));
}

// Put the albedo back. SOURCE names the slot the last filter pass wrote.
@compute @workgroup_size(WORKGROUP)
fn compose(@builtin(global_invocation_id) id: vec3u) {
  let pixel = id.x;
  if (pixel >= params.pathCount) { return; }
  let albedo = max(features[2u * pixel].xyz, vec3f(0.01));
  storeF(frame.outputBase + pixel, vec4f(loadF(filteredIndex(SOURCE, pixel)).xyz * albedo, 1.0));
}
