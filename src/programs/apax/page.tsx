"use client";

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';

// ─── data model ──────────────────────────────────────────────────────────────

interface Mp { width: number; height: number; transparency: boolean; }

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

type Tool = 'brush' | 'line' | 'rect' | 'ellipse' | 'fill' | 'pick' | 'pan';
type Pattern = 'solid' | 'checker' | 'hlines' | 'vlines' | 'dots';
type Pt = [number, number];
interface Layer { id: number; name: string; visible: boolean; st: PState; }

const TOOLS: [Tool, string, string][] = [
  ['brush', '✎', 'brush (drag to paint)'],
  ['line', '╱', 'line'],
  ['rect', '▭', 'rectangle'],
  ['ellipse', '◯', 'ellipse'],
  ['fill', '▧', 'flood fill'],
  ['pick', '⌖', 'pick colour (or alt-click)'],
  ['pan', '✋', 'pan (touch: two fingers always pan and zoom)'],
];
const PATTERNS: [Pattern, string][] = [['solid', 'solid'], ['checker', 'checker'], ['hlines', 'h-lines'], ['vlines', 'v-lines'], ['dots', 'dots']];
const MIN_ZOOM = 0.05, MAX_ZOOM = 96, MAX_UNDO = 30, MAX_DIM = 4096;

function patternHit(p: Pattern, x: number, y: number) {
  switch (p) {
    case 'checker': return ((x + y) & 1) === 0;
    case 'hlines':  return (y & 1) === 0;
    case 'vlines':  return (x & 1) === 0;
    case 'dots':    return (x & 1) === 0 && (y & 1) === 0;
    default:        return true;
  }
}

