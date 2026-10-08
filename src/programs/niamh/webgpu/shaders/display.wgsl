// Shows the tracer's running sums on the canvas: divide by the sample count, expose, tone map, and encode sRGB,
// as Film::writePng does in rtadvanced.

struct View {
  width: u32,
  height: u32,
  samples: u32,
  channel: u32,  // 0 radiance, 1 albedo, 2 normal, 3 depth
  exposure: f32,
  toneMap: u32,  // 0 clamp, 1 Reinhard, 2 ACES
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> image: array<vec4f>;
@group(0) @binding(2) var<storage, read> features: array<vec4f>;

@vertex
fn vertexMain(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

fn toneMap(v: vec3f) -> vec3f {
  let x = max(v, vec3f(0.0));
  if (view.toneMap == 1u) { return x / (1.0 + x); }
  if (view.toneMap == 2u) { return min(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), vec3f(1.0)); }
  return x;
}

fn srgb(v: vec3f) -> vec3f {
  let c = clamp(v, vec3f(0.0), vec3f(1.0));
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, 12.92 * c, c <= vec3f(0.0031308));
}

@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let x = min(u32(position.x), view.width - 1u);
  let y = min(u32(position.y), view.height - 1u);
  let i = y * view.width + x;
  let n = f32(max(view.samples, 1u));
  if (view.channel == 1u) { return vec4f(srgb(features[2u * i].xyz / n), 1.0); }
  if (view.channel == 2u) {
    let normal = features[2u * i + 1u].xyz;
    let shown = select(vec3f(0.5), normalize(normal) * 0.5 + 0.5, dot(normal, normal) > 0.0);
    return vec4f(shown, 1.0);
  }
  if (view.channel == 3u) {
    let depth = features[2u * i].w / n;
    return vec4f(vec3f(1.0 - clamp(depth / 5.0, 0.0, 1.0)), 1.0);
  }
  return vec4f(srgb(toneMap(image[i].xyz / n * view.exposure)), 1.0);
}
