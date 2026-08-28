#version 300 es
precision highp float;
precision highp int;

// Unidirectional path tracer with next-event estimation (explicit light sampling)
// and multiple importance sampling between the two strategies — the practical
// middle ground between plain path tracing and full bidirectional path tracing,
// which a fragment shader can't express well (no scatter-writes to connect
// arbitrary light/camera subpath vertices; that needs WebGPU compute + storage
// buffers). Scene data lives entirely in uniform arrays so this file never
// changes when the scene does — see ../packScene.ts for how a SceneDescription
// becomes these uniforms.

#define M_PI 3.14159265358979323846
#define MAX_SAMPLE_WEIGHT 10.0
#define MAX_OBJECTS __MAX_OBJECTS__
#define MAX_MATERIALS __MAX_MATERIALS__
#define MAX_LIGHTS __MAX_LIGHTS__
#define MAX_BOUNCES __MAX_BOUNCES__
#define OBJ_PLANE 0
#define OBJ_BOX 1
#define color_type vec3

out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_frameNumber;
uniform float u_seed;
uniform int u_maxBounces;
uniform sampler2D u_prevFrame;

// ─── primitive intersection ─────────────────────────────────────────────────

vec4 plane_intersection(vec3 pos, vec3 ray, vec3 plane_normal) {
    float d = dot(ray, plane_normal);
    float dist = -dot(pos, plane_normal) / d;
    vec3 normal = plane_normal * -sign(d);
    return vec4(normal, dist);
}

vec4 box_intersection(vec3 pos, vec3 ray, bool inside, vec3 box_size) {
    float s = inside ? -1.0 : 1.0;
    vec3 corner = pos + s * box_size * sign(ray);
    vec3 dists = -corner / ray;
    float no_isec_dist = inside ? 1e10 : -1.0;
    if (ray.x == 0.0) dists.x = no_isec_dist;
    if (ray.y == 0.0) dists.y = no_isec_dist;
    if (ray.z == 0.0) dists.z = no_isec_dist;
    float dist = inside ? min(dists.x, min(dists.y, dists.z)) : max(dists.x, max(dists.y, dists.z));
    vec3 normal = vec3(0.0, 0.0, 1.0);
    if (dist == dists.x) normal = vec3(1.0, 0.0, 0.0);
    else if (dist == dists.y) normal = vec3(0.0, 1.0, 0.0);
    if (!inside) {
        vec3 isec_pos = pos + ray * dist;
        vec3 bounds = (box_size - abs(isec_pos)) * (1.0 - normal);
        if (bounds.x < 0.0 || bounds.y < 0.0 || bounds.z < 0.0) return vec4(0.0, 0.0, 0.0, -1.0);
    }
    normal = normal * -s * sign(ray);
    return vec4(normal, dist);
}

// ─── scene objects ───────────────────────────────────────────────────────────

uniform int u_objectCount;
uniform int u_objectType[MAX_OBJECTS];
uniform vec3 u_objectPosition[MAX_OBJECTS];
uniform mat3 u_objectRotation[MAX_OBJECTS];
uniform vec3 u_objectParams[MAX_OBJECTS]; // plane normal, or box half-size
uniform int u_objectMaterial[MAX_OBJECTS];

// which_object is 1-based; 0 means "no hit".
int find_intersection(vec3 ray_pos, vec3 ray, int prev_object, int inside_object, out vec4 intersection) {
    int which_object = 0;
    for (int i = 0; i < MAX_OBJECTS; i++) {
        if (i >= u_objectCount) break;
        int obj_id = i + 1;
        bool inside = inside_object == obj_id;
        if (!inside && prev_object == obj_id) continue;

        vec3 rel_pos = ray_pos - u_objectPosition[i];
        vec4 cur_isec;
        if (u_objectType[i] == OBJ_PLANE) {
            cur_isec = plane_intersection(rel_pos, ray, u_objectParams[i]);
        } else {
            mat3 rotation = u_objectRotation[i];
            vec3 local_pos = rel_pos * rotation;
            vec3 local_ray = ray * rotation;
            cur_isec = box_intersection(local_pos, local_ray, inside, u_objectParams[i]);
            if (cur_isec.w > 0.0) cur_isec.xyz = rotation * cur_isec.xyz;
        }
        if (cur_isec.w > 0.0 && (which_object == 0 || cur_isec.w < intersection.w)) {
            intersection = cur_isec;
            which_object = obj_id;
        }
    }
    return which_object;
}

// ─── materials ────────────────────────────────────────────────────────────────

uniform int u_materialCount;
uniform vec3 u_matDiffuse[MAX_MATERIALS];
uniform vec3 u_matEmission[MAX_MATERIALS];
uniform vec3 u_matReflectivity[MAX_MATERIALS];
uniform vec3 u_matTransparency[MAX_MATERIALS];
uniform float u_matIor[MAX_MATERIALS];
uniform float u_matRoughness[MAX_MATERIALS];
uniform vec3 u_matScatterDistance[MAX_MATERIALS];
uniform float u_matScatterAnisotropy[MAX_MATERIALS];

float color2prob(color_type c) { return (c.x + c.y + c.z) / 3.0; }

// Object id 0 (vacuum / "no object") maps to material slot 0; that material's
// scattering distance must be treated as the ambient medium, which is why the
// sample scene leaves it at zero (no fog) on every material.
int get_material_id(int which_object) {
    return which_object <= 0 ? 0 : u_objectMaterial[which_object - 1];
}
bool get_emission(int material_id, out color_type emission) {
    emission = u_matEmission[material_id];
    return color2prob(emission) > 0.0;
}
float get_ior(int material_id) { return u_matIor[material_id]; }
float get_roughness(int material_id) { return u_matRoughness[material_id]; }
vec3 get_diffuse(int material_id) { return u_matDiffuse[material_id]; }
vec3 get_reflectivity(int material_id) { return u_matReflectivity[material_id]; }
vec3 get_transparency(int material_id) { return u_matTransparency[material_id]; }
vec3 get_mean_scattering_distance(int material_id) { return u_matScatterDistance[material_id]; }
float get_scattering_anisotropy(int material_id) { return u_matScatterAnisotropy[material_id]; }

// ─── random numbers ───────────────────────────────────────────────────────────
// In-shader PRNG seeded per-pixel-per-frame; avoids the auxiliary random
// textures a WebGL1 renderer would need (no compute shaders to fill them cheaply).

struct rand_state { uint s; };

uint hash_u32(uint x) {
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
}

void rand_init(out rand_state rng, vec2 pixel, float frame) {
    uint seed = uint(pixel.x) * 1973u + uint(pixel.y) * 9277u + uint(frame) * 26699u;
    rng.s = hash_u32(seed | 1u);
}

float rand_next_uniform(inout rand_state rng) {
    rng.s = hash_u32(rng.s);
    return float(rng.s) * (1.0 / 4294967296.0);
}

vec3 rand_next_gauss3(inout rand_state rng) {
    float u1 = max(rand_next_uniform(rng), 1e-6);
    float u2 = rand_next_uniform(rng);
    float u3 = max(rand_next_uniform(rng), 1e-6);
    float u4 = rand_next_uniform(rng);
    float r1 = sqrt(-2.0 * log(u1));
    float r2 = sqrt(-2.0 * log(u3));
    return vec3(r1 * cos(2.0 * M_PI * u2), r1 * sin(2.0 * M_PI * u2), r2 * cos(2.0 * M_PI * u4));
}

// ─── lights ───────────────────────────────────────────────────────────────────

uniform int u_lightCount;
uniform int u_lightObject[MAX_LIGHTS]; // 1-based object id
uniform float u_lightArea[MAX_LIGHTS];

void box_sample(inout rand_state rng, out vec3 pos, out vec3 normal, vec3 sz) {
    vec3 sides = vec3(sz.y * sz.z, sz.x * sz.z, sz.x * sz.y);
    sides *= 1.0 / (sides.x + sides.y + sides.z);
    float u = rand_next_uniform(rng) * 2.0 - 1.0;
    float v = rand_next_uniform(rng) * 2.0 - 1.0;
    float p = rand_next_uniform(rng);
    bool side;
    if (p < sides.x) {
        side = p < sides.x * 0.5;
        normal = vec3(1, 0, 0);
        pos = vec3(1, u, v);
    } else {
        p -= sides.x;
        if (p < sides.y) {
            side = p < sides.y * 0.5;
            normal = vec3(0, 1, 0);
            pos = vec3(u, 1, v);
        } else {
            p -= sides.y;
            side = p < sides.z * 0.5;
            normal = vec3(0, 0, 1);
            pos = vec3(u, v, 1);
        }
    }
    pos *= sz;
    if (side) { normal = -normal; pos = -pos; }
}

int select_light(out vec3 light_point, out vec3 light_normal, out float sample_prob_density_per_area, inout rand_state rng) {
    float totalArea = 0.0;
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= u_lightCount) break;
        totalArea += u_lightArea[i];
    }
    if (totalArea <= 0.0) return 0;
    sample_prob_density_per_area = 1.0 / totalArea;
    float choice = rand_next_uniform(rng) * totalArea;
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= u_lightCount) break;
        float area = u_lightArea[i];
        if (choice < area || i == u_lightCount - 1) {
            int obj = u_lightObject[i];
            vec3 local_point, local_normal;
            box_sample(rng, local_point, local_normal, u_objectParams[obj - 1]);
            mat3 rotation = u_objectRotation[obj - 1];
            light_point = rotation * local_point + u_objectPosition[obj - 1];
            light_normal = rotation * local_normal;
            return obj;
        }
        choice -= area;
    }
    return 0;
}

bool has_sampler(int which_object) {
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= u_lightCount) break;
        if (u_lightObject[i] == which_object) return true;
    }
    return false;
}

// ─── camera ───────────────────────────────────────────────────────────────────

uniform vec3 u_camPos;
uniform vec3 u_camX;
uniform vec3 u_camY;
uniform vec3 u_camZ;
uniform float u_camFov; // vertical, radians
uniform float u_camAperture;
uniform float u_camFocusDistance;

float tent_filter(float x) {
    x *= 2.0;
    return x < 1.0 ? sqrt(x) - 1.0 : 1.0 - sqrt(2.0 - x);
}

vec2 pixel_filter_sample(inout rand_state rng) {
    return vec2(tent_filter(rand_next_uniform(rng)), tent_filter(rand_next_uniform(rng)));
}

void get_camera_ray(vec2 screen_pos, vec2 resolution, out vec3 ray_pos, out vec3 ray, inout rand_state rng) {
    float aspect = resolution.x / resolution.y;
    vec2 jittered = screen_pos + pixel_filter_sample(rng);
    vec2 ccd = ((jittered / resolution) * 2.0 - 1.0) * vec2(aspect, 1.0);
    ray = normalize(ccd.x * u_camX + ccd.y * u_camY + (1.0 / tan(u_camFov * 0.5)) * u_camZ);
    if (u_camAperture > 0.0) {
        vec3 focus_point = u_camPos + u_camFocusDistance * ray;
        vec2 lens = normalize(rand_next_gauss3(rng).xy) * sqrt(rand_next_uniform(rng));
        ray_pos = u_camPos + (lens.x * u_camX + lens.y * u_camY) * u_camAperture;
        ray = normalize(focus_point - ray_pos);
    } else {
        ray_pos = u_camPos;
    }
}

// ─── shading ──────────────────────────────────────────────────────────────────

vec3 get_random_cosine_weighted(vec3 normal, inout rand_state rng) {
    vec3 dir = rand_next_gauss3(rng);
    dir = normalize(dir - dot(dir, normal) * normal);
    float r = rand_next_uniform(rng);
    return normal * sqrt(1.0 - r) + dir * sqrt(r);
}

