// Owns the WebGL2 pipeline: compiles the shaders, uploads a PackedScene as
// uniforms, runs the accumulation ping-pong, and handles orbit/zoom input.
// React's job (see ../page.tsx) is just to create this, feed it a scene, and
// drive its render loop.

import type { SceneDescription } from "../scene";
import { MAX_BOUNCES, MAX_LIGHTS, MAX_MATERIALS, MAX_OBJECTS } from "./limits";
import { packScene, type PackedScene } from "./packScene";
import { add, cross, length, normalize, scale, sub, type Vec3 } from "./vec3";

import vertSrc from "./shaders/fullscreen.vert.glsl?raw";
import pathTracerSrcTemplate from "./shaders/pathtracer.frag.glsl?raw";
import displaySrc from "./shaders/display.frag.glsl?raw";

const WORLD_UP: Vec3 = [0, 1, 0];
const MIN_PITCH = -Math.PI / 2 + 0.01;
const MAX_PITCH = Math.PI / 2 - 0.01;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Failed to create shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile error: ${log}`);
    }
    return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Program link error: ${log}`);
    }
    return program;
}

interface OrbitState {
    target: Vec3;
    yaw: number;
    pitch: number;
    distance: number;
    up: Vec3;
}

export class PathTracerRenderer {
    private readonly gl: WebGL2RenderingContext;
    private readonly pathTracerProgram: WebGLProgram;
    private readonly displayProgram: WebGLProgram;
    private readonly vao: WebGLVertexArrayObject;
    private readonly accumTextures: [WebGLTexture, WebGLTexture];
    private readonly accumFramebuffers: [WebGLFramebuffer, WebGLFramebuffer];
    private readonly uniformLocations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

    private readIndex = 0;
    private width = 0;
    private height = 0;
    private frameNumber = 0;
    private seed = 0;
    private scene: PackedScene | null = null;

    private orbit: OrbitState = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 500, up: WORLD_UP };
    private dragging = false;
    private lastPointer: [number, number] = [0, 0];
    private readonly canvas: HTMLCanvasElement;
    private readonly onPointerDown = (e: PointerEvent) => {
        this.dragging = true;
        this.lastPointer = [e.clientX, e.clientY];
        this.canvas.setPointerCapture(e.pointerId);
    };
    private readonly onPointerMove = (e: PointerEvent) => {
        if (!this.dragging) return;
        const dx = e.clientX - this.lastPointer[0];
        const dy = e.clientY - this.lastPointer[1];
        this.lastPointer = [e.clientX, e.clientY];
        this.orbit.yaw -= dx * 0.008;
        this.orbit.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.orbit.pitch - dy * 0.008));
        this.applyOrbitCamera();
    };
    private readonly onPointerUp = (e: PointerEvent) => {
        this.dragging = false;
        this.canvas.releasePointerCapture(e.pointerId);
    };
    private readonly onWheel = (e: WheelEvent) => {
        e.preventDefault();
        this.orbit.distance = Math.max(10, this.orbit.distance * Math.exp(e.deltaY * 0.001));
        this.applyOrbitCamera();
    };

    constructor(canvas: HTMLCanvasElement) {
        const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
        if (!gl) throw new Error("WebGL2 is not supported in this browser.");
        if (!gl.getExtension("EXT_color_buffer_float")) {
            throw new Error("This browser can't render to floating-point textures (EXT_color_buffer_float), which the path tracer needs for HDR accumulation.");
        }
        this.gl = gl;
        this.canvas = canvas;

        const pathTracerSrc = pathTracerSrcTemplate
            .replace(/__MAX_OBJECTS__/g, String(MAX_OBJECTS))
            .replace(/__MAX_MATERIALS__/g, String(MAX_MATERIALS))
            .replace(/__MAX_LIGHTS__/g, String(MAX_LIGHTS))
            .replace(/__MAX_BOUNCES__/g, String(MAX_BOUNCES));

        const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
        const displayVs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
        this.pathTracerProgram = linkProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, pathTracerSrc));
        this.displayProgram = linkProgram(gl, displayVs, compileShader(gl, gl.FRAGMENT_SHADER, displaySrc));

        this.vao = gl.createVertexArray()!;

        this.accumTextures = [this.createAccumTexture(), this.createAccumTexture()];
        this.accumFramebuffers = [
            this.createFramebuffer(this.accumTextures[0]),
            this.createFramebuffer(this.accumTextures[1]),
        ];

        canvas.style.touchAction = "none";
        canvas.addEventListener("pointerdown", this.onPointerDown);
        canvas.addEventListener("pointermove", this.onPointerMove);
        canvas.addEventListener("pointerup", this.onPointerUp);
        canvas.addEventListener("pointercancel", this.onPointerUp);
        canvas.addEventListener("wheel", this.onWheel, { passive: false });
    }

    private createAccumTexture(): WebGLTexture {
        const gl = this.gl;
        const tex = gl.createTexture();
        if (!tex) throw new Error("Failed to create texture");
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
        return tex;
    }

    private createFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        if (!fbo) throw new Error("Failed to create framebuffer");
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return fbo;
    }

    private loc(program: WebGLProgram, name: string): WebGLUniformLocation | null {
        let cache = this.uniformLocations.get(program);
        if (!cache) {
            cache = new Map();
            this.uniformLocations.set(program, cache);
        }
        if (!cache.has(name)) {
            cache.set(name, this.gl.getUniformLocation(program, name));
        }
        return cache.get(name) ?? null;
    }

    setSize(width: number, height: number): void {
        width = Math.max(1, Math.round(width));
        height = Math.max(1, Math.round(height));
        if (width === this.width && height === this.height) return;
        this.width = width;
        this.height = height;
        const gl = this.gl;
        for (const tex of this.accumTextures) {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
        }
        this.resetAccumulation();
    }

    setScene(scene: SceneDescription): void {
        const packed = packScene(scene);
        this.scene = packed;
        this.orbit = {
            target: [...scene.camera.target] as Vec3,
            ...this.deriveYawPitch(scene.camera.position, scene.camera.target),
            distance: length(sub(scene.camera.position, scene.camera.target)) || 1,
            up: [...scene.camera.up] as Vec3,
        };
        this.uploadStaticUniforms(packed);
        this.applyOrbitCamera();
    }

    private deriveYawPitch(position: Vec3, target: Vec3): { yaw: number; pitch: number } {
        const rel = sub(position, target);
        const dist = length(rel) || 1;
        const yaw = Math.atan2(rel[0], rel[2]);
        const pitch = Math.asin(Math.min(1, Math.max(-1, rel[1] / dist)));
        return { yaw, pitch };
    }

    private applyOrbitCamera(): void {
        if (!this.scene) return;
        const { target, yaw, pitch, distance, up } = this.orbit;
        const dir: Vec3 = [
            Math.cos(pitch) * Math.sin(yaw),
            Math.sin(pitch),
            Math.cos(pitch) * Math.cos(yaw),
        ];
        const position = add(target, scale(dir, distance));
        const z = normalize(sub(target, position));
        const x = normalize(cross(z, up));
        const y = cross(x, z);

        const gl = this.gl;
        gl.useProgram(this.pathTracerProgram);
        gl.uniform3fv(this.loc(this.pathTracerProgram, "u_camPos"), position);
        gl.uniform3fv(this.loc(this.pathTracerProgram, "u_camX"), x);
        gl.uniform3fv(this.loc(this.pathTracerProgram, "u_camY"), y);
        gl.uniform3fv(this.loc(this.pathTracerProgram, "u_camZ"), z);
        this.resetAccumulation();
    }

    private uploadStaticUniforms(scene: PackedScene): void {
        const gl = this.gl;
        const p = this.pathTracerProgram;
        gl.useProgram(p);

        gl.uniform1i(this.loc(p, "u_objectCount"), scene.objectCount);
        gl.uniform1iv(this.loc(p, "u_objectType"), scene.objectType);
        gl.uniform3fv(this.loc(p, "u_objectPosition"), scene.objectPosition);
        gl.uniformMatrix3fv(this.loc(p, "u_objectRotation"), false, scene.objectRotation);
        gl.uniform3fv(this.loc(p, "u_objectParams"), scene.objectParams);
        gl.uniform1iv(this.loc(p, "u_objectMaterial"), scene.objectMaterial);

        gl.uniform1i(this.loc(p, "u_materialCount"), scene.materialCount);
        gl.uniform3fv(this.loc(p, "u_matDiffuse"), scene.matDiffuse);
        gl.uniform3fv(this.loc(p, "u_matEmission"), scene.matEmission);
        gl.uniform3fv(this.loc(p, "u_matReflectivity"), scene.matReflectivity);
        gl.uniform3fv(this.loc(p, "u_matTransparency"), scene.matTransparency);
        gl.uniform1fv(this.loc(p, "u_matIor"), scene.matIor);
        gl.uniform1fv(this.loc(p, "u_matRoughness"), scene.matRoughness);
        gl.uniform3fv(this.loc(p, "u_matScatterDistance"), scene.matScatterDistance);
        gl.uniform1fv(this.loc(p, "u_matScatterAnisotropy"), scene.matScatterAnisotropy);

        gl.uniform1i(this.loc(p, "u_lightCount"), scene.lightCount);
        gl.uniform1iv(this.loc(p, "u_lightObject"), scene.lightObject);
        gl.uniform1fv(this.loc(p, "u_lightArea"), scene.lightArea);

        gl.uniform1f(this.loc(p, "u_camFov"), scene.camera.fov);
        gl.uniform1f(this.loc(p, "u_camAperture"), scene.camera.aperture);
        gl.uniform1f(this.loc(p, "u_camFocusDistance"), scene.camera.focusDistance);
        gl.uniform1i(this.loc(p, "u_maxBounces"), Math.min(scene.maxBounces, MAX_BOUNCES));
    }

    resetAccumulation(): void {
        this.frameNumber = 0;
        this.seed += 104729;
        const gl = this.gl;
        for (const fbo of this.accumFramebuffers) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.viewport(0, 0, this.width, this.height);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    get sampleCount(): number {
        return this.frameNumber;
    }

    renderFrame(): void {
        if (!this.scene || this.width === 0 || this.height === 0) return;
        const gl = this.gl;
        const writeIndex = 1 - this.readIndex;

        gl.bindVertexArray(this.vao);

        gl.useProgram(this.pathTracerProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFramebuffers[writeIndex]);
        gl.viewport(0, 0, this.width, this.height);
        gl.uniform2f(this.loc(this.pathTracerProgram, "u_resolution"), this.width, this.height);
        gl.uniform1f(this.loc(this.pathTracerProgram, "u_frameNumber"), this.frameNumber);
        gl.uniform1f(this.loc(this.pathTracerProgram, "u_seed"), this.seed);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.accumTextures[this.readIndex]);
        gl.uniform1i(this.loc(this.pathTracerProgram, "u_prevFrame"), 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        this.readIndex = writeIndex;
        this.frameNumber++;

        gl.useProgram(this.displayProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
        gl.uniform2f(this.loc(this.displayProgram, "u_resolution"), this.width, this.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.accumTextures[this.readIndex]);
        gl.uniform1i(this.loc(this.displayProgram, "u_image"), 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    dispose(): void {
        const gl = this.gl;
        this.canvas.removeEventListener("pointerdown", this.onPointerDown);
        this.canvas.removeEventListener("pointermove", this.onPointerMove);
        this.canvas.removeEventListener("pointerup", this.onPointerUp);
        this.canvas.removeEventListener("pointercancel", this.onPointerUp);
        this.canvas.removeEventListener("wheel", this.onWheel);
        gl.deleteProgram(this.pathTracerProgram);
        gl.deleteProgram(this.displayProgram);
        gl.deleteVertexArray(this.vao);
        for (const tex of this.accumTextures) gl.deleteTexture(tex);
        for (const fbo of this.accumFramebuffers) gl.deleteFramebuffer(fbo);
    }
}
