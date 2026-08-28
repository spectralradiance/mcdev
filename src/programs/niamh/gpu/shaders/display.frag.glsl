#version 300 es
precision highp float;

// Tonemaps and gamma-corrects the HDR accumulation buffer for display.

uniform sampler2D u_image;
uniform vec2 u_resolution;
out vec4 fragColor;

void main() {
    vec3 color = texture(u_image, gl_FragCoord.xy / u_resolution).rgb;
    color = color / (color + vec3(1.0)); // Reinhard tonemap
    color = pow(color, vec3(1.0 / 2.2)); // gamma correction
    fragColor = vec4(color, 1.0);
}
