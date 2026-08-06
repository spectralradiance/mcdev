"use client";

import React, { useRef, useEffect } from "react";
import { Scene, Sphere, PointLight, PerspectiveCamera, Vector3D, render } from "./niamh";

const NiamhRayTracer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const width = canvas.width;
    const height = canvas.height;

    // Create a scene
    const scene = new Scene();
    scene.add(new Sphere(new Vector3D(0, 0, -5), 1));
    scene.add(new PointLight(new Vector3D(0, 5, 0), 1.0));
    scene.add(
      new PerspectiveCamera(new Vector3D(0, 0, 0), new Vector3D(0, 0, -1), new Vector3D(0, 1, 0), 90)
    );

    // Render the scene
    const imageData = render(scene, width, height);

    // Draw the rendered image to the canvas
    context.putImageData(imageData, 0, 0);
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      <div style={{ width: '100%', maxWidth: '1200px' }}>
        <h1>Niamh</h1>
        <canvas ref={canvasRef} width="640" height="480" style={{ width: '100%', height: 'auto', border: "1px solid #ccc" }}></canvas>
      </div>
    </div>
  );
};

export default NiamhRayTracer;