"use client";

import React, { useState, useRef, useEffect } from 'react';

interface PStateParams {
  width: number;
  height: number;
  transparency: boolean;
}

class PState {
  width: number;
  height: number;
  wo2: number;
  ho2: number;
  data: number[][];

  constructor(mp: PStateParams) {
    this.width = mp.width;
    this.height = mp.height;
    this.wo2 = mp.width / 2;
    this.ho2 = mp.height / 2;
    this.data = [];
    for (let i = 0; i < mp.width; ++i) {
      let t = [];
      for (let j = 0; j < mp.height; ++j) {
        t.push(mp.transparency ? -1 : 0);
      }
      this.data.push(t);
    }
  }
  replaceColor(v1: number, v2: number) {
    for (let i = 0; i < this.width; ++i) {
      for (let j = 0; j < this.height; ++j) {
        if (this.data[i][j] === v1) {
          this.data[i][j] = v2;
        }
      }
    }
  }
  swapColors(v1: number, v2: number) {
    for (let i = 0; i < this.width; ++i) {
      for (let j = 0; j < this.height; ++j) {
        if (this.data[i][j] === v1) {
          this.data[i][j] = v2;
        } else if (this.data[i][j] === v2) {
          this.data[i][j] = v1;
        }
      }
    }
  }
  adjustSize(mp: PStateParams) {
    let nd = [];
    for (let i = 0; i < mp.width; ++i) {
      let t = [];
      for (let j = 0; j < mp.height; ++j) {
        if (i < this.width && j < this.height) {
          t.push(this.data[i][j]);
        } else {
          t.push(mp.transparency ? -1 : 0);
        }
      }
      nd.push(t);
    }
    this.width = mp.width;
    this.height = mp.height;
    this.wo2 = mp.width / 2;
    this.ho2 = mp.height / 2;
    this.data = nd;
  }
  clone(mp: PStateParams) {
    let r = new PState(mp);
    for (let i = 0; i < this.width; ++i) {
      for (let j = 0; j < this.height; ++j) {
        r.data[i][j] = this.data[i][j];
      }
    }
    return r;
  }
  toCenter(p: [number, number]): [number, number] {
    return [p[0] - this.wo2, p[1] - this.ho2];
  }
  fromCenter(p: [number, number]): [number, number] {
    return [p[0] + this.wo2, p[1] + this.ho2];
  }
}

function createGrayscalePalette(n_grey: number) {
  let r = [];
  let s = 255 / (n_grey - 1);
  for (let i = 0; i < n_grey; ++i) {
    let c = i * s;
    r.push([c, c, c, 255]);
  }
  return r;
}

function Apax() {
  const [mp, setMp] = useState({ width: 64, height: 64, scale: 6, transparency: false });
  const [palette, setPalette] = useState(createGrayscalePalette(4));
  const [brush, setBrush] = useState(3);
  const [symmetries, setSymmetries] = useState([
    { type: 'reflect', value: '|' },
    { type: 'tile', nx: 4, ny: 4 }
  ]);
  const [state, setState] = useState(() => new PState(mp));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mouseDown, setMouseDown] = useState(false);

  useEffect(() => {
    refreshState();
    // eslint-disable-next-line
  }, [mp]);

  function refreshState() {
    let s = state.clone(mp);
    s.adjustSize(mp);
    setState(s);
    let canvas = canvasRef.current;
    if (canvas) {
      canvas.width = mp.width * mp.scale;
      canvas.height = mp.height * mp.scale;
      renderImage(s);
    }
  }

  function renderImage(s: PState) {
    let canvas = canvasRef.current;
    if (!canvas) return;
    let ctx = canvas.getContext('2d');
    if (!ctx) return;
    let img_data = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < s.width; ++i) {
      for (let j = 0; j < s.height; ++j) {
        let v = s.data[i][j];
        let c = v === -1 ? [0, 0, 0, 0] : palette[v];
        for (let m = 0; m < mp.scale; ++m) {
          let ni = i * mp.scale + m;
          for (let n = 0; n < mp.scale; ++n) {
            let nj = j * mp.scale + n;
            let index = (ni + nj * canvas.width) * 4;
            img_data.data[index + 0] = c[0];
            img_data.data[index + 1] = c[1];
            img_data.data[index + 2] = c[2];
            img_data.data[index + 3] = c[3];
          }
        }
      }
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(img_data, 0, 0);
  }

  function screenToImage(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>): [number, number] {
    let canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    let rect = canvas.getBoundingClientRect();
    let p = [e.clientX - rect.left, e.clientY - rect.top];
    p[0] = Math.floor((p[0] / canvas.width) * state.width);
    p[1] = Math.floor((p[1] / canvas.height) * state.height);
    return p as [number, number];
  }

  function drawPixel(p: [number, number], v: number) {
    let pts: [number, number][] = [p];
    for (let i = 0; i < symmetries.length; ++i) {
      let pts2: [number, number][] = [];
      for (let j = 0; j < pts.length; ++j) {
        pts2 = pts2.concat(transform(symmetries[i], pts[j]));
      }
      pts = pts2;
    }
    let s = state.clone(mp);
    for (let i = 0; i < pts.length; ++i) {
      if (
        pts[i][0] >= 0 &&
        pts[i][0] < s.width &&
        pts[i][1] >= 0 &&
        pts[i][1] < s.height
      ) {
        s.data[pts[i][0]][pts[i][1]] = v;
      }
    }
    setState(s);
    renderImage(s);
  }

  function transform(sym: { type: string; value?: string; nx?: number; ny?: number }, p: [number, number]): [number, number][] {
    // Only reflect and tile implemented for brevity
    if (sym.type === 'reflect' && sym.value) {
      let ai = p[0], aj = p[1];
      let bi = state.width - ai - 1, bj = state.height - aj - 1;
      if (sym.value === '|') {
        return [[ai, aj], [bi, aj]];
      } else if (sym.value === '-') {
        return [[ai, aj], [ai, bj]];
      } else if (sym.value === '\\') {
        return [[ai, aj], [aj, ai]];
      } else if (sym.value === '/') {
        return [[ai, aj], [bj, bi]];
      }
    } else if (sym.type === 'tile' && sym.nx && sym.ny) {
      let sx = Math.floor(state.width / sym.nx);
      let sy = Math.floor(state.height / sym.ny);
      let r: [number, number][] = [];
      let ox = p[0] % sx;
      let oy = p[1] % sy;
      for (let i = 0; i < sym.nx; ++i) {
        for (let j = 0; j < sym.ny; ++j) {
          r.push([ox + i * sx, oy + j * sy]);
        }
      }
      return r;
    }
    return [p];
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
    if (e.button === 0) {
      let p = screenToImage(e);
      drawPixel(p, brush);
      setMouseDown(true);
    }
  }
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
    if (mouseDown) {
      let p = screenToImage(e);
      drawPixel(p, brush);
    }
  }
  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
    setMouseDown(false);
  }
  function handleMouseLeave(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
    setMouseDown(false);
  }

  function exportImage() {
    const canvas = canvasRef.current;
    if (canvas) {
      window.open(canvas.toDataURL('image/png'));
    }
  }

  function addColor() {
    setPalette([...palette, [0, 0, 0, 255]]);
  }

  function removeColor(i: number) {
    let p = [...palette];
    p.splice(i, 1);
    setPalette(p);
  }

  function moveColorUp(i: number) {
    if (i > 0) {
      let p = [...palette];
      let t = p[i];
      p[i] = p[i - 1];
      p[i - 1] = t;
      setPalette(p);
    }
  }

  function moveColorDown(i: number) {
    if (i < palette.length - 1) {
      let p = [...palette];
      let t = p[i];
      p[i] = p[i + 1];
      p[i + 1] = t;
      setPalette(p);
    }
  }

  function addSymmetry() {
    setSymmetries([...symmetries, { type: 'reflect', value: '|' }]);
  }

  function removeSymmetry(i: number) {
    let s = [...symmetries];
    s.splice(i, 1);
    setSymmetries(s);
  }

  function moveSymmetryUp(i: number) {
    if (i > 0) {
      let s = [...symmetries];
      let t = s[i];
      s[i] = s[i - 1];
      s[i - 1] = t;
      setSymmetries(s);
    }
  }

  function moveSymmetryDown(i: number) {
    if (i < symmetries.length - 1) {
      let s = [...symmetries];
      let t = s[i];
      s[i] = s[i + 1];
      s[i + 1] = t;
      setSymmetries(s);
    }
  }

  function setSymmetryType(i: number, type: string) {
    let s = [...symmetries];
    let sym = { ...s[i], type: type };
    if (type === 'rotate') {
      (sym as any).n_sectors = 2;
    }
    s[i] = sym;
    setSymmetries(s);
  }

  function setRotator(i: number, n_sectors: number) {
    let s = [...symmetries];
    let sym = { ...s[i], n_sectors: n_sectors };
    let a = (2 * Math.PI) / n_sectors;
    (sym as any).ca = Math.cos(a);
    (sym as any).sa = Math.sin(a);
    s[i] = sym;
    setSymmetries(s);
  }

  function setTileParams(i: number, nx: number, ny: number) {
    let s = [...symmetries];
    s[i] = { type: 'tile', nx: nx, ny: ny };
    setSymmetries(s);
  }

  function setReflectValue(i: number, value: string) {
    let s = [...symmetries];
    s[i] = { type: 'reflect', value: value };
    setSymmetries(s);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ border: '1px solid black' }}
      ></canvas>
      <div>
        <button onClick={exportImage}>Export</button>
      </div>
      <div>
        <h2>Palette</h2>
        <button onClick={addColor}>Add Color</button>
        {palette.map((c, i) => (
          <div key={i}>
            <input
              type="color"
              value={`#${c[0].toString(16).padStart(2, '0')}${c[1].toString(16).padStart(2, '0')}${c[2].toString(16).padStart(2, '0')}`}
              onChange={(e) => {
                let p = [...palette];
                let val = e.target.value;
                p[i] = [
                  parseInt(val.slice(1, 3), 16),
                  parseInt(val.slice(3, 5), 16),
                  parseInt(val.slice(5, 7), 16),
                  255,
                ];
                setPalette(p);
              }}
            />
            <button onClick={() => removeColor(i)}>Remove</button>
            <button onClick={() => moveColorUp(i)}>Up</button>
            <button onClick={() => moveColorDown(i)}>Down</button>
            <input
              type="radio"
              name="brush"
              checked={brush === i}
              onChange={() => setBrush(i)}
            />
          </div>
        ))}
      </div>
      <div>
        <h2>Symmetries</h2>
        <button onClick={addSymmetry}>Add Symmetry</button>
        {symmetries.map((sym, i) => (
          <div key={i}>
            <select
              value={sym.type}
              onChange={(e) => setSymmetryType(i, e.target.value)}
            >
              <option value="reflect">Reflect</option>
              <option value="rotate">Rotate</option>
              <option value="tile">Tile</option>
            </select>
            {sym.type === 'reflect' && (
              <select
                value={sym.value}
                onChange={(e) => setReflectValue(i, e.target.value)}
              >
                <option value="|">Vertical</option>
                <option value="-">Horizontal</option>
                <option value="\">Backslash</option>
                <option value="/">Slash</option>
              </select>
            )}
            {sym.type === 'rotate' && (
              <input
                type="number"
                value={(sym as any).n_sectors}
                onChange={(e) => setRotator(i, parseInt(e.target.value))}
              />
            )}
            {sym.type === 'tile' && (
              <>
                <input
                  type="number"
                  value={sym.nx}
                  onChange={(e) =>
                    setTileParams(i, parseInt(e.target.value), sym.ny!)
                  }
                />
                <input
                  type="number"
                  value={sym.ny}
                  onChange={(e) =>
                    setTileParams(i, sym.nx!, parseInt(e.target.value))
                  }
                />
              </>
            )}
            <button onClick={() => removeSymmetry(i)}>Remove</button>
            <button onClick={() => moveSymmetryUp(i)}>Up</button>
            <button onClick={() => moveSymmetryDown(i)}>Down</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Apax;
