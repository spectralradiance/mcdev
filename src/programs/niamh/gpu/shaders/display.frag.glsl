#version 300 es
precision highp float;

// Exposes, tonemaps and gamma-corrects the HDR accumulation buffer for display.

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_exposure;  // linear multiplier
uniform int u_toneMap;     // 0 clamp, 1 Reinhard, 2 ACES
out vec4 fragColor;

void main() {
    vec3 color = max(texture(u_image, gl_FragCoord.xy / u_resolution).rgb * u_exposure, 0.0);
    if (u_toneMap == 1) {
        color = color / (color + vec3(1.0));
    } else if (u_toneMap == 2) {
        color = min(color * (2.51 * color + 0.03) / (color * (2.43 * color + 0.59) + 0.14), vec3(1.0));
    }
    color = pow(min(color, vec3(1.0)), vec3(1.0 / 2.2)); // gamma correction
    fragColor = vec4(color, 1.0);
}
