import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Hypercube } from "./hypercube";

export interface ThreeScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  spheres: THREE.Mesh[];
  edgeCylinders: THREE.Mesh[];
  sphereGeo: THREE.SphereGeometry | null;
  cylGeo: THREE.CylinderGeometry | null;
  sphereMat: THREE.MeshPhongMaterial;
  cylinderMat: THREE.MeshPhongMaterial;
  faceMesh: THREE.Mesh | null;
  faceMat: THREE.MeshBasicMaterial;
}

/** Creates renderer, scene, camera, lights, and OrbitControls; attaches the WebGL canvas to container. */
export function createThreeScene(container: HTMLDivElement): ThreeScene {
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 600;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
  camera.position.set(0, 0, 10);

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
  dir1.position.set(3, 4, 5);
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0x4466cc, 0.4);
  dir2.position.set(-3, -2, -4);
  scene.add(dir2);

  // Warm fill from lower-right
  const pt = new THREE.PointLight(0xff9955, 0.8, 12);
  pt.position.set(2, -2, 3);
  scene.add(pt);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;

  return {
    renderer, scene, camera, controls,
    spheres: [], edgeCylinders: [],
    sphereGeo: null, cylGeo: null,
    sphereMat: new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 100 }),
    cylinderMat: new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 40 }),
    faceMesh: null,
    // depthWrite:false prevents z-fighting with edges drawn on top
    faceMat: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
  };
}

/** Disposes old vertex/edge meshes and recreates them for the given hypercube topology. */
export function rebuildMeshes(ts: ThreeScene, hc: Hypercube): void {
  ts.spheres.forEach(m => ts.scene.remove(m));
  ts.edgeCylinders.forEach(m => ts.scene.remove(m));
  ts.sphereGeo?.dispose();
  ts.cylGeo?.dispose();

  const sphereGeo = new THREE.SphereGeometry(0.065, 14, 10);
  // Unit-height cylinder; scaled and rotated to match each edge every frame
  const cylGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 8);
  ts.sphereGeo = sphereGeo;
  ts.cylGeo = cylGeo;

  ts.spheres = hc.points.map(() => {
    const m = new THREE.Mesh(sphereGeo, ts.sphereMat);
    ts.scene.add(m);
    return m;
  });
  ts.edgeCylinders = hc.edges.map(() => {
    const m = new THREE.Mesh(cylGeo, ts.cylinderMat);
    ts.scene.add(m);
    return m;
  });

  // Single merged mesh for all faces; position buffer is overwritten each frame
  if (ts.faceMesh) { ts.scene.remove(ts.faceMesh); ts.faceMesh.geometry.dispose(); }
  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(hc.faces.length * 18), 3));
  ts.faceMesh = new THREE.Mesh(faceGeo, ts.faceMat);
  ts.faceMesh.visible = false;
  ts.scene.add(ts.faceMesh);
}
