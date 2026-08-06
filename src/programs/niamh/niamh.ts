import { kMaxLength } from "buffer";

// Basic data structures
export class Vector3D {
    constructor(public x: number, public y: number, public z: number) {}

    static add(v1: Vector3D, v2: Vector3D): Vector3D {
        return new Vector3D(v1.x + v2.x, v1.y + v2.y, v1.z + v2.z);
    }

    static subtract(v1: Vector3D, v2: Vector3D): Vector3D {
        return new Vector3D(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z);
    }

    static multiply(v: Vector3D, s: number): Vector3D {
        return new Vector3D(v.x * s, v.y * s, v.z * s);
    }

    static dot(v1: Vector3D, v2: Vector3D): number {
        return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    }

    static cross(v1: Vector3D, v2: Vector3D): Vector3D {
        return new Vector3D(
            v1.y * v2.z - v1.z * v2.y,
            v1.z * v2.x - v1.x * v2.z,
            v1.x * v2.y - v1.y * v2.x
        );
    }

    magnitude(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    normalize(): Vector3D {
        const mag = this.magnitude();
        if (mag === 0) return new Vector3D(0, 0, 0);
        return new Vector3D(this.x / mag, this.y / mag, this.z / mag);
    }
}

export class Color {
    constructor(public r: number, public g: number, public b: number) {}

    static multiply(c: Color, s: number): Color {
        return new Color(c.r * s, c.g * s, c.b * s);
    }

    static add(c1: Color, c2: Color): Color {
        return new Color(c1.r + c2.r, c1.g + c2.g, c1.b + c2.b);
    }
}

export class Ray {
    constructor(public origin: Vector3D, public direction: Vector3D) {
        this.direction = direction.normalize();
    }
}

export interface Intersection {
    t: number;
    point: Vector3D;
    normal: Vector3D;
    object: Intersectable;
}

// Core Interfaces
export interface Intersectable {
    intersect(ray: Ray): Intersection | null;
}

export interface Light {
    // Placeholder for light properties
}

export interface Camera {
    generateRay(x: number, y: number): Ray;
}

// Intersectable Implementations
export class Sphere implements Intersectable {
    constructor(public center: Vector3D, public radius: number) {}

    intersect(ray: Ray): Intersection | null {
        const oc = Vector3D.subtract(ray.origin, this.center);
        const a = Vector3D.dot(ray.direction, ray.direction);
        const b = 2.0 * Vector3D.dot(oc, ray.direction);
        const c = Vector3D.dot(oc, oc) - this.radius * this.radius;
        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) {
            return null;
        } else {
            const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
            if (t < 0) return null; // Intersection is behind the ray's origin
            const point = Vector3D.add(ray.origin, Vector3D.multiply(ray.direction, t));
            const normal = Vector3D.subtract(point, this.center).normalize();
            return { t, point, normal, object: this };
        }
    }
}

export class Cube implements Intersectable {
    constructor(public center: Vector3D, public size: number) {}

    intersect(ray: Ray): Intersection | null {
        // Implement cube intersection logic here (e.g., by treating it as 6 planes)
        return null;
    }
}

// Light Implementations
export class PointLight implements Light {
    constructor(public position: Vector3D, public intensity: number) {}
}

export class AreaLight implements Light {
    constructor(public position: Vector3D, public uVec: Vector3D, public vVec: Vector3D, public intensity: number) {}
}

export class SpotLight implements Light {
    constructor(public position: Vector3D, public direction: Vector3D, public angle: number, public intensity: number) {}
}

// Camera Implementations
export class PerspectiveCamera implements Camera {
    constructor(public position: Vector3D, public lookAt: Vector3D, public up: Vector3D, public fov: number) {}

    generateRay(x: number, y: number): Ray {
        // Implement perspective ray generation
        return new Ray(this.position, new Vector3D(x, y, -1)); // Simplified
    }
}

export class SphericalCamera implements Camera {
    constructor(public position: Vector3D) {}

    generateRay(x: number, y: number): Ray {
        // Implement spherical (360 degree) ray generation
        const theta = x * 2 * Math.PI;
        const phi = y * Math.PI;
        const dx = Math.sin(phi) * Math.cos(theta);
        const dy = Math.cos(phi);
        const dz = Math.sin(phi) * Math.sin(theta);
        return new Ray(this.position, new Vector3D(dx, dy, dz));
    }
}

// Scene
export class Scene {
    public objects: Intersectable[] = [];
    public lights: Light[] = [];
    public camera: Camera | null = null;

    add(object: Intersectable | Light | Camera): void {
        if ('intersect' in object) {
            this.objects.push(object as Intersectable);
        } else if ('generateRay' in object) {
            if (this.camera) {
                console.warn("Scene already has a camera. Overwriting.");
            }
            this.camera = object as Camera;
        } else {
            this.lights.push(object as Light);
        }
    }

    intersect(ray: Ray): Intersection | null {
        let closestIntersection: Intersection | null = null;
        for (const object of this.objects) {
            const intersection = object.intersect(ray);
            if (intersection && (closestIntersection === null || intersection.t < closestIntersection.t)) {
                closestIntersection = intersection;
            }
        }
        return closestIntersection;
    }
}

export function render(scene: Scene, width: number, height: number): ImageData {
    const imageData = new ImageData(width, height);
    if (!scene.camera) {
        throw new Error("Scene has no camera.");
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const u = x / (width - 1);
            const v = y / (height - 1);
            const ray = scene.camera.generateRay(u, v);
            const intersection = scene.intersect(ray);

            let color = new Color(0, 0, 0); // Background color
            if (intersection) {
                // Simple lighting: diffuse shading
                const light = scene.lights[0] as PointLight; // Assume at least one light
                if (light) {
                    const lightDir = Vector3D.subtract(light.position, intersection.point).normalize();
                    const diff = Math.max(0, Vector3D.dot(intersection.normal, lightDir));
                    color = Color.multiply(new Color(1, 1, 1), diff); // Object color is white for now
                }
            }

            const i = (y * width + x) * 4;
            imageData.data[i] = color.r * 255;
            imageData.data[i + 1] = color.g * 255;
            imageData.data[i + 2] = color.b * 255;
            imageData.data[i + 3] = 255; // Alpha
        }
    }
    return imageData;
}