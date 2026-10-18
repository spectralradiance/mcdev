// Draws an ArrayPlayer in one of several styles. Highlights fade out through the player's heat array.

import { Hl, type ArrayPlayer } from './trace';
import { COLORS } from './ui';

export type ArrayStyle = 'bars' | 'rainbow' | 'dots' | 'disc' | 'polar' | 'pyramid';

export const ARRAY_STYLES: { id: ArrayStyle; name: string }[] = [
  { id: 'bars', name: 'Bars' },
  { id: 'rainbow', name: 'Rainbow bars' },
  { id: 'dots', name: 'Scatter' },
  { id: 'disc', name: 'Colour wheel' },
  { id: 'polar', name: 'Spiral' },
  { id: 'pyramid', name: 'Mirrored' },
];

const HL_COLOR: Record<number, string> = {
  [Hl.Compare]: COLORS.compare,
  [Hl.Swap]: COLORS.swap,
  [Hl.Write]: COLORS.write,
  [Hl.Read]: COLORS.read,
  [Hl.Found]: COLORS.found,
};

export type DrawOptions = {
  style: ArrayStyle;
  /** Index the finishing sweep has reached (-1 = none). */
  sweep: number;
  /** Horizontal line for a search target, as a value. */
  target?: number;
  max: number;
  showRange: boolean;
};

const valueHue = (t: number) => `hsl(${Math.round(t * 330)}, 90%, 60%)`;

export function drawArray(ctx: CanvasRenderingContext2D, p: ArrayPlayer, w: number, h: number, o: DrawOptions) {
  const v = p.values, n = v.length, max = o.max || 1;
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, w, h);
  if (!n) return;

  // Coloured styles already use hue for value, so their highlights are white.
  const mono = o.style === 'bars' || o.style === 'pyramid';
  const hlColour = (i: number) => (mono ? HL_COLOR[p.kind[i]] ?? COLORS.bar : '#ffffff');
  const colourOf = (i: number) => {
    const heat = p.heat[i];
    if (i <= o.sweep) return COLORS.done;
    if (heat > 0.35) return hlColour(i);
    if (mono) {
      if (p.found === i) return COLORS.found;
      return p.done[i] ? '#6ee7b7' : COLORS.bar;
    }
    return valueHue(v[i] / max);
  };
  const outside = (i: number) => o.showRange && !p.finished && (i < p.lo || i > p.hi);

  if (o.style === 'disc' || o.style === 'polar') {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 8;
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i * step;
      ctx.globalAlpha = outside(i) ? 0.5 : 1;
      ctx.fillStyle = colourOf(i);
      if (o.style === 'disc') {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a0 + step * 1.02 + 0.002);
        ctx.closePath();
        ctx.fill();
      } else {
        const r = (v[i] / max) * R, x = cx + Math.cos(a0) * r, y = cy + Math.sin(a0) * r;
        const s = Math.max(2, Math.min(6, 600 / n)) * (p.heat[i] > 0.35 ? 1.8 : 1);
        ctx.beginPath();
        ctx.arc(x, y, s / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (p.pivot >= 0 && p.pivot < n) {
      const a = -Math.PI / 2 + (p.pivot + 0.5) * step;
      ctx.strokeStyle = COLORS.pivot;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * (R + 6), cy + Math.sin(a) * (R + 6));
      ctx.stroke();
    }
    if (o.target !== undefined) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, (o.target / max) * R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    return;
  }

  const top = 6, bottom = 6, ph = h - top - bottom;
  const bw = w / n;
  const gap = bw > 4 ? Math.min(2, bw * 0.15) : 0;
  for (let i = 0; i < n; i++) {
    const t = v[i] / max;
    const x = i * bw;
    ctx.globalAlpha = outside(i) ? (mono ? 0.22 : 0.4) : 1;
    ctx.fillStyle = colourOf(i);
    if (o.style === 'dots') {
      const s = Math.max(2, Math.min(8, bw));
      ctx.fillRect(x + bw / 2 - s / 2, top + ph - t * ph - s / 2, s, s);
    } else if (o.style === 'pyramid') {
      const bh = Math.max(1, t * ph);
      ctx.fillRect(x, top + (ph - bh) / 2, Math.max(1, bw - gap), bh);
    } else {
      const bh = Math.max(1, t * ph);
      ctx.fillRect(x, top + ph - bh, Math.max(1, bw - gap), bh);
    }
  }
  ctx.globalAlpha = 1;

  // Overlay: brighten hot bars a little more so fast ops still read at high n.
  if (o.style !== 'dots') {
    for (let i = 0; i < n; i++) {
      const heat = p.heat[i];
      if (heat <= 0.08 || heat > 0.35) continue;
      ctx.globalAlpha = heat * 1.2;
      ctx.fillStyle = hlColour(i);
      const t = v[i] / max, bh = Math.max(1, t * ph);
      const y = o.style === 'pyramid' ? top + (ph - bh) / 2 : top + ph - bh;
      ctx.fillRect(i * bw, y, Math.max(1, bw - gap), bh);
    }
    ctx.globalAlpha = 1;
  }

  if (p.pivot >= 0 && p.pivot < n) {
    ctx.fillStyle = COLORS.pivot;
    const x = p.pivot * bw + bw / 2;
    ctx.beginPath();
    ctx.moveTo(x, h - 1);
    ctx.lineTo(x - 5, h + 0 - 7);
    ctx.lineTo(x + 5, h - 7);
    ctx.closePath();
    ctx.fill();
    if (bw >= 3) {
      ctx.strokeStyle = COLORS.pivot;
      ctx.lineWidth = 1.5;
      const t = v[p.pivot] / max, bh = Math.max(1, t * ph);
      ctx.strokeRect(p.pivot * bw + 0.75, top + ph - bh + 0.75, Math.max(1, bw - gap) - 1.5, bh - 1.5);
    }
  }

  if (o.target !== undefined) {
    const y = top + ph - (o.target / max) * ph;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