function bresenham(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  let [x0, y0] = a; const [x1, y1] = b;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

// ─── symmetry presets ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SymSpec = any;
const rot = (n: number): SymSpec => ({ type: 'rotate', n_sectors: n, ca: Math.cos(2 * Math.PI / n), sa: Math.sin(2 * Math.PI / n) });
const refl = (value: string): SymSpec => ({ type: 'reflect', value });
const tile = (nx: number, ny: number): SymSpec => ({ type: 'tile', nx, ny });

// ─── presets: a symmetry stack, a palette, and strokes drawn through them ──────

const hexRgb = (h: string): number[] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
type P2 = [number, number];
interface Stroke { c: number; size: number; round?: boolean; pts: P2[]; }
// space 'center': -1..1 around the image centre; 'abs': 0..1 across the image
interface Preset { name: string; w: number; h: number; space: 'center' | 'abs'; palette: number[][]; stack: SymSpec[]; strokes: Stroke[]; }

const curve = (n: number, f: (t: number) => P2): P2[] => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const TAU = Math.PI * 2;

const PRESETS: Preset[] = [
  { name: 'snowflake', w: 128, h: 128, space: 'center', stack: [rot(6), refl('|')],
    palette: ['#07122b', '#bfe6ff', '#ffffff', '#5aa9e6'].map(hexRgb),
    strokes: [
      { c: 1, size: 3, round: true, pts: [[0, -0.04], [0, -0.92]] },
      { c: 2, size: 2, pts: [[0, -0.3], [0.2, -0.5]] },
      { c: 2, size: 2, pts: [[0, -0.55], [0.28, -0.8]] },
      { c: 3, size: 2, pts: [[0, -0.78], [0.12, -0.9]] },
      { c: 3, size: 5, round: true, pts: [[0, -0.15]] },
    ] },
  { name: 'mandala', w: 128, h: 128, space: 'center', stack: [rot(8), refl('|')],
    palette: ['#0b0420', '#5b1fa0', '#a23ec7', '#e66fa0', '#ffc46b'].map(hexRgb),
    strokes: [
      { c: 3, size: 2, pts: curve(40, t => { const r = 0.15 + 0.75 * t, a = t * 0.9; return [r * Math.sin(a), -r * Math.cos(a)]; }) },
      { c: 2, size: 2, pts: curve(30, t => [0.16 * Math.sin(Math.PI * t), -0.3 - 0.4 * t]) },
      { c: 1, size: 3, pts: curve(20, t => { const a = t * 0.4; return [0.95 * Math.sin(a), -0.95 * Math.cos(a)]; }) },
      { c: 4, size: 6, round: true, pts: [[0, -0.85]] },
      { c: 4, size: 4, round: true, pts: [[0, -0.5]] },
    ] },
  { name: 'kaleidoscope', w: 128, h: 128, space: 'center', stack: [refl('|'), refl('-')],
    palette: ['#10002b', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff'].map(hexRgb),
    strokes: [
      { c: 1, size: 3, round: true, pts: curve(60, t => [0.05 + 0.9 * t, -0.1 - 0.5 * t + 0.12 * Math.sin(t * 14)]) },
      { c: 2, size: 2, pts: curve(50, t => { const a = t * Math.PI * 4, r = 0.05 + 0.3 * t; return [0.45 + r * Math.cos(a), -0.4 + r * Math.sin(a)]; }) },
      { c: 3, size: 2, pts: [[0.1, -0.8], [0.8, -0.15]] },
      { c: 4, size: 8, round: true, pts: [[0.2, -0.2]] },
    ] },
  { name: 'rosette', w: 128, h: 128, space: 'center', stack: [rot(3)],
    palette: ['#071a1a', '#2ec4b6', '#ffbf69', '#ff9f1c', '#cbf3f0'].map(hexRgb),
    strokes: [
      { c: 1, size: 2, pts: curve(160, t => { const a = t * TAU, r = 0.75 * Math.sin(3 * a); return [r * Math.cos(a), r * Math.sin(a)]; }) },
      { c: 2, size: 2, pts: curve(60, t => { const a = t * 5, r = 0.1 + 0.45 * t; return [0.1 + r * Math.cos(a), -0.2 + r * Math.sin(a)]; }) },
      { c: 4, size: 5, round: true, pts: [[0.6, 0.3]] },
    ] },
  { name: 'weave', w: 128, h: 128, space: 'center', stack: [refl('\\'), refl('/')],
    palette: ['#0d1b2a', '#e0fbfc', '#3d5a80', '#ee6c4d'].map(hexRgb),
    strokes: [
      { c: 1, size: 2, pts: curve(60, t => [-0.7 + 0.5 * t, -0.7 + 0.2 * Math.sin(t * 9) + 0.9 * t]) },
      { c: 2, size: 4, round: true, pts: curve(40, t => [-0.2 - 0.4 * t, -0.2 + 0.7 * t + 0.1 * Math.sin(t * 8)]) },
      { c: 3, size: 6, round: true, pts: [[-0.3, 0.55]] },
    ] },
  { name: 'tiles', w: 128, h: 128, space: 'abs', stack: [tile(4, 4)],
    palette: ['#1d1e2c', '#f4d35e', '#ee964b', '#f95738'].map(hexRgb),
    strokes: [
      { c: 1, size: 2, pts: curve(24, t => [0.04 + 0.17 * t, 0.12 + 0.07 * Math.sin(t * TAU)]) },
      { c: 2, size: 2, pts: [[0.03, 0.03], [0.1, 0.09]] },
      { c: 3, size: 5, round: true, pts: [[0.18, 0.05]] },
    ] },
  { name: 'mirrored tiles', w: 128, h: 128, space: 'abs', stack: [refl('|'), tile(3, 3)],
    palette: ['#14213d', '#fca311', '#e5e5e5', '#e63946'].map(hexRgb),
    strokes: [
      { c: 1, size: 2, pts: [[0.04, 0.28], [0.16, 0.04], [0.28, 0.28], [0.04, 0.28]] },
      { c: 3, size: 5, round: true, pts: [[0.16, 0.2]] },
      { c: 2, size: 2, pts: [[0.04, 0.04], [0.12, 0.12]] },
    ] },
  { name: 'pinwheel', w: 128, h: 128, space: 'center', stack: [rot(4)],
    palette: ['#1a1423', '#ff595e', '#ffca3a', '#8ac926', '#1982c4'].map(hexRgb),
    strokes: [
      { c: 1, size: 3, round: true, pts: curve(40, t => [0.05 + 0.55 * t, -0.05 - 0.6 * t + 0.25 * Math.sin(t * Math.PI)]) },
      { c: 2, size: 2, pts: curve(30, t => [0.2 + 0.5 * t, -0.7 + 0.1 * Math.sin(t * 6)]) },
      { c: 3, size: 6, round: true, pts: [[0.55, -0.55]] },
      { c: 4, size: 4, round: true, pts: [[0.1, -0.25]] },
    ] },
  { name: 'starburst', w: 128, h: 128, space: 'center', stack: [rot(12)],
    palette: ['#050505', '#ffd60a', '#ff7b00', '#ffffff'].map(hexRgb),
    strokes: [
      { c: 1, size: 2, pts: [[0, -0.1], [0, -0.9]] },
      { c: 2, size: 2, pts: [[0.05, -0.3], [0.13, -0.62]] },
      { c: 3, size: 4, round: true, pts: [[0, -0.95]] },
      { c: 3, size: 3, round: true, pts: [[0.1, -0.15]] },
    ] },
  { name: 'flower', w: 128, h: 128, space: 'center', stack: [rot(6), refl('|')],
    palette: ['#1b4332', '#f72585', '#ff9ec4', '#ffd166', '#52b788'].map(hexRgb),
    strokes: [
      { c: 4, size: 2, pts: curve(20, t => { const a = t * 0.5; return [0.95 * Math.sin(a), -0.95 * Math.cos(a)]; }) },
      { c: 1, size: 2, pts: curve(30, t => [0.28 * Math.sin(Math.PI * t) * (1 - 0.3 * t), -0.2 - 0.6 * t]) },
      { c: 2, size: 2, pts: curve(20, t => [0.14 * Math.sin(Math.PI * t), -0.3 - 0.35 * t]) },
      { c: 3, size: 9, round: true, pts: [[0, 0]] },
    ] },
  { name: 'triskelion', w: 128, h: 128, space: 'center', stack: [rot(3)],
    palette: ['#0f0e17', '#ff8906', '#f25f4c', '#e53170', '#a7a9be'].map(hexRgb),
    strokes: [
      { c: 1, size: 4, round: true, pts: curve(60, t => { const a = t * 3.2, r = 0.08 + 0.75 * t; return [r * Math.sin(a), -r * Math.cos(a)]; }) },
      { c: 2, size: 2, pts: curve(60, t => { const a = t * 3.2 + 0.25, r = 0.1 + 0.8 * t; return [r * Math.sin(a), -r * Math.cos(a)]; }) },
      { c: 3, size: 7, round: true, pts: [[0.55, 0.1]] },
    ] },
  { name: 'diamonds', w: 128, h: 128, space: 'center', stack: [refl('|'), refl('-')],
    palette: ['#10172a', '#00f5d4', '#f15bb5', '#fee440'].map(hexRgb),
    strokes: [
      { c: 1, size: 2, pts: [[0.02, -0.9], [0.45, -0.45], [0.02, -0.02]] },
      { c: 2, size: 2, pts: [[0.55, -0.9], [0.9, -0.55], [0.55, -0.2], [0.2, -0.55], [0.55, -0.9]] },
      { c: 3, size: 6, round: true, pts: [[0.55, -0.55]] },
    ] },
  { name: 'lattice', w: 128, h: 128, space: 'abs', stack: [tile(6, 6)],
    palette: ['#0b132b', '#5bc0be', '#3a506b', '#f4f1de'].map(hexRgb),
    strokes: [
      { c: 2, size: 1, pts: [[0.02, 0.083], [0.145, 0.083]] },
      { c: 2, size: 1, pts: [[0.083, 0.02], [0.083, 0.145]] },
      { c: 1, size: 1, pts: [[0.04, 0.04], [0.125, 0.125]] },
      { c: 3, size: 3, round: true, pts: [[0.083, 0.083]] },
    ] },
  { name: 'bricks', w: 128, h: 128, space: 'abs', stack: [tile(2, 4)],
    palette: ['#2b2d42', '#ef233c', '#edf2f4', '#8d99ae'].map(hexRgb),
    strokes: [
      { c: 1, size: 2, pts: [[0.02, 0.02], [0.48, 0.02], [0.48, 0.23], [0.02, 0.23], [0.02, 0.02]] },
      { c: 2, size: 2, pts: [[0.08, 0.08], [0.3, 0.08]] },
      { c: 3, size: 3, pts: [[0.08, 0.16], [0.4, 0.16]] },
    ] },
  { name: 'waves', w: 128, h: 128, space: 'abs', stack: [tile(1, 6)],
    palette: ['#03045e', '#0077b6', '#00b4d8', '#caf0f8'].map(hexRgb),
    strokes: [
      { c: 1, size: 3, round: true, pts: curve(80, t => [t, 0.083 + 0.05 * Math.sin(t * TAU * 3)]) },
      { c: 2, size: 2, pts: curve(80, t => [t, 0.083 + 0.05 * Math.sin(t * TAU * 3 + 0.8)]) },
      { c: 3, size: 1, pts: curve(80, t => [t, 0.083 + 0.05 * Math.sin(t * TAU * 3 + 1.6)]) },
    ] },
  { name: 'compass', w: 128, h: 128, space: 'center', stack: [rot(4), refl('|')],
    palette: ['#0a0908', '#c6ac8f', '#eae0d5', '#5e503f', '#c1121f'].map(hexRgb),
    strokes: [
      { c: 1, size: 3, pts: [[0, -0.05], [0, -0.95]] },
      { c: 3, size: 2, pts: [[0.05, -0.05], [0.4, -0.4]] },
      { c: 2, size: 1, pts: curve(24, t => { const a = t * 0.8; return [0.5 * Math.sin(a), -0.5 * Math.cos(a)]; }) },
      { c: 4, size: 5, round: true, pts: [[0, -0.95]] },
    ] },
  { name: 'spirograph', w: 128, h: 128, space: 'center', stack: [rot(5)],
    palette: ['#0d0221', '#00e5ff', '#ff2a6d', '#d1f7ff'].map(hexRgb),
    strokes: [
      { c: 1, size: 2, pts: curve(240, t => { const a = t * TAU; return [0.6 * Math.cos(a) + 0.3 * Math.cos(5 * a), 0.6 * Math.sin(a) - 0.3 * Math.sin(5 * a)]; }) },
      { c: 2, size: 1, pts: curve(60, t => { const a = t * TAU; return [0.25 * Math.cos(a), 0.25 * Math.sin(a) - 0.2]; }) },
    ] },
  { name: 'galaxy', w: 128, h: 128, space: 'center', stack: [rot(2)],
    palette: ['#03001e', '#7303c0', '#ec38bc', '#fdeff9', '#4cc9f0'].map(hexRgb),
    strokes: [
      { c: 2, size: 4, round: true, pts: curve(90, t => { const a = t * 5, r = 0.05 + 0.85 * t; return [r * Math.cos(a), r * Math.sin(a)]; }) },
      { c: 1, size: 2, pts: curve(90, t => { const a = t * 5 + 0.35, r = 0.05 + 0.85 * t; return [r * Math.cos(a), r * Math.sin(a)]; }) },
      { c: 3, size: 2, round: true, pts: [[0.5, 0.3]] },
      { c: 4, size: 2, round: true, pts: [[-0.2, 0.6]] },
      { c: 3, size: 8, round: true, pts: [[0, 0]] },
    ] },
  { name: 'moth', w: 128, h: 128, space: 'center', stack: [refl('|')],
    palette: ['#1b1208', '#6f4e37', '#c9a66b', '#f4e3b2', '#d62828'].map(hexRgb),
    strokes: [
      { c: 1, size: 3, round: true, pts: curve(40, t => [0.1 + 0.68 * Math.sin(Math.PI * t), -0.1 - 0.8 * t]) },
      { c: 2, size: 2, pts: curve(40, t => [0.1 + 0.5 * Math.sin(Math.PI * t), 0.1 + 0.7 * t]) },
      { c: 3, size: 10, round: true, pts: [[0.45, -0.45]] },
      { c: 4, size: 5, round: true, pts: [[0.45, -0.45]] },
      { c: 1, size: 4, round: true, pts: [[0, -0.4], [0, 0.5]] },
      { c: 2, size: 2, pts: [[0, -0.4], [0.12, -0.75]] },
    ] },
];

function randomStack(): SymSpec[] {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  for (;;) {
    const stack: SymSpec[] = []; let copies = 1;
    const len = 1 + Math.floor(Math.random() * 3);
    let hasTile = false;
    for (let i = 0; i < len; ++i) {
      const t = pick(['rotate', 'reflect', 'tile']);
      if (t === 'rotate') { const n = 2 + Math.floor(Math.random() * 7); stack.push(rot(n)); copies *= n; }
      else if (t === 'reflect') { stack.push(refl(pick(['|', '-', '\\', '/']))); copies *= 2; }
      else if (!hasTile) { const nx = 2 + Math.floor(Math.random() * 5), ny = 2 + Math.floor(Math.random() * 5); stack.push(tile(nx, ny)); copies *= nx * ny; hasTile = true; }
    }
    if (stack.length && copies <= 96) return stack;
  }
}

export default function Apax() {
  // mutable refs — drawing bypasses React
  const mp    = useRef<Mp>({ width: 256, height: 256, transparency: false });
  const pst   = useRef(new PState(mp.current));   // always the active layer's state
  const layers  = useRef<Layer[]>([{ id: 1, name: 'layer 1', visible: true, st: pst.current }]);
  const activeL = useRef(0);
  const nextId  = useRef(2);
  const backup  = useRef<ReturnType<typeof captureState> | null>(null);
  const comp    = useRef<HTMLCanvasElement | null>(null);   // composited image at 1 px per pixel
  const checker = useRef<CanvasPattern | null>(null);
  const pal   = useRef(grayscalePalette(4));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syms  = useRef<any[]>([{ type:'reflect', value:'|' }, { type:'tile', nx:4, ny:4 }]);
  const brush = useRef(3);

  // brush options
  const tool     = useRef<Tool>('brush');
  const bSize    = useRef(3);
  const bShape   = useRef<'square'|'circle'>('square');
  const bPattern = useRef<Pattern>('solid');
  const bFilled  = useRef(false);

  // view (zoom / pan)
  const view = useRef({ z: 1, x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const outlineRef  = useRef<HTMLDivElement>(null);
  const zoomLabel   = useRef<HTMLSpanElement>(null);
  const rootRef     = useRef<HTMLDivElement>(null);
  const lastPtr     = useRef<{ x: number; y: number } | null>(null);
  const spaceDown   = useRef(false);
  const panning     = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);

  // pixel buffer
  const buf = useRef<{ img: ImageData; u32: Uint32Array } | null>(null);
  const dirty = useRef<[number, number, number, number] | null>(null);

  // stroke state
  const drawing = useRef(false);
  const lastPt  = useRef<Pt | null>(null);
  const startPt = useRef<Pt | null>(null);
  const undoSt  = useRef<{ l: Layer; s: Int16Array }[]>([]);
  const redoSt  = useRef<{ l: Layer; s: Int16Array }[]>([]);

  const [height, setHeight] = useState(600);
  const [collapsed, setCollapsed] = useState({ l: false, r: false });
  const [isMobile, setIsMobile] = useState(false);
  const [open, setOpen] = useState({ l: false, r: false });   // phone layout: which sheet is showing

  // touch: one finger draws, two fingers pinch-zoom and pan
  const touches     = useRef(new Map<number, { x: number; y: number }>());
  const gesture     = useRef<{ d: number; mx: number; my: number; v: { z: number; x: number; y: number } } | null>(null);
  const gestureLock = useRef(false);   // true from the second finger down until all fingers lift

  // single counter drives all UI re-renders
  const [, setTick] = useState(0);
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

  // ── canvas buffer / rendering ───────────────────────────────────────────────

  const allocBuffer = useCallback(() => {
    const c = document.createElement('canvas');
    c.width = mp.current.width; c.height = mp.current.height;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const img = ctx.createImageData(c.width, c.height);
    comp.current = c;
    buf.current = { img, u32: new Uint32Array(img.data.buffer) };
  }, []);

  // source-over composite of every visible layer at one pixel, packed ABGR
  function compositePx(x: number, y: number): number {
    let pr = 0, pg = 0, pb = 0, a = 0;
    const p = pal.current;
    for (const L of layers.current) {
      if (!L.visible) continue;
      const v = L.st.data[x][y]; if (v === -1) continue;
      const c = p[v], ca = c[3] / 255;
      pr = c[0] * ca + pr * (1 - ca); pg = c[1] * ca + pg * (1 - ca); pb = c[2] * ca + pb * (1 - ca);
      a = ca + a * (1 - ca);
    }
    if (a <= 0) return 0;
    return (((Math.round(a * 255) << 24) | (Math.round(pb / a) << 16) | (Math.round(pg / a) << 8) | Math.round(pr / a)) >>> 0);
  }

  // paint the visible part of the composite onto the viewport canvas:
  // sharp pixels when magnifying, filtered when shrinking
  function draw() {
    const cnv = canvasRef.current, c = comp.current; if (!cnv || !c) return;
    const ctx = cnv.getContext('2d'); if (!ctx) return;
    const v = view.current, dpr = window.devicePixelRatio || 1;
    const vw = cnv.width / dpr, vh = cnv.height / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cnv.width, cnv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx0 = Math.max(0, Math.floor(-v.x / v.z)), sy0 = Math.max(0, Math.floor(-v.y / v.z));
    const sx1 = Math.min(c.width, Math.ceil((vw - v.x) / v.z)), sy1 = Math.min(c.height, Math.ceil((vh - v.y) / v.z));
    if (sx1 > sx0 && sy1 > sy0) {
      const dx = v.x + sx0 * v.z, dy = v.y + sy0 * v.z, dw = (sx1 - sx0) * v.z, dh = (sy1 - sy0) * v.z;
      if (!checker.current) {
        const t = document.createElement('canvas'); t.width = t.height = 16;
        const tc = t.getContext('2d')!;
        tc.fillStyle = '#444'; tc.fillRect(0, 0, 16, 16);
        tc.fillStyle = '#222'; tc.fillRect(0, 0, 8, 8); tc.fillRect(8, 8, 8, 8);
        checker.current = ctx.createPattern(t, 'repeat');
      }
      if (checker.current) { ctx.fillStyle = checker.current; ctx.fillRect(dx, dy, dw, dh); }
      ctx.imageSmoothingEnabled = v.z < 1;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(c, sx0, sy0, sx1 - sx0, sy1 - sy0, dx, dy, dw, dh);
    }
    ctx.strokeStyle = 'gray'; ctx.lineWidth = 1;
    ctx.strokeRect(v.x - 0.5, v.y - 0.5, c.width * v.z + 1, c.height * v.z + 1);
  }

  const renderImage = useCallback(() => {
    const c = comp.current, b = buf.current; if (!c || !b) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const w = mp.current.width, h = mp.current.height, u = b.u32;
    for (let i = 0; i < w; ++i)
      for (let j = 0; j < h; ++j) u[j * w + i] = compositePx(i, j);
    ctx.putImageData(b.img, 0, 0);
    dirty.current = null;
    draw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPx = useCallback((x: number, y: number, v: number) => {
    const s = pst.current;
    if (x < 0 || y < 0 || x >= s.width || y >= s.height) return;
    s.data[x][y] = v;
    const b = buf.current; if (!b) return;
    b.u32[y * s.width + x] = compositePx(x, y);
    const d = dirty.current;
    if (!d) dirty.current = [x, y, x, y];
    else { if (x < d[0]) d[0] = x; if (y < d[1]) d[1] = y; if (x > d[2]) d[2] = x; if (y > d[3]) d[3] = y; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = useCallback(() => {
    const c = comp.current, b = buf.current, d = dirty.current; if (!c || !b || !d) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.putImageData(b.img, 0, 0, d[0], d[1], d[2] - d[0] + 1, d[3] - d[1] + 1);
    dirty.current = null;
    draw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── view ────────────────────────────────────────────────────────────────────

  const applyView = useCallback(() => {
    const v = view.current;
    draw();
    if (zoomLabel.current) zoomLabel.current.textContent = `${Math.round(v.z * 100)}%`;
    updateOutline();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fitView = useCallback(() => {
    const vp = viewportRef.current; if (!vp) return;
    const w = mp.current.width, h = mp.current.height;
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(vp.clientWidth / w, vp.clientHeight / h) * 0.85));
    view.current = { z, x: (vp.clientWidth - w * z) / 2, y: (vp.clientHeight - h * z) / 2 };
    applyView();
  }, [applyView]);

  function zoomAt(mx: number, my: number, factor: number) {
    const v = view.current;
    const z2 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.z * factor));
    view.current = { z: z2, x: mx - (mx - v.x) * z2 / v.z, y: my - (my - v.y) * z2 / v.z };
    applyView();
  }
  function zoomCenter(factor: number) {
    const vp = viewportRef.current; if (!vp) return;
    zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, factor);
  }
  function zoomTo100() {
    const vp = viewportRef.current; if (!vp) return;
    const v = view.current, mx = vp.clientWidth / 2, my = vp.clientHeight / 2;
    view.current = { z: 1, x: mx - (mx - v.x) / v.z, y: my - (my - v.y) / v.z };
    applyView();
  }

  function updateOutline() {
    const o = outlineRef.current, vp = viewportRef.current, lp = lastPtr.current;
    if (!o || !vp) return;
    if (!lp || tool.current === 'pan') { o.style.display = 'none'; return; }
    const p = screenToImage(lp.x, lp.y);
    const s = pst.current;
    const sz = tool.current === 'brush' ? bSize.current : 1;
    const x0 = p[0] - Math.floor(sz / 2), y0 = p[1] - Math.floor(sz / 2);
    const v = view.current;
    if (p[0] < 0 || p[1] < 0 || p[0] >= s.width || p[1] >= s.height) { o.style.display = 'none'; return; }
    o.style.display = 'block';
    o.style.left = `${v.x + x0 * v.z}px`;
    o.style.top = `${v.y + y0 * v.z}px`;
    o.style.width = `${sz * v.z}px`;
    o.style.height = `${sz * v.z}px`;
    o.style.borderRadius = tool.current === 'brush' && bShape.current === 'circle' ? '50%' : '0';
  }

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

  useEffect(() => { if (cpOpen.current) drawAllSliders(); });

  // ── undo / redo ─────────────────────────────────────────────────────────────

  function snapshot(st: PState): Int16Array {
    const out = new Int16Array(st.width * st.height);
    for (let i = 0; i < st.width; ++i) { const col = st.data[i]; for (let j = 0; j < st.height; ++j) out[i * st.height + j] = col[j]; }
    return out;
  }
  function restore(st: PState, snap: Int16Array) {
    for (let i = 0; i < st.width; ++i) { const col = st.data[i]; for (let j = 0; j < st.height; ++j) col[j] = snap[i * st.height + j]; }
  }
  function pushUndo() {
    const l = layers.current[activeL.current];
    undoSt.current.push({ l, s: snapshot(l.st) });
    if (undoSt.current.length > MAX_UNDO) undoSt.current.shift();
    redoSt.current = [];
  }
  function clearHistory() { undoSt.current = []; redoSt.current = []; }
  function undo() {
    const e = undoSt.current.pop(); if (!e) return;
    redoSt.current.push({ l: e.l, s: snapshot(e.l.st) }); restore(e.l.st, e.s); renderImage(); repaint();
  }
  function redo() {
    const e = redoSt.current.pop(); if (!e) return;
    undoSt.current.push({ l: e.l, s: snapshot(e.l.st) }); restore(e.l.st, e.s); renderImage(); repaint();
  }

  // ── drawing primitives ──────────────────────────────────────────────────────

  function symPoints(p: Pt): Pt[] {
    let pts: Pt[] = [p];
    for (const sym of syms.current) {
      let pts2: Pt[] = [];
      for (const pt of pts) pts2 = pts2.concat(applySymmetry(sym, pt, pst.current));
      pts = pts2;
    }
    return pts;
  }

  function stamp(cx: number, cy: number, size: number, v: number, round: boolean, pattern: Pattern) {
    const x0 = cx - Math.floor(size / 2), y0 = cy - Math.floor(size / 2);
    const mid = (size - 1) / 2, r2 = (size / 2) * (size / 2);
    for (let dx = 0; dx < size; ++dx)
      for (let dy = 0; dy < size; ++dy) {
        if (round && (dx - mid) * (dx - mid) + (dy - mid) * (dy - mid) > r2) continue;
        const x = x0 + dx, y = y0 + dy;
        if (patternHit(pattern, x, y)) setPx(x, y, v);
      }
  }
  // plot one logical point through the symmetry stack
  function plot(p: Pt, size: number, v: number, round = bShape.current === 'circle', pattern = bPattern.current) {
    for (const c of symPoints(p)) stamp(c[0], c[1], size, v, round, pattern);
  }

  function shapePoints(kind: 'line'|'rect'|'ellipse', a: Pt, b: Pt, filled: boolean): { outline: Pt[]; fill: Pt[] } {
    const outline: Pt[] = [], fill: Pt[] = [];
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    if (kind === 'line') return { outline: bresenham(a, b), fill };
    if (kind === 'rect') {
      for (let x = x0; x <= x1; ++x) { outline.push([x, y0], [x, y1]); }
      for (let y = y0 + 1; y < y1; ++y) { outline.push([x0, y], [x1, y]); }
      if (filled) for (let x = x0 + 1; x < x1; ++x) for (let y = y0 + 1; y < y1; ++y) fill.push([x, y]);
      return { outline, fill };
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
    const n = Math.max(24, Math.ceil(6 * (rx + ry)));
    for (let k = 0; k < n; ++k) {
      const t = (k / n) * Math.PI * 2;
      outline.push([Math.round(cx + rx * Math.cos(t)), Math.round(cy + ry * Math.sin(t))]);
    }
    if (filled && ry > 0)
      for (let y = y0; y <= y1; ++y) {
        const k = 1 - ((y - cy) / ry) * ((y - cy) / ry);
        if (k < 0) continue;
        const hw = rx * Math.sqrt(k);
        for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); ++x) fill.push([x, y]);
      }
    return { outline, fill };
  }

  function drawShape(kind: 'line'|'rect'|'ellipse', a: Pt, b: Pt) {
    const { outline, fill } = shapePoints(kind, a, b, bFilled.current);
    const v = brush.current;
    for (const p of fill) plot(p, 1, v, false, 'solid');
    for (const p of outline) plot(p, bSize.current, v);
  }

  function floodFill(seed: Pt, v: number) {
    const s = pst.current, w = s.width, h = s.height;
    if (seed[0] < 0 || seed[1] < 0 || seed[0] >= w || seed[1] >= h) return;
    const target = s.data[seed[0]][seed[1]];
    if (target === v) return;
    const stack: number[] = [seed[0], seed[1]];
    while (stack.length) {
      const y = stack.pop()!, x = stack.pop()!;
      if (s.data[x][y] !== target) continue;
      let xl = x, xr = x;
      while (xl > 0 && s.data[xl - 1][y] === target) --xl;
      while (xr < w - 1 && s.data[xr + 1][y] === target) ++xr;
      for (let i = xl; i <= xr; ++i) {
        s.data[i][y] = v;
        for (const ny of [y - 1, y + 1])
          if (ny >= 0 && ny < h && s.data[i][ny] === target) {
            // only push the first pixel of each run to keep the stack small
            const prevSame = i > xl && s.data[i - 1][ny] === target;
            if (!prevSame) stack.push(i, ny);
          }
      }
    }
  }

  function screenToImage(cx: number, cy: number): Pt {
    const r = viewportRef.current!.getBoundingClientRect(), v = view.current;
    return [Math.floor((cx - r.left - v.x) / v.z), Math.floor((cy - r.top - v.y) / v.z)];
  }

  // ── pointer handling ────────────────────────────────────────────────────────

  function pickAt(p: Pt) {
    const s = pst.current;
    if (p[0] < 0 || p[1] < 0 || p[0] >= s.width || p[1] >= s.height) return;
    let v = s.data[p[0]][p[1]];
    if (v === -1 && !(mp.current.transparency || activeL.current > 0)) v = 0;
    brush.current = v; repaint();
  }

  function capture(el: HTMLElement, id: number) { try { el.setPointerCapture(id); } catch { /* pointer already gone */ } }

  function gestureStart() {
    const [a, b] = [...touches.current.values()];
    const r = viewportRef.current!.getBoundingClientRect();
    gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, v: { ...view.current } };
  }
  function gestureMove() {
    const g = gesture.current; if (!g || touches.current.size < 2) return;
    const [a, b] = [...touches.current.values()];
    const r = viewportRef.current!.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, g.v.z * Math.hypot(a.x - b.x, a.y - b.y) / g.d));
    view.current = { z, x: mx - ((g.mx - g.v.x) / g.v.z) * z, y: my - ((g.my - g.v.y) / g.v.z) * z };
    applyView();
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const vp = viewportRef.current!;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size >= 2) {
        // a second finger cancels the stroke the first one started
        if (drawing.current) {
          const en = undoSt.current.pop();
          if (en) { restore(en.l.st, en.s); renderImage(); }
          drawing.current = false;
        }
        panning.current = null; gestureLock.current = true;
        capture(vp, e.pointerId);
        if (touches.current.size === 2) gestureStart();
        return;
      }
      gestureLock.current = false;
    }
    if (e.button === 1 || e.button === 2 || (e.button === 0 && (spaceDown.current || tool.current === 'pan'))) {
      e.preventDefault();
      panning.current = { sx: e.clientX, sy: e.clientY, vx: view.current.x, vy: view.current.y };
      capture(vp, e.pointerId); return;
    }
    if (e.button !== 0) return;
    const p = screenToImage(e.clientX, e.clientY);
    if (e.altKey || tool.current === 'pick') { pickAt(p); return; }
    const s = pst.current;
    const inside = p[0] >= 0 && p[1] >= 0 && p[0] < s.width && p[1] < s.height;
    if (tool.current === 'fill' && !inside) return;
    capture(vp, e.pointerId);
    if (!layers.current[activeL.current].visible) return;
    pushUndo();
    drawing.current = true; startPt.current = p; lastPt.current = p;
    const v = brush.current;
    switch (tool.current) {
      case 'brush': plot(p, bSize.current, v); flush(); break;
      case 'fill':
        for (const c of symPoints(p)) floodFill(c, v);
        renderImage(); drawing.current = false; break;
      default: drawShape(tool.current as 'line'|'rect'|'ellipse', p, p); flush();
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'touch') {
      lastPtr.current = null;
      if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gestureLock.current) { gestureMove(); return; }
    } else {
      lastPtr.current = { x: e.clientX, y: e.clientY };
    }
    if (panning.current) {
      const pn = panning.current;
      view.current = { ...view.current, x: pn.vx + e.clientX - pn.sx, y: pn.vy + e.clientY - pn.sy };
      applyView(); return;
    }
    updateOutline();
    if (!drawing.current) return;
    const p = screenToImage(e.clientX, e.clientY);
    if (tool.current === 'brush') {
      const from = lastPt.current ?? p;
      for (const q of bresenham(from, p)) plot(q, bSize.current, brush.current);
      lastPt.current = p; flush();
    } else if (tool.current === 'line' || tool.current === 'rect' || tool.current === 'ellipse') {
      const base = undoSt.current[undoSt.current.length - 1];
      if (base && startPt.current) {
        restore(base.l.st, base.s); drawShape(tool.current, startPt.current, p); renderImage();
      }
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    try { viewportRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (touches.current.size === 2) gestureStart(); else gesture.current = null;
      if (touches.current.size === 0) { const wasPinch = gestureLock.current; gestureLock.current = false; if (wasPinch) { panning.current = null; return; } }
      else if (gestureLock.current) return;
    }
    panning.current = null; drawing.current = false;
    flush();
  }
  function onPointerLeave(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'touch') return;
    lastPtr.current = null; updateOutline();
  }

  // wheel zoom needs a non-passive listener to preventDefault
  useEffect(() => {
    const vp = viewportRef.current; if (!vp) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    vp.addEventListener('wheel', h, { passive: false });
    return () => vp.removeEventListener('wheel', h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.code === 'Space') { spaceDown.current = true; e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '[') { bSize.current = Math.max(1, bSize.current - 1); repaint(); updateOutline(); }
      else if (e.key === ']') { bSize.current = Math.min(256, bSize.current + 1); repaint(); updateOutline(); }
      else if (e.key === 'f') fitView();
      else {
        const k: Record<string, Tool> = { b:'brush', l:'line', r:'rect', o:'ellipse', g:'fill', i:'pick', h:'pan' };
        if (k[e.key]) { tool.current = k[e.key]; repaint(); updateOutline(); }
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── settings ────────────────────────────────────────────────────────────────

  function applySettings(newMp: Mp) {
    newMp = { ...newMp, width: Math.min(MAX_DIM, newMp.width), height: Math.min(MAX_DIM, newMp.height) };
    mp.current = newMp;
    layers.current.forEach((L, k) => L.st.adjustSize(k === 0 ? newMp : { ...newMp, transparency: true }));
    clearHistory(); allocBuffer(); renderImage(); fitView(); repaint();
  }

  function toggleTransparency() {
    const t = !mp.current.transparency; mp.current = { ...mp.current, transparency: t };
    if (!t) {
      for (const c of pal.current) c[3] = 255;
      const s = layers.current[0].st;
      for (let i = 0; i < s.width; ++i)
        for (let j = 0; j < s.height; ++j)
          if (s.data[i][j] === -1) s.data[i][j] = 0;
      if (brush.current === -1 && activeL.current === 0) brush.current = 0;
    }
    clearHistory(); repaint(); renderImage();
  }

  function clearImage() {
    pushUndo();
    const v = (mp.current.transparency || activeL.current > 0) ? -1 : 0, s = pst.current;
    for (let i = 0; i < s.width; ++i) for (let j = 0; j < s.height; ++j) s.data[i][j] = v;
    renderImage(); repaint();
  }

  function saveImage() {
    const c = comp.current; if (!c) return;
    c.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'apax.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  // ── palette ─────────────────────────────────────────────────────────────────

  function addColor()        { pal.current.push([0,0,0,255]); repaint(); }
  function removeColor(i: number) {
    if (pal.current.length <= 1) return;
    clearHistory();
    pal.current.splice(i, 1);
    // pixels above the removed index shift down by one
    layers.current.forEach((L, k) => {
      const s = L.st, blank = (k === 0 && !mp.current.transparency) ? 0 : -1;
      for (let x = 0; x < s.width; ++x) for (let y = 0; y < s.height; ++y) {
        const v = s.data[x][y];
        if (v === i) s.data[x][y] = blank; else if (v > i) s.data[x][y] = v - 1;
      }
    });
    if (brush.current === i) brush.current = 0; else if (brush.current > i) brush.current--;
    repaint(); renderImage();
  }
  function moveColorUp(i: number) {
    if (i <= 0) return;
    [pal.current[i], pal.current[i-1]] = [pal.current[i-1], pal.current[i]];
    layers.current.forEach(L => L.st.swapColors(i, i-1)); clearHistory();
    if (brush.current===i) brush.current=i-1; else if (brush.current===i-1) brush.current=i;
    repaint(); renderImage();
  }
  function moveColorDown(i: number) {
    if (i >= pal.current.length-1) return;
    [pal.current[i], pal.current[i+1]] = [pal.current[i+1], pal.current[i]];
    layers.current.forEach(L => L.st.swapColors(i, i+1)); clearHistory();
    if (brush.current===i) brush.current=i+1; else if (brush.current===i+1) brush.current=i;
    repaint(); renderImage();
  }
  function setBrush(v: number) { brush.current = v; repaint(); }

  // ── layers ──────────────────────────────────────────────────────────────────

  function setActive(i: number) {
    activeL.current = i; pst.current = layers.current[i].st;
    if (brush.current === -1 && i === 0 && !mp.current.transparency) brush.current = 0;
    repaint(); updateOutline();
  }
  function addLayer() {
    const L: Layer = { id: nextId.current, name: `layer ${nextId.current}`, visible: true, st: new PState({ ...mp.current, transparency: true }) };
    nextId.current++;
    layers.current.splice(activeL.current + 1, 0, L);
    clearHistory(); setActive(activeL.current + 1); renderImage();
  }
  function deleteLayer(i: number) {
    if (layers.current.length <= 1) return;
    const a = activeL.current;
    layers.current.splice(i, 1); clearHistory();
    setActive(Math.max(0, Math.min(layers.current.length - 1, a > i ? a - 1 : a === i ? Math.max(0, i - 1) : a)));
    renderImage();
  }
  function toggleLayer(i: number) { layers.current[i].visible = !layers.current[i].visible; renderImage(); repaint(); }
  function moveLayer(i: number, d: number) {
    const j = i + d, ls = layers.current; if (j < 0 || j >= ls.length) return;
    [ls[i], ls[j]] = [ls[j], ls[i]];
    const a = activeL.current;
    activeL.current = a === i ? j : a === j ? i : a;
    renderImage(); repaint();
  }

  // ── symmetry ─────────────────────────────────────────────────────────────────

  function captureState() {
    return { mp: mp.current, layers: layers.current, active: activeL.current, pal: pal.current, syms: syms.current };
  }
  function applyState(b: ReturnType<typeof captureState>) {
    mp.current = b.mp; layers.current = b.layers; activeL.current = b.active; pst.current = b.layers[b.active].st;
    pal.current = b.pal; syms.current = b.syms;
    brush.current = Math.min(brush.current, pal.current.length - 1);
    clearHistory(); allocBuffer(); renderImage(); fitView(); repaint();
  }
  // swap the image you had before the last preset load back in (and vice versa)
  function swapBack() {
    if (!backup.current) return;
    const cur = captureState(); applyState(backup.current); backup.current = cur;
  }
  function loadPreset(pr: Preset) {
    backup.current = captureState();
    mp.current = { width: pr.w, height: pr.h, transparency: false };
    const st = new PState(mp.current);
    layers.current = [{ id: nextId.current++, name: 'layer 1', visible: true, st }];
    activeL.current = 0; pst.current = st;
    pal.current = pr.palette.map(c => c.slice());
    brush.current = Math.min(1, pal.current.length - 1);
    syms.current = pr.stack.map(x => ({ ...x }));
    allocBuffer();
    for (const sk of pr.strokes) {
      const pts = sk.pts.map(([x, y]): Pt => pr.space === 'abs'
        ? [Math.round(x * pr.w), Math.round(y * pr.h)]
        : [Math.round(pr.w / 2 + x * pr.w / 2), Math.round(pr.h / 2 + y * pr.h / 2)]);
      pts.forEach((q, i) => {
        for (const r of i ? bresenham(pts[i - 1], q) : [q]) plot(r, sk.size, sk.c, !!sk.round, 'solid');
      });
    }
    clearHistory(); renderImage(); fitView(); repaint();
  }
  function rollSymmetry() { syms.current = randomStack(); repaint(); }
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
    cpPos.current = isMobile
      ? { x: Math.max(0, (window.innerWidth - 280) / 2), y: Math.max(8, window.innerHeight / 2 - 100) }
      : { x: Math.max(0, e.clientX-280), y: Math.min(e.clientY, window.innerHeight - 160) };
    brush.current = i; cpFirst.current = true; cpOpen.current = true;
    repaint();
  }
  function cpOk() {
    pal.current[cpIdx.current] = toRGB(cpVals.current, cpMode.current);
    cpOpen.current = false; repaint(); renderImage();
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

  // phone layout below 720px wide
  useEffect(() => {
    const m = window.matchMedia('(max-width: 720px)');
    const f = () => setIsMobile(m.matches);
    f(); m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);

  // fill the space below the site header
  useLayoutEffect(() => {
    const measure = () => {
      const top = rootRef.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(320, window.innerHeight - top));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // keep the viewport canvas matched to its size in device pixels
  useEffect(() => {
    const vp = viewportRef.current, cnv = canvasRef.current; if (!vp || !cnv) return;
    const sync = () => {
      const dpr = window.devicePixelRatio || 1;
      cnv.width = Math.max(1, Math.round(vp.clientWidth * dpr));
      cnv.height = Math.max(1, Math.round(vp.clientHeight * dpr));
      draw();
    };
    sync();
    const ro = new ResizeObserver(sync); ro.observe(vp);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // initial mount
  useEffect(() => {
    allocBuffer(); renderImage(); fitView();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── styles ──────────────────────────────────────────────────────────────────

  const btn: React.CSSProperties = { paddingLeft:isMobile?8:4, paddingRight:isMobile?8:4, paddingTop:isMobile?6:0, paddingBottom:isMobile?6:0, cursor:'default', display:'inline-block', verticalAlign:'middle' };
  const tbtn: React.CSSProperties = { border:'0.5px solid dimgray', cursor:'default', padding:isMobile?'8px 10px':4, display:'inline-block', verticalAlign:'middle', userSelect:'none' };
  const inp: React.CSSProperties = { backgroundColor:'black', color:'white', border:'0.5px solid dimgrey', padding:isMobile?6:2, fontFamily:"'Courier New'", width:56, fontSize:isMobile?16:undefined };
  const sinp: React.CSSProperties = { ...inp, width:isMobile?36:26, textAlign:'center' };
  const panel: React.CSSProperties = {
    position:'absolute', top:12, width:236, maxHeight:'calc(100% - 24px)', overflowY:'auto', zIndex:10,
    background:'rgba(10,10,10,0.88)', border:'0.5px solid gray', padding:8, backdropFilter:'blur(4px)', boxSizing:'border-box',
  };
  const heading: React.CSSProperties = { borderBottom:'0.5px solid gray', marginBottom:6, marginTop:10, display:'flex', justifyContent:'space-between' };
  const on = (b: boolean): React.CSSProperties => ({ color: b ? 'white' : 'dimgray', borderColor: b ? 'white' : 'dimgray' });
  const trans = mp.current.transparency;
  const cpRgb = toRGB(cpVals.current, cpMode.current);
  const cpColor = rgbText(cpRgb, trans);
  const curTool = tool.current;
  const toggleBtn = (side: 'l'|'r') => isMobile ? (
    <span style={{ ...btn, cursor:'pointer' }} onClick={() => setOpen({ l: false, r: false })}>✕</span>
  ) : (
    <span style={{ ...btn, cursor:'pointer' }} onClick={() => setCollapsed(c => ({ ...c, [side]: !c[side] }))}>
      {collapsed[side] ? '▸' : '▾'}
    </span>
  );
  // phone: panels become sheets above a bottom bar; desktop: floating panels
  const sheet: React.CSSProperties = { top:'auto', bottom:60, left:8, right:8, width:'auto', maxHeight:'55%' };
  const leftStyle: React.CSSProperties = isMobile ? { ...panel, ...sheet, display: open.l ? 'block' : 'none' } : { ...panel, left:12 };
  const rightStyle: React.CSSProperties = isMobile ? { ...panel, ...sheet, display: open.r ? 'block' : 'none' } : { ...panel, right:12 };
  const floatBtn: React.CSSProperties = { ...tbtn, background:'rgba(10,10,10,0.88)', fontSize:16, minWidth:20, textAlign:'center', cursor:'pointer' };
  const collapsedL = !isMobile && collapsed.l, collapsedR = !isMobile && collapsed.r;

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <div ref={rootRef} style={{ fontFamily:"'Courier New'", fontSize:14, color:'lightgrey', position:'relative', height, overflow:'hidden' }}>

      {/* ── Canvas viewport (wheel = zoom, middle/right drag or space+drag = pan) ── */}
      <div ref={viewportRef}
        style={{ position:'absolute', inset:0, background:'#0a0a0a', overflow:'hidden', touchAction:'none', cursor: curTool==='pan' ? 'grab' : 'crosshair', userSelect:'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp} onPointerLeave={onPointerLeave} onContextMenu={e => e.preventDefault()}>
        <canvas ref={canvasRef} style={{ position:'absolute', left:0, top:0, width:'100%', height:'100%', display:'block' }} />
        <div ref={outlineRef} style={{ position:'absolute', display:'none', pointerEvents:'none', border:'1px solid white', mixBlendMode:'difference', boxSizing:'border-box' }} />
      </div>

      {/* ── Left panel ── */}
      <div style={leftStyle}>
        <div style={{ ...heading, marginTop:0 }}>image settings {toggleBtn('l')}</div>
        {!collapsedL && (<>
          <table style={{ borderCollapse:'collapse' }}>
            <tbody>
              {([['width',mp.current.width,'width'],['height',mp.current.height,'height']] as [string,number,string][]).map(([label,val,key]) => (
                <tr key={key + val}>
                  <td style={{ textAlign:'right', padding:4 }}>{label}</td>
                  <td style={{ padding:4 }}>
                    <input type="text" defaultValue={val} style={inp}
                      onBlur={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n>0 && n !== val) applySettings({...mp.current,[key]:n}); }}
                      onKeyDown={e => e.key==='Enter' && (e.target as HTMLInputElement).blur()} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop:6, display:'flex', gap:6, flexWrap:'wrap' }}>
            <span style={tbtn} onClick={clearImage}>clear</span>
            <span style={tbtn} onClick={saveImage}>save png</span>
            <span style={tbtn} onClick={undo} title="ctrl+z">undo</span>
            <span style={tbtn} onClick={redo} title="ctrl+shift+z">redo</span>
          </div>
          <div style={{ marginTop:6 }}>
            <span style={tbtn} onClick={toggleTransparency}>
              {trans ? 'disable transparency' : 'enable transparency'}
            </span>
          </div>

          <div style={heading}>presets</div>
          <select value="" style={{ ...inp, width:'100%' }} onChange={e => { const pr = PRESETS.find(x => x.name === e.target.value); if (pr) loadPreset(pr); }}>
            <option value="">choose a preset…</option>
            {PRESETS.map(pr => <option key={pr.name} value={pr.name}>{pr.name}</option>)}
          </select>
          {backup.current && (
            <div style={{ marginTop:4 }}>
              <span style={{ ...tbtn, fontSize:12, cursor:'pointer' }} onClick={swapBack}>↶ swap back to previous image</span>
            </div>
          )}

          <div style={heading}>layers <span style={{ ...btn, cursor:'pointer' }} onClick={addLayer}>+ new</span></div>
          {layers.current.map((L, i) => [L, i] as [Layer, number]).reverse().map(([L, i]) => (
            <div key={L.id} style={{ display:'flex', alignItems:'center', gap:2, padding:'2px 4px', marginBottom:2,
              background: i===activeL.current ? '#333' : 'transparent', border: i===activeL.current ? '0.5px solid gray' : '0.5px solid transparent' }}>
              <span style={{ ...btn, cursor:'pointer' }} title={L.visible ? 'hide' : 'show'} onClick={() => toggleLayer(i)}>{L.visible ? '◉' : '○'}</span>
              <span style={{ flex:1, minWidth:0, cursor:'pointer', color: L.visible ? 'white' : 'dimgray', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                onClick={() => setActive(i)}>{L.name}</span>
              <span style={{ ...btn, cursor:'pointer' }} title="move up" onClick={() => moveLayer(i, 1)}>▲</span>
              <span style={{ ...btn, cursor:'pointer' }} title="move down" onClick={() => moveLayer(i, -1)}>▼</span>
              <span style={{ ...btn, cursor:'pointer', color: layers.current.length > 1 ? 'lightgrey' : '#444' }} title="delete" onClick={() => deleteLayer(i)}>✕</span>
            </div>
          ))}

          <div style={heading}>view <span ref={zoomLabel}>100%</span></div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <span style={tbtn} onClick={() => zoomCenter(1/1.5)}>−</span>
            <span style={tbtn} onClick={() => zoomCenter(1.5)}>+</span>
            <span style={tbtn} onClick={zoomTo100}>1:1</span>
            <span style={tbtn} onClick={fitView} title="f">fit</span>
          </div>
          <div style={{ fontSize:11, marginTop:4, color:'dimgray' }}>
            scroll to zoom · right/middle-drag or space-drag to pan · alt-click picks colour
          </div>

          <div style={heading}>
            symmetry stack
            <span style={{ ...btn, cursor:'pointer', fontSize:16, lineHeight:1 }} title="random symmetry stack" onClick={rollSymmetry}>🎲</span>
          </div>
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
        </>)}
      </div>

      {/* ── Right panel: brush + palette ── */}
      <div style={rightStyle}>
        <div style={{ ...heading, marginTop:0 }}>brush {toggleBtn('r')}</div>
        {!collapsedR && (<>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {TOOLS.map(([id, icon, tip]) => (
              <span key={id} style={{ ...tbtn, minWidth:18, textAlign:'center', ...on(curTool===id) }} title={tip}
                onClick={() => { tool.current = id; repaint(); updateOutline(); }}>{icon}</span>
            ))}
          </div>
          <div style={{ fontSize:11, color:'dimgray', marginTop:2 }}>{curTool}</div>

          <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:6 }}>
            <span>size</span>
            <input type="range" min={1} max={128} value={Math.min(bSize.current,128)} style={{ flex:1, minWidth:0 }}
              onChange={e => { bSize.current = parseInt(e.target.value); repaint(); updateOutline(); }} />
            <input type="text" style={{ ...sinp, width:36 }} value={bSize.current}
              onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n>=1) { bSize.current = Math.min(256, n); repaint(); updateOutline(); } }} />
          </div>

          <div style={{ marginTop:8 }}>
            <span style={{ marginRight:6 }}>shape</span>
            <span style={{ ...tbtn, ...on(bShape.current==='square') }} onClick={() => { bShape.current='square'; repaint(); updateOutline(); }}>■</span>{' '}
            <span style={{ ...tbtn, ...on(bShape.current==='circle') }} onClick={() => { bShape.current='circle'; repaint(); updateOutline(); }}>●</span>
          </div>

          <div style={{ marginTop:8 }}>
            <div style={{ marginBottom:2 }}>pattern</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {PATTERNS.map(([id, label]) => (
                <span key={id} style={{ ...tbtn, fontSize:11, ...on(bPattern.current===id) }}
                  onClick={() => { bPattern.current = id; repaint(); }}>{label}</span>
              ))}
            </div>
          </div>

          {(curTool==='rect' || curTool==='ellipse') && (
            <div style={{ marginTop:8 }}>
              <span style={{ ...tbtn, ...on(bFilled.current) }} onClick={() => { bFilled.current = !bFilled.current; repaint(); }}>
                {bFilled.current ? '■ filled' : '□ outline'}
              </span>
            </div>
          )}
          <div style={{ fontSize:11, marginTop:6, color:'dimgray' }}>keys: b l r o g i · [ ] size</div>

          <div style={heading}>palette</div>
          {(trans || activeL.current > 0) && (
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'2px 4px' }}>
              <div style={{
                width:18, height:18, border: brush.current===-1?'0.5px solid white':'0.5px solid dimgrey',
                cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12,
              }} onClick={() => setBrush(-1)}>✕</div>
              <span style={{ fontSize:11 }}>erase</span>
            </div>
          )}
          <table style={{ borderCollapse:'collapse', width:'100%', cursor:'default' }}>
            <tbody>
              {pal.current.map((c, i) => (
                <tr key={i}>
                  <td style={{ padding:4, borderRight:'0.5px solid grey', whiteSpace:'nowrap' }}>
                    <div style={{
                      display:'inline-block', width:18, height:18, verticalAlign:'middle', marginRight:4,
                      backgroundColor: rgbText(c, trans),
                      border: brush.current===i ? '1px solid white' : '0.5px solid dimgrey',
                      cursor:'pointer',
                    }} onClick={() => setBrush(i)} />
                    <span style={{ verticalAlign:'middle', fontSize:11, cursor:'pointer' }} title="edit colour"
                      onClick={e => openCp(e, i)}>{hexText(c, trans)}</span>
                  </td>
                  <td style={{ padding:4, borderLeft:'0.5px solid grey', textAlign:'center', whiteSpace:'nowrap' }}>
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
        </>)}
      </div>

      {/* ── Phone controls ── */}
      {isMobile && (<>
        <div style={{ position:'absolute', top:8, left:8, right:8, display:'flex', justifyContent:'space-between', alignItems:'center', zIndex:11, pointerEvents:'none' }}>
          <span style={{ ...floatBtn, pointerEvents:'auto' }} onClick={() => setOpen(o => ({ l: !o.l, r: false }))}>☰</span>
          <span style={{ display:'flex', gap:6, pointerEvents:'auto' }}>
            <span style={floatBtn} onClick={undo}>↶</span>
            <span style={floatBtn} onClick={redo}>↷</span>
            <span style={floatBtn} onClick={fitView}>fit</span>
          </span>
          <span style={{ ...floatBtn, pointerEvents:'auto' }} onClick={() => setOpen(o => ({ l: false, r: !o.r }))}>✎</span>
        </div>
        <div style={{ position:'absolute', left:8, right:8, bottom:8, zIndex:11, display:'flex', gap:6, overflowX:'auto', alignItems:'center',
          background:'rgba(10,10,10,0.88)', border:'0.5px solid gray', padding:6, touchAction:'pan-x' }}>
          {TOOLS.map(([id, icon]) => (
            <span key={id} style={{ ...tbtn, minWidth:20, textAlign:'center', flexShrink:0, fontSize:16, ...on(curTool===id) }}
              onClick={() => { tool.current = id; repaint(); }}>{icon}</span>
          ))}
          <span style={{ width:1, alignSelf:'stretch', background:'gray', flexShrink:0 }} />
          {(trans || activeL.current > 0) && (
            <span style={{ width:32, height:32, flexShrink:0, border: brush.current===-1 ? '1px solid white' : '0.5px solid dimgrey',
              display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setBrush(-1)}>✕</span>
          )}
          {pal.current.map((c, i) => (
            <span key={i} style={{ width:32, height:32, flexShrink:0, backgroundColor: rgbText(c, trans),
              border: brush.current===i ? '2px solid white' : '0.5px solid dimgrey', boxSizing:'border-box' }} onClick={() => setBrush(i)} />
          ))}
        </div>
      </>)}

      {/* ── Color picker ── */}
      {cpOpen.current && (
        <div id="apax-cp" style={{
          position:'fixed', zIndex:100, background:'#111', border:'2px solid dimgrey',
          padding:6, fontFamily:"'Courier New'", fontSize:12, userSelect:'none',
          left: cpPos.current.x, top: cpPos.current.y,
        }}>
          <table style={{ borderSpacing:2, borderCollapse:'separate' }}>
            <tbody>
              {[sl0,sl1,sl2].map((ref, id) => (
                <tr key={id}><td>
                  <canvas ref={ref} width={255} height={20} style={{ display:'block', cursor:'crosshair', touchAction:'none', maxWidth:'100%' }}
                    onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); cpDown.current=id; cpSliderUpdate(e,id); }} onDragStart={e => e.preventDefault()} draggable={false}
                    onPointerMove={e => { if (cpDown.current===id) cpSliderUpdate(e,id); }}
                    onPointerUp={() => { cpDown.current=-1; }}
                    onPointerCancel={() => { cpDown.current=-1; }} />
                </td></tr>
              ))}
              {trans && (
                <tr><td>
                  <canvas ref={sl3} width={255} height={20} style={{ display:'block', cursor:'crosshair', touchAction:'none', maxWidth:'100%' }}
                    onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); cpDown.current=3; cpSliderUpdate(e,3); }} onDragStart={e => e.preventDefault()} draggable={false}
                    onPointerMove={e => { if (cpDown.current===3) cpSliderUpdate(e,3); }}
                    onPointerUp={() => { cpDown.current=-1; }}
                    onPointerCancel={() => { cpDown.current=-1; }} />
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