// Henyey-Greenstein phase function; see https://www.astro.umd.edu/~jph/HG_note.pdf
vec3 sample_scattered_ray(int material_id, vec3 ray_in, inout rand_state rng) {
    float g = get_scattering_anisotropy(material_id);
    if (g == 0.0) return normalize(rand_next_gauss3(rng));
    float a = (1.0 - g * g) / (1.0 - g + 2.0 * g * rand_next_uniform(rng));
    float mu = 0.5 / g * (1.0 + g * g - a * a);
    vec3 perp = rand_next_gauss3(rng);
    perp = normalize(perp - ray_in * dot(ray_in, perp));
    return mu * ray_in + sqrt(1.0 - mu * mu) * perp;
}

float sample_scattering_distance(int material_id, out color_type col, inout rand_state rng) {
    color_type distances = get_mean_scattering_distance(material_id);
    float dist = color2prob(distances);
    if (dist <= 0.0) return 1e10;
    col = distances / dist;
    return -log(rand_next_uniform(rng)) * dist;
}

float get_scattering_prob(int material_id, float distance) {
    float dist = color2prob(get_mean_scattering_distance(material_id));
    return dist > 0.0 ? 1.0 - exp(-distance / dist) : 0.0;
}

// GGX microfacet model.
float ggx_D(vec3 n, vec3 m, float alpha) {
    float mn = dot(m, n);
    if (mn < 0.0) return 0.0;
    float mn2 = mn * mn;
    float a2 = alpha * alpha;
    float den = 1.0 + mn2 * (a2 - 1.0);
    if (den <= 0.0) return 0.0;
    return a2 / (M_PI * den * den);
}

float ggx_G1(vec3 v, vec3 m, vec3 n, float alpha) {
    float vm = dot(v, m);
    float vn = dot(v, n);
    if (sign(vm) * sign(vn) < 0.0) return 0.0;
    float vn2 = vn * vn;
    float a2 = alpha * alpha;
    return 2.0 / (1.0 + sqrt(max(a2 / vn2 + 1.0 - a2, 0.0)));
}

color_type fresnel_schlick_term(float cos_theta, color_type f0) {
    return f0 + (1.0 - f0) * pow(1.0 - cos_theta, 5.0);
}

vec3 sample_ggx(vec3 normal, float alpha, inout rand_state rng) {
    vec3 dir = rand_next_gauss3(rng);
    dir = normalize(dir - dot(dir, normal) * normal);
    float eta = rand_next_uniform(rng);
    float theta = atan(alpha * sqrt(eta) / sqrt(1.0 - eta));
    return normal * cos(theta) + dir * sin(theta);
}

float ggx_sample_weight(float alpha, vec3 normal, vec3 i, vec3 o, vec3 m) {
    float G = ggx_G1(i, m, normal, alpha) * ggx_G1(o, m, normal, alpha);
    return dot(i, m) * G / (dot(i, normal) * dot(m, normal));
}

float sampling_pdf_ggx(int material_id, vec3 normal, vec3 ray_in, vec3 ray_out) {
    float alpha = get_roughness(material_id);
    vec3 m = normalize(-ray_in + ray_out);
    float D = ggx_D(normal, m, alpha);
    return D * dot(m, normal) / (4.0 * dot(ray_out, m));
}

color_type brdf_cos_weighted(int material_id, vec3 normal, vec3 ray_in, vec3 ray_out) {
    color_type reflection_color = get_reflectivity(material_id);
    color_type diffuse = get_diffuse(material_id) / M_PI;
    color_type specular;
    if (color2prob(reflection_color) > 0.0) {
        vec3 m = normalize(-ray_in + ray_out);
        float alpha = get_roughness(material_id);
        float cosT = clamp(dot(ray_out, m), 0.0, 1.0);
        color_type F = fresnel_schlick_term(cosT, reflection_color);
        float G = ggx_G1(-ray_in, m, normal, alpha) * ggx_G1(ray_out, m, normal, alpha);
        float D = ggx_D(normal, m, alpha);
        specular = F * D * G / (4.0 * dot(ray_out, m) * dot(-ray_in, normal));
        diffuse *= (1.0 - F);
    } else {
        specular = reflection_color; // = 0
    }
    return (specular + diffuse) * dot(ray_out, normal);
}

