"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ─── data model ──────────────────────────────────────────────────────────────

interface Mp { width: number; height: number; scale: number; transparency: boolean; }

class PState {
  width: number; height: number; wo2: number; ho2: number; data: number[][];

  constructor(mp: Mp) {
    this.width = mp.width; this.height = mp.height;
    this.wo2 = mp.width / 2; this.ho2 = mp.height / 2;
    this.data = [];
    for (let i = 0; i < mp.width; ++i) {
      const t: number[] = [];
      for (let j = 0; j < mp.height; ++j) t.push(mp.transparency ? -1 : 0);
      this.data.push(t);
    }
  }
  replaceColor(v1: number, v2: number) {
    for (let i = 0; i < this.width; ++i)
      for (let j = 0; j < this.height; ++j)
        if (this.data[i][j] === v1) this.data[i][j] = v2;
  }
  swapColors(v1: number, v2: number) {
    for (let i = 0; i < this.width; ++i)
      for (let j = 0; j < this.height; ++j) {
        if      (this.data[i][j] === v1) this.data[i][j] = v2;
        else if (this.data[i][j] === v2) this.data[i][j] = v1;
      }
  }
  adjustSize(mp: Mp) {
    const nd: number[][] = [];
    for (let i = 0; i < mp.width; ++i) {
      const t: number[] = [];
      for (let j = 0; j < mp.height; ++j)
        t.push(i < this.width && j < this.height ? this.data[i][j] : (mp.transparency ? -1 : 0));
      nd.push(t);
    }
    this.width = mp.width; this.height = mp.height;
    this.wo2 = mp.width / 2; this.ho2 = mp.height / 2;
    this.data = nd;
  }
  toCenter(p: [number, number]): [number, number] { return [p[0] - this.wo2, p[1] - this.ho2]; }
  fromCenter(p: [number, number]): [number, number] { return [p[0] + this.wo2, p[1] + this.ho2]; }
}

// ─── color utilities ─────────────────────────────────────────────────────────

function rgbText(c: number[], t: boolean) {
  return t ? `rgba(${c[0]},${c[1]},${c[2]},${c[3]/255})` : `rgb(${c[0]},${c[1]},${c[2]})`;
}
function hex2(v: number) { const s = Math.round(v).toString(16).toUpperCase(); return s.length === 1 ? '0'+s : s; }
function hexText(c: number[], t: boolean) {
  return t ? `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}${hex2(c[3])}` : `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;
}
function hsvToRgb(c: number[]): number[] {
  const [h, s, v, a] = c;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v*(1-s), q = v*(1-f*s), t = v*(1-(1-f)*s);
  const m: [number,number,number][] = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]];
  const [r,g,b] = m[i % 6];
  return [Math.floor(r*255), Math.floor(g*255), Math.floor(b*255), Math.floor(a*255)];
}
function rgbToHsv(c: number[]): number[] {
  const [r,g,b,a] = c, max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  let h = 0;
  if (max !== min) {
    switch (max) {
      case r: h = ((g-b)+d*(g<b?6:0))/(6*d); break;
      case g: h = ((b-r)+d*2)/(6*d); break;
      case b: h = ((r-g)+d*4)/(6*d); break;
    }
  }
  return [h, max===0?0:d/max, max/255, a];
}
function toRGB(vals: number[], mode: string): number[] {
  return mode === 'rgb'
    ? vals.map(v => Math.floor(v * 255))
    : hsvToRgb(vals);
}
function grayscalePalette(n: number): number[][] {
  const s = 255 / (n - 1);
  return Array.from({length: n}, (_, i) => { const c = i*s; return [c,c,c,255]; });
}

// ─── symmetry ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySymmetry(sym: any, p: [number,number], st: PState): [number,number][] {
  if (sym.type === 'rotate') {
    const pts: [number,number][] = [];
    let q = st.toCenter(p);
    for (let i = 0; i < sym.n_sectors; ++i) {
      const p2 = st.fromCenter(q);
      pts.push([q[0]>0?Math.floor(p2[0]+.5):Math.ceil(p2[0]-.5), q[1]>0?Math.floor(p2[1]+.5):Math.ceil(p2[1]-.5)]);
      q = [q[0]*sym.ca - q[1]*sym.sa, q[0]*sym.sa + q[1]*sym.ca];
    }
    return pts;
  }
  if (sym.type === 'reflect') {
    const [ai,aj] = p, bi = st.width-ai-1, bj = st.height-aj-1;
    if (sym.value==='|')  return [[ai,aj],[bi,aj]];
    if (sym.value==='-')  return [[ai,aj],[ai,bj]];
    if (sym.value==='\\') return [[ai,aj],[aj,ai]];
    if (sym.value==='/')  return [[ai,aj],[bj,bi]];
  }
  if (sym.type === 'tile') {
    const sx = Math.floor(st.width/sym.nx), sy = Math.floor(st.height/sym.ny);
    const ox = p[0]%sx, oy = p[1]%sy, r: [number,number][] = [];
    for (let i = 0; i < sym.nx; ++i)
      for (let j = 0; j < sym.ny; ++j)
        r.push([ox+i*sx, oy+j*sy]);
    return r;
  }
  return [p];
}

// ─── component ───────────────────────────────────────────────────────────────

export default function Apax() {
  // mutable refs — drawing bypasses React
  const mp    = useRef<Mp>({ width: 64, height: 64, scale: 6, transparency: false });
  const pst   = useRef(new PState(mp.current));
  const pal   = useRef(grayscalePalette(4));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syms  = useRef<any[]>([{ type:'reflect', value:'|' }, { type:'tile', nx:4, ny:4 }]);
  const brush = useRef(3);
  const mdown = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // single counter drives all UI re-renders
  const [tick, setTick] = useState(0);
  const repaint = useCallback(() => setTick(t => t+1), []);

  // color picker refs
  const cpOpen   = useRef(false);
  const cpIdx    = useRef(-1);
  const cpMode   = useRef<'rgb'|'hsv'>('rgb');
  const cpVals   = useRef([0,0,0,1]);
  const cpPos    = useRef({ x: 0, y: 0 });
  const cpFirst  = useRef(false);
  const cpDown   = useRef(-1);
  const sl0 = useRef<HTMLCanvasElement>(null);
  const sl1 = useRef<HTMLCanvasElement>(null);
  const sl2 = useRef<HTMLCanvasElement>(null);
  const sl3 = useRef<HTMLCanvasElement>(null);
  const cpSliders = [sl0, sl1, sl2, sl3];

  // ── canvas rendering ────────────────────────────────────────────────────────

  const renderImage = useCallback(() => {
    const cnv = canvasRef.current; if (!cnv) return;
    const ctx = cnv.getContext('2d'); if (!ctx) return;
    const s = pst.current, scale = mp.current.scale, p = pal.current;
    const img = ctx.createImageData(cnv.width, cnv.height);
    for (let i = 0; i < s.width; ++i)
      for (let j = 0; j < s.height; ++j) {
        const v = s.data[i][j], c = v===-1 ? [0,0,0,0] : p[v];
        for (let m = 0; m < scale; ++m) {
          const ni = i*scale+m;
          for (let n = 0; n < scale; ++n) {
            const idx = (ni + (j*scale+n)*cnv.width)*4;
            img.data[idx]=c[0]; img.data[idx+1]=c[1]; img.data[idx+2]=c[2]; img.data[idx+3]=c[3];
          }
        }
      }
    ctx.putImageData(img, 0, 0);
  }, []);

  const refreshCursor = useCallback(() => {
    const cnv = canvasRef.current; if (!cnv) return;
    const c = brush.current===-1 ? [0,0,0,255] : pal.current[brush.current];
    const scale = mp.current.scale;
    const tmp = document.createElement('canvas');
    tmp.width = scale; tmp.height = scale;
    const ctx = tmp.getContext('2d')!;
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${c[3]/255})`;
    ctx.fillRect(0,0,scale,scale);
    cnv.style.cursor = `url(${tmp.toDataURL()}) ${Math.floor(scale/2)} ${Math.floor(scale/2)}, crosshair`;
  }, []);

  // ── color picker sliders ────────────────────────────────────────────────────

  const drawAllSliders = useCallback(() => {
    const vals = cpVals.current, mode = cpMode.current, trans = mp.current.transparency;
    const LH = 8;
    cpSliders.forEach((ref, id) => {
      const cnv = ref.current; if (!cnv) return;
      const ctx = cnv.getContext('2d'); if (!ctx) return;
      ctx.clearRect(0, 0, cnv.width, cnv.height);
      const rgb = toRGB(vals, mode);
      const pv = Math.floor(vals[id] * cnv.width) + 0.5;
      ctx.lineWidth = 1; ctx.strokeStyle = rgbText(rgb, trans);
      ctx.beginPath(); ctx.moveTo(pv,0); ctx.lineTo(pv,cnv.height); ctx.stroke();
      ctx.lineWidth = 2;
      for (let i = 0; i < cnv.width; ++i) {
        const v = vals.slice(); v[id] = i/cnv.width;
        const c = toRGB(v, mode);
        const off = (cnv.height - LH) / 2;
        ctx.strokeStyle = rgbText(c, trans);
        ctx.beginPath(); ctx.moveTo(i,off); ctx.lineTo(i,off+LH); ctx.stroke();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (cpOpen.current) drawAllSliders(); }, [tick, drawAllSliders]);

  // ── drawing ─────────────────────────────────────────────────────────────────

  function screenToImage(e: React.MouseEvent<HTMLCanvasElement>): [number,number] {
    const cnv = canvasRef.current!;
    const rect = cnv.getBoundingClientRect(), s = pst.current;
    return [
      Math.floor(((e.clientX-rect.left)/cnv.width)*s.width),
      Math.floor(((e.clientY-rect.top)/cnv.height)*s.height),
    ];
  }

  function drawPixel(p: [number,number], v: number) {
    let pts: [number,number][] = [p];
    for (const sym of syms.current) {
      let pts2: [number,number][] = [];
      for (const pt of pts) pts2 = pts2.concat(applySymmetry(sym, pt, pst.current));
      pts = pts2;
    }
    const s = pst.current;
    for (const pt of pts)
      if (pt[0]>=0 && pt[0]<s.width && pt[1]>=0 && pt[1]<s.height)
        s.data[pt[0]][pt[1]] = v;
  }

  function onCanvasDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    drawPixel(screenToImage(e), brush.current);
    renderImage(); mdown.current = true;
  }
  function onCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!mdown.current) return;
    drawPixel(screenToImage(e), brush.current); renderImage();
  }
  function onCanvasUp()    { mdown.current = false; }
  function onCanvasLeave() { mdown.current = false; }

  // ── settings ────────────────────────────────────────────────────────────────

  function applySettings(newMp: Mp) {
    mp.current = newMp; pst.current.adjustSize(newMp);
    const cnv = canvasRef.current!;
    cnv.width = newMp.width * newMp.scale; cnv.height = newMp.height * newMp.scale;
    refreshCursor(); renderImage();
  }

  function toggleTransparency() {
    const t = !mp.current.transparency; mp.current = { ...mp.current, transparency: t };
    if (!t) {
      for (const c of pal.current) c[3] = 255;
      const s = pst.current;
      for (let i = 0; i < s.width; ++i)
        for (let j = 0; j < s.height; ++j)
          if (s.data[i][j] === -1) s.data[i][j] = 0;
    }
    repaint(); renderImage();
  }

  function clearImage() {
    const v = mp.current.transparency ? -1 : 0, s = pst.current;
    for (let i = 0; i < s.width; ++i) for (let j = 0; j < s.height; ++j) s.data[i][j] = v;
    renderImage();
  }

  function saveImage() { const c = canvasRef.current; if (c) window.open(c.toDataURL('image/png')); }

  // ── palette ─────────────────────────────────────────────────────────────────

  function addColor()        { pal.current.push([0,0,0,255]); repaint(); }
  function removeColor(i: number) {
    if (pal.current.length <= 1) return;
    pal.current.splice(i, 1); pst.current.replaceColor(i, mp.current.transparency ? -1 : 0);
    if (brush.current === i) brush.current = 0;
    refreshCursor(); repaint(); renderImage();
  }
  function moveColorUp(i: number) {
    if (i <= 0) return;
    [pal.current[i], pal.current[i-1]] = [pal.current[i-1], pal.current[i]];
    pst.current.swapColors(i, i-1);
    if (brush.current===i) brush.current=i-1; else if (brush.current===i-1) brush.current=i;
    refreshCursor(); repaint(); renderImage();
  }
  function moveColorDown(i: number) {
    if (i >= pal.current.length-1) return;
    [pal.current[i], pal.current[i+1]] = [pal.current[i+1], pal.current[i]];
    pst.current.swapColors(i, i+1);
    if (brush.current===i) brush.current=i+1; else if (brush.current===i+1) brush.current=i;
    refreshCursor(); repaint(); renderImage();
  }
  function setBrush(v: number) { brush.current = v; refreshCursor(); repaint(); }

  // ── symmetry ─────────────────────────────────────────────────────────────────

  function addSym()          { syms.current.push({ type:'none' }); repaint(); }
  function removeSym(i: number) { syms.current.splice(i,1); repaint(); }
  function moveSymUp(i: number) {
    if (i<=0) return;
    [syms.current[i],syms.current[i-1]]=[syms.current[i-1],syms.current[i]]; repaint();
  }
  function moveSymDown(i: number) {
    if (i>=syms.current.length-1) return;
    [syms.current[i],syms.current[i+1]]=[syms.current[i+1],syms.current[i]]; repaint();
  }
  function setSymType(i: number, type: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = { type };
    if (type==='rotate') { s.n_sectors=2; s.ca=Math.cos(Math.PI); s.sa=Math.sin(Math.PI); }
    else if (type==='reflect') s.value='|';
    else if (type==='tile')    { s.nx=2; s.ny=2; }
    syms.current[i] = s; repaint();
  }
  function setRotator(i: number, n: number) {
    const a = 2*Math.PI/n;
    syms.current[i] = { ...syms.current[i], n_sectors:n, ca:Math.cos(a), sa:Math.sin(a) };
  }

  // ── color picker ─────────────────────────────────────────────────────────────

  function openCp(e: React.MouseEvent, i: number) {
    const c = pal.current[i];
    cpIdx.current = i; cpMode.current = 'rgb';
    cpVals.current = c.map(v => v/255);
    cpPos.current = { x: Math.max(0, e.clientX-260), y: e.clientY };
    brush.current = i; cpFirst.current = true; cpOpen.current = true;
    refreshCursor(); repaint();
  }
  function cpOk() {
    pal.current[cpIdx.current] = toRGB(cpVals.current, cpMode.current);
    cpOpen.current = false; refreshCursor(); repaint(); renderImage();
  }
  function cpCancel() { cpOpen.current = false; repaint(); }
  function cpSwitchMode(m: 'rgb'|'hsv') {
    if (cpMode.current === m) return;
    if (m==='hsv') cpVals.current = rgbToHsv(cpVals.current.map(v => v*255));
    else           cpVals.current = hsvToRgb(cpVals.current).map(v => v/255);
    cpMode.current = m; repaint();
  }
  function cpSliderUpdate(e: React.MouseEvent<HTMLCanvasElement>, id: number) {
    const cnv = cpSliders[id].current!;
    const rect = cnv.getBoundingClientRect();
    cpVals.current[id] = Math.max(0, Math.min(1, (e.clientX-rect.left+1)/cnv.width));
    repaint();
  }

  // dismiss on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (cpFirst.current) { cpFirst.current = false; return; }
      const el = document.getElementById('apax-cp');
      if (el && !el.contains(e.target as Node)) { cpOpen.current = false; repaint(); }
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // initial mount
  useEffect(() => {
    const cnv = canvasRef.current!;
    cnv.width  = mp.current.width  * mp.current.scale;
    cnv.height = mp.current.height * mp.current.scale;
    renderImage(); refreshCursor();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── styles ──────────────────────────────────────────────────────────────────

  const btn: React.CSSProperties = { paddingLeft:4, paddingRight:4, cursor:'default', display:'inline-block', verticalAlign:'middle' };
  const tbtn: React.CSSProperties = { border:'0.5px solid dimgray', cursor:'default', padding:4, display:'inline-block', verticalAlign:'middle', userSelect:'none' };
  const inp: React.CSSProperties = { backgroundColor:'black', color:'white', border:'0.5px solid dimgrey', padding:2, fontFamily:"'Courier New'", width:44 };
  const sinp: React.CSSProperties = { ...inp, width:26, textAlign:'center' };
  const trans = mp.current.transparency;
  const cpRgb = toRGB(cpVals.current, cpMode.current);
  const cpColor = rgbText(cpRgb, trans);

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily:"'Courier New'", fontSize:14, color:'lightgrey', position:'relative' }}>
      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

        {/* ── Left panel ── */}
        <div style={{ width:220, flexShrink:0 }}>
          <div style={{ borderBottom:'0.5px solid gray', marginBottom:4 }}>image settings</div>
          <table style={{ borderCollapse:'collapse' }}>
            <tbody>
              {([['width',mp.current.width,'width'],['height',mp.current.height,'height'],['scale',mp.current.scale,'scale']] as [string,number,string][]).map(([label,val,key]) => (
                <tr key={key}>
                  <td style={{ textAlign:'right', padding:4 }}>{label}</td>
                  <td style={{ padding:4 }}>
                    <input type="text" defaultValue={val} style={inp}
                      onBlur={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n>0) applySettings({...mp.current,[key]:n}); }}
                      onKeyDown={e => e.key==='Enter' && (e.target as HTMLInputElement).blur()} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop:8, display:'flex', gap:6 }}>
            <span style={tbtn} onClick={clearImage}>clear</span>
            <span style={tbtn} onClick={saveImage}>save</span>
          </div>
          <div style={{ marginTop:6 }}>
            <span style={tbtn} onClick={toggleTransparency}>
              {trans ? 'disable transparency' : 'enable transparency'}
            </span>
          </div>

          <div style={{ borderBottom:'0.5px solid gray', marginTop:12, marginBottom:4 }}>symmetry stack</div>
          <table style={{ borderCollapse:'collapse', width:'100%' }}>
            <tbody>
              {syms.current.map((sym, i) => (
                // key includes type so inputs remount on type switch
                <tr key={i + '-' + sym.type} style={{ borderBottom:'0.5px solid #333' }}>
                  <td style={{ padding:4, borderRight:'0.5px solid grey' }}>
                    <span style={btn} title="remove"    onClick={() => removeSym(i)}>✕</span>
                    <span style={btn} title="move up"   onClick={() => moveSymUp(i)}>↑</span>
                    <span style={btn} title="move down" onClick={() => moveSymDown(i)}>↓</span>
                  </td>
                  <td style={{ padding:4, borderRight:'0.5px solid grey', textAlign:'center' }}>
                    {([['↻','rotate'],['✛','reflect'],['#','tile']] as [string,string][]).map(([icon,type]) => (
                      <span key={type} style={{ ...btn, color:sym.type===type?'white':'dimgray' }} title={type} onClick={() => setSymType(i,type)}>{icon}</span>
                    ))}
                  </td>
                  <td style={{ padding:4, textAlign:'center' }}>
                    {sym.type==='rotate' && (
                      <input type="text" style={sinp} defaultValue={sym.n_sectors}
                        onBlur={e => { const n=parseInt(e.target.value); if (!isNaN(n)&&n>=2) setRotator(i,n); }}
                        onKeyDown={e => e.key==='Enter' && (e.target as HTMLInputElement).blur()} />
                    )}
                    {sym.type==='reflect' && (
                      <>
                        {([['─','-','h'],['│','|','v'],['/','/','d'],['\\','\\','r']] as [string,string,string][]).map(([icon,val,t]) => (
                          <span key={val} style={{ ...btn, color:sym.value===val?'white':'dimgray' }} title={t}
                            onClick={() => { syms.current[i]={...sym,value:val}; repaint(); }}>{icon}</span>
                        ))}
                      </>
                    )}
                    {sym.type==='tile' && (
                      <span style={{ fontSize:12 }}>
                        <input type="text" style={sinp} defaultValue={sym.nx}
                          onBlur={e => { const n=parseInt(e.target.value); if(!isNaN(n)&&n>=1){syms.current[i]={...sym,nx:n};repaint();}}}
                          onKeyDown={e => e.key==='Enter'&&(e.target as HTMLInputElement).blur()} />
                        <span style={{ margin:'0 2px' }}>×</span>
                        <input type="text" style={sinp} defaultValue={sym.ny}
                          onBlur={e => { const n=parseInt(e.target.value); if(!isNaN(n)&&n>=1){syms.current[i]={...sym,ny:n};repaint();}}}
                          onKeyDown={e => e.key==='Enter'&&(e.target as HTMLInputElement).blur()} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop:4 }}>
            <span style={tbtn} onClick={addSym}>+ add symmetry</span>
          </div>
        </div>

        {/* ── Canvas + mini palette ── */}
        <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
          <canvas ref={canvasRef} style={{ border:'0.5px solid gray', display:'block' }}
            onMouseDown={onCanvasDown} onMouseMove={onCanvasMove}
            onMouseUp={onCanvasUp} onMouseLeave={onCanvasLeave} />
          <div>
            {trans && (
              <div style={{
                width:20, height:20, margin:4, border: brush.current===-1?'0.5px solid white':'0.5px solid dimgrey',
                cursor:'default', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12,
              }} onClick={() => setBrush(-1)}>✕</div>
            )}
            {pal.current.map((c, i) => (
              <div key={i} style={{
                width:20, height:20, margin:4,
                backgroundColor: rgbText(c, trans),
                border: brush.current===i ? '0.5px solid white' : '0.5px solid dimgrey',
                cursor:'default',
              }} onClick={() => setBrush(i)} />
            ))}
          </div>
        </div>

        {/* ── Right: palette table ── */}
        <div style={{ width:180, flexShrink:0 }}>
          <table style={{ borderCollapse:'collapse', width:'100%', cursor:'default' }}>
            <tbody>
              {pal.current.map((c, i) => (
                <tr key={i}>
                  <td style={{ padding:4, borderRight:'0.5px solid grey' }}>
                    <div style={{
                      display:'inline-block', width:18, height:18, verticalAlign:'middle', marginRight:4,
                      backgroundColor: rgbText(c, trans),
                      border: brush.current===i ? '0.5px solid white' : '0.5px solid dimgrey',
                      cursor:'default',
                    }} onClick={e => openCp(e, i)} />
                    <span style={{ verticalAlign:'middle', fontSize:11 }}>{hexText(c, trans)}</span>
                  </td>
                  <td style={{ padding:4, borderLeft:'0.5px solid grey', textAlign:'center' }}>
                    <span style={btn} title="down"   onClick={() => moveColorDown(i)}>↓</span>
                    <span style={btn} title="up"     onClick={() => moveColorUp(i)}>↑</span>
                    <span style={btn} title="remove" onClick={() => removeColor(i)}>✕</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop:4 }}>
            <span style={tbtn} onClick={addColor}>+ add color</span>
          </div>
        </div>
      </div>

      {/* ── Color picker ── */}
      {cpOpen.current && (
        <div id="apax-cp" style={{
          position:'fixed', zIndex:100, background:'#111', border:'2px solid dimgrey',
          padding:6, fontFamily:"'Courier New'", fontSize:12,
          left: cpPos.current.x, top: cpPos.current.y,
        }}>
          <table style={{ borderSpacing:2, borderCollapse:'separate' }}>
            <tbody>
              {[sl0,sl1,sl2].map((ref, id) => (
                <tr key={id}><td>
                  <canvas ref={ref} width={255} height={20} style={{ display:'block', cursor:'crosshair' }}
                    onMouseDown={e => { cpDown.current=id; cpSliderUpdate(e,id); }}
                    onMouseMove={e => { if (cpDown.current===id) cpSliderUpdate(e,id); }}
                    onMouseUp={() => { cpDown.current=-1; }}
                    onMouseLeave={() => { cpDown.current=-1; }} />
                </td></tr>
              ))}
              {trans && (
                <tr><td>
                  <canvas ref={sl3} width={255} height={20} style={{ display:'block', cursor:'crosshair' }}
                    onMouseDown={e => { cpDown.current=3; cpSliderUpdate(e,3); }}
                    onMouseMove={e => { if (cpDown.current===3) cpSliderUpdate(e,3); }}
                    onMouseUp={() => { cpDown.current=-1; }}
                    onMouseLeave={() => { cpDown.current=-1; }} />
                </td></tr>
              )}
            </tbody>
          </table>
          <div style={{ display:'flex', gap:8, marginTop:4, alignItems:'center', flexWrap:'wrap' }}>
            <div>
              <span style={{ ...btn, color:cpMode.current==='rgb'?'white':'dimgray' }} onClick={() => cpSwitchMode('rgb')}>
                {trans?'rgba':'rgb'}
              </span>
              <span style={{ ...btn, color:cpMode.current==='hsv'?'white':'dimgray' }} onClick={() => cpSwitchMode('hsv')}>
                {trans?'hsva':'hsv'}
              </span>
            </div>
            <div style={{ display:'inline-block', width:40, height:20, backgroundColor:cpColor, border:'0.5px solid dimgrey', verticalAlign:'middle' }} />
            <span style={{ padding:'0 4px' }}>{hexText(cpRgb, trans)}</span>
            <span style={tbtn} onClick={cpOk}>ok</span>
            <span style={tbtn} onClick={cpCancel}>cancel</span>
          </div>
        </div>
      )}
    </div>
  );
}