float get_specular(int material_id) {
    float r = color2prob(get_reflectivity(material_id));
    float t = color2prob(get_transparency(material_id));
    float d = color2prob(get_diffuse(material_id));
    float shininess = 1.0 - (1.0 - r) * (1.0 - t);
    float diffuse = d * (1.0 - shininess);
    float den = shininess + diffuse;
    return den > 0.0 ? shininess / den : 0.0;
}

float sampling_pdf(int material_id, vec3 normal, vec3 ray_in, vec3 ray_out) {
    float specular = get_specular(material_id);
    return specular * sampling_pdf_ggx(material_id, normal, ray_in, ray_out) +
        (1.0 - specular) * dot(normal, ray_out) / M_PI; // lambert
}

// Returns the sampling pdf, a negative sentinel for specular (delta) events, or 0.0 for an invalid sample.
float sample_ray_and_prob(int material_id, bool going_out, vec3 normal, inout vec3 ray, out color_type weight, inout rand_state rng) {
    float specular = get_specular(material_id);
    vec3 ray_in = ray;
    float extra_weight = 1.0;
    if (rand_next_uniform(rng) < specular) {
        float alpha = get_roughness(material_id);
        vec3 m = sample_ggx(normal, alpha, rng);
        color_type F = fresnel_schlick_term(clamp(dot(-ray_in, m), 0.0, 1.0), get_reflectivity(material_id));
        color_type transparency = (1.0 - F) * get_transparency(material_id);
        float transmission_prob = color2prob(transparency);
        bool selected_transmission = rand_next_uniform(rng) < transmission_prob;
        if (selected_transmission) {
            F = transparency / transmission_prob;
            // Simplification shared with the reference this is based on: refraction is
            // shaded unidirectionally, so no nested transparent objects and no BSDF-adjoint
            // correction for the solid-angle compression across the interface.
            float eta = going_out ? get_ior(material_id) : 1.0 / get_ior(material_id);
            float d = dot(m, ray);
            float k = 1.0 - eta * eta * (1.0 - d * d);
            ray = k < 0.0 ? ray - 2.0 * d * m : eta * ray - (eta * d + sqrt(k)) * m; // total reflection when k < 0
        } else {
            extra_weight = 1.0 / (1.0 - transmission_prob);
            F *= extra_weight;
            ray = ray - 2.0 * dot(m, ray) * m;
        }
        if (alpha <= 0.0 || selected_transmission) {
            // Perfectly shiny or refractive: no finite-pdf neighborhood to importance-sample
            // against, so this event can't participate in next-event estimation / MIS.
            float w = ggx_sample_weight(alpha, normal, -ray_in, ray, m);
            if (w <= 0.0) return 0.0;
            weight = w * F;
            return -1.0;
        }
    } else {
        ray = get_random_cosine_weighted(normal, rng);
    }
    float pdf = sampling_pdf(material_id, normal, ray_in, ray);
    if (pdf <= 0.0) return 0.0;
    weight = extra_weight * brdf_cos_weighted(material_id, normal, ray_in, ray) / pdf;
    return pdf;
}

float mis_weight(float p1, float p2) {
    float p1sq = p1 * p1;
    float p2sq = p2 * p2;
    float denom = p1sq + p2sq;
    return denom > 0.0 ? p1sq / denom : 0.0; // power heuristic
}

bool check_visibility(vec3 pos, vec3 shadow_ray, vec3 normal, vec3 light_normal, int which_object, int light_object) {
    if (dot(shadow_ray, normal) <= 0.0 || dot(shadow_ray, light_normal) >= 0.0 || which_object == light_object) {
        return false;
    }
    vec4 shadow_isec;
    int shadow_object = find_intersection(pos, shadow_ray, which_object, 0, shadow_isec);
    return shadow_object == 0 || shadow_object == light_object;
}

// ─── path tracing ─────────────────────────────────────────────────────────────

vec3 render(vec2 xy, vec2 resolution) {
    rand_state rng;
    rand_init(rng, xy, u_frameNumber + u_seed);

    vec3 ray_pos, ray;
    get_camera_ray(xy, resolution, ray_pos, ray, rng);

    vec3 ray_color = vec3(1.0);
    vec3 result_color = vec3(0.0);
    int prev_object = 0;
    int inside_object = 0;
    int inside_material = get_material_id(inside_object);
    float last_surface_p = 0.0;

    vec3 light_point = vec3(0.0);
    vec3 light_normal = vec3(0.0);
    float light_area_pdf = 0.0;
    int light_object = select_light(light_point, light_normal, light_area_pdf, rng);
    color_type light_emission = vec3(0.0);
    if (light_object > 0) get_emission(get_material_id(light_object), light_emission);

    for (int bounce = 0; bounce <= MAX_BOUNCES; bounce++) {
        if (bounce > u_maxBounces) break;

        vec4 intersection;
        color_type scatter_color;
        float scattering_distance = sample_scattering_distance(inside_material, scatter_color, rng);
        int which_object = find_intersection(ray_pos, ray, prev_object, inside_object, intersection);

        if (which_object == 0 || intersection.w > scattering_distance) {
            if (scattering_distance >= 1e10) break; // escaped the scene
            ray_color *= scatter_color;
            ray_pos += scattering_distance * ray;
            ray = sample_scattered_ray(inside_material, ray, rng);
            last_surface_p = 0.0;
            prev_object = 0;
            continue;
        }

        vec3 normal = intersection.xyz;
        ray_pos += intersection.w * ray;
        int material_id = get_material_id(which_object);

        color_type emitted;
        if (get_emission(material_id, emitted)) {
            float probThis, probOther;
            if (last_surface_p > 0.0 && has_sampler(which_object)) {
                float no_scatter = 1.0 - get_scattering_prob(inside_material, intersection.w);
                float change_of_vars = -dot(normal, ray) / (intersection.w * intersection.w);
                probThis = change_of_vars * last_surface_p * no_scatter;
                probOther = light_area_pdf;
            } else {
                probThis = 1.0;
                probOther = 0.0;
            }
            result_color += ray_color * emitted * mis_weight(probThis, probOther);
        }

        bool going_out = which_object == inside_object;
        if (going_out) normal = -normal;

        vec3 ray_in = ray;
        color_type brdf_weight;
        last_surface_p = sample_ray_and_prob(material_id, going_out, normal, ray, brdf_weight, rng);

        float sample_weight = color2prob(brdf_weight) * color2prob(ray_color);
        if (last_surface_p == 0.0 || sample_weight > MAX_SAMPLE_WEIGHT) break;

        if (last_surface_p > 0.0 && bounce < u_maxBounces && inside_object == 0 && light_object > 0) {
            vec3 shadow_ray = light_point - ray_pos;
            float shadow_dist = length(shadow_ray);
            shadow_ray /= shadow_dist;
            if (check_visibility(ray_pos, shadow_ray, normal, light_normal, which_object, light_object)) {
                float change_of_vars = -dot(light_normal, shadow_ray) / (shadow_dist * shadow_dist);
                float sampling_p = sampling_pdf(material_id, normal, ray_in, shadow_ray);
                float no_scatter = 1.0 - get_scattering_prob(inside_material, shadow_dist);
                float probThis = light_area_pdf;
                float probOther = change_of_vars * sampling_p * no_scatter;
                color_type contribution = no_scatter * brdf_cos_weighted(material_id, normal, ray_in, shadow_ray);
                color_type f_over_p = contribution * change_of_vars / probThis;
                color_type total = f_over_p * mis_weight(probThis, probOther);
                if (color2prob(total) > 0.0) {
                    result_color += ray_color * light_emission * total;
                }
            }
        } else {
            last_surface_p = 0.0;
        }

        ray_color *= brdf_weight;

        if (dot(ray, normal) < 0.0) {
            inside_object = going_out ? 0 : which_object;
            inside_material = get_material_id(inside_object);
        }
        prev_object = which_object;
    }

    return result_color;
}

void main() {
    vec3 cur_color = render(gl_FragCoord.xy, u_resolution);
    vec3 base_color = texture(u_prevFrame, gl_FragCoord.xy / u_resolution).rgb;
    fragColor = vec4(base_color + (cur_color - base_color) / (u_frameNumber + 1.0), 1.0);
}
