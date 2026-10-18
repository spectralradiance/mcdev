import { useMemo, useRef } from 'react';
import { SOp, STRING_PRESETS, STRING_SEARCHES, type StringStep, type StringTrace } from '../searches';
import { sound, type Note } from '../sound';
import { AlgorithmCard, COLORS, Field, Legend, Select, Stat, TextInput, Transport, useCanvas, usePlayback, type Playable } from '../ui';
import { useParam } from '../params';

class StringPlayer implements Playable {
  pos = 0;
  touched: StringStep[] = [];
  constructor(readonly trace: StringTrace) {}
  get length() { return this.trace.steps.length; }
  get finished() { return this.pos >= this.trace.steps.length; }
  forward() { if (this.pos < this.length) this.touched.push(this.trace.steps[this.pos++]); }
  backward() { if (this.pos > 0) this.touched.push(this.trace.steps[--this.pos]); }
  seek(t: number) { this.pos = Math.max(0, Math.min(this.length, t)); this.touched.length = 0; }

  /** Everything the view needs at the current position, replayed from the start (traces are short). */
  state(m: number) {
    let shift = 0, compares = 0, aligns = 0, hashHit: boolean | null = null, last: StringStep | null = null;
    let marks: (0 | 1 | 2)[] = new Array(m).fill(0); // 0 untested, 1 match, 2 mismatch
    const found: number[] = [];
    for (let k = 0; k < this.pos; k++) {
      const s = this.trace.steps[k];
      switch (s.op) {
        case SOp.Align: shift = s.a; aligns++; marks = new Array(m).fill(0); hashHit = null; break;
        case SOp.Match: case SOp.Mismatch: compares++; marks[s.b] = s.op === SOp.Match ? 1 : 2; break;
        case SOp.Found: found.push(s.a); break;
        case SOp.Hash: hashHit = s.b === 1; break;
      }
      last = s;
    }
    return { shift, compares, aligns, marks, found, hashHit, last };
  }
}

const MATCH = '#22c55e', MISMATCH = '#ef4444';

export default function StringView() {
  const [algoId, setAlgoId] = useParam('match', 'kmp');
  const [text, setText] = useParam('text', STRING_PRESETS[0].text);
  const [pattern, setPattern] = useParam('pattern', STRING_PRESETS[0].pattern);
  const algo = STRING_SEARCHES.find((a) => a.id === algoId) ?? STRING_SEARCHES[1];
  const pat = pattern || 'A';

  const player = useMemo(() => new StringPlayer(algo.run(text, pat)), [algo, text, pat]);
  const players = useMemo(() => [player], [player]);
  // Tall enough for the rows at the cell size the text's length allows, and no taller.
  const rows = player.trace.table ? 4.6 : 3.6;
  const { wrap, canvas, size, context } = useCanvas(Math.min(0.3, rows / Math.max(text.length, 12) + 0.06), 260);
  const shown = useRef(0);

  const pb = usePlayback({
    players,
    duration: Math.max(4, Math.min(25, player.length / 6)),
    keys: true,
    onFinish: () => {
      if (player.trace.matches.length) sound.chord([0.45, 0.6, 0.75, 0.9], 0.05, 'sine');
      else sound.chord([0.35, 0.25], 0.1, 'triangle');
    },
    frame: (dt) => {
      const notes: Note[] = [];
      for (const s of player.touched) {
        if (s.op === SOp.Match) notes.push({ t: 0.35 + 0.55 * (s.b / Math.max(1, pat.length - 1)), wave: 'sine', pan: (s.a / text.length) * 1.4 - 0.7 });
        else if (s.op === SOp.Mismatch) notes.push({ t: 0.08, wave: 'square', length: 0.06, gain: 0.7, pan: (s.a / text.length) * 1.4 - 0.7 });
        else if (s.op === SOp.Found) sound.chord([0.6, 0.75, 0.9, 1], 0.04, 'sine');
        else if (s.op === SOp.Hash && s.b) notes.push({ t: 0.85, wave: 'sine', gain: 0.6 });
      }
      player.touched.length = 0;
      sound.play(notes, 3);

      const ctx = context();
      if (!ctx) return;
      const st = player.state(pat.length);
      shown.current += (st.shift - shown.current) * Math.min(1, dt * 14);
      draw(ctx, size.w, size.h, text, pat, st, shown.current, player.trace.table);
    },
  });

  const st = player.state(pat.length);
  const last = st.last;
  let status = 'Ready.';
  if (last?.op === SOp.Align) status = `Align the pattern at ${last.a}`;
  else if (last?.op === SOp.Match) status = `text[${last.a}] = '${text[last.a]}' matches pattern[${last.b}]`;
  else if (last?.op === SOp.Mismatch) status = `text[${last.a}] = '${text[last.a]}' ≠ pattern[${last.b}] = '${pat[last.b]}'`;
  else if (last?.op === SOp.Found) status = `Match at ${last.a}`;
  else if (last?.op === SOp.Hash) status = last.b ? 'Window hash equals the pattern hash: check the characters' : 'Window hash differs: skip without comparing';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Algorithm"><Select value={algo.id} onChange={setAlgoId} options={STRING_SEARCHES} /></Field>
        <Field label="Preset">
          <Select
            value={(STRING_PRESETS.find((p) => p.text === text && p.pattern === pattern)?.name ?? '') as string}
            onChange={(name) => { const p = STRING_PRESETS.find((x) => x.name === name); if (p) { setText(p.text); setPattern(p.pattern); } }}
            options={[{ id: '', name: 'Custom' }, ...STRING_PRESETS.map((p) => ({ id: p.name, name: p.name }))]}
          />
        </Field>
        <Field label="Text" className="min-w-[16rem] flex-1"><TextInput value={text} onChange={setText} maxLength={96} /></Field>
        <Field label="Pattern"><TextInput value={pattern} onChange={setPattern} maxLength={20} className="w-40" /></Field>
      </div>

      <div ref={wrap} className="overflow-hidden rounded-lg border border-line-soft">
        <canvas ref={canvas} className="block" onPointerDown={() => sound.unlock()} />
      </div>

      <Transport pb={pb} label="steps" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs text-muted">{status}</p>
        <Legend items={[{ color: MATCH, label: 'Match' }, { color: MISMATCH, label: 'Mismatch' }, { color: COLORS.found, label: 'Occurrence', ring: true }]} />
      </div>

      <div className="flex flex-wrap gap-6 rounded-lg border border-line-soft bg-deep px-4 py-3">
        <Stat label="Comparisons" value={st.compares} color={COLORS.compare} />
        <Stat label="Alignments" value={st.aligns} />
        <Stat label="Found" value={st.found.length ? st.found.join(', ') : '—'} color={COLORS.found} />
        <Stat label="Text / pattern" value={`${text.length} / ${pat.length}`} />
      </div>

      <AlgorithmCard name={algo.name} about={algo.about} facts={[['average', `O(${algo.average})`], ['worst', `O(${algo.worst})`]]} />
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D, w: number, h: number, text: string, pat: string,
  st: ReturnType<StringPlayer['state']>, shift: number, table?: StringTrace['table'],
) {
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, w, h);
  const pad = 12;
  const rows = table ? 4.6 : 3.6;
  const cw = Math.max(6, Math.min(34, (w - 2 * pad) / Math.max(text.length, 1), (h - 24) / rows));
  const x0 = Math.max(pad, (w - cw * text.length) / 2);
  const y0 = Math.max(8, (h - cw * rows) / 2);
  const font = (scale: number) => `${Math.round(cw * scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Index row.
  if (cw >= 14) {
    ctx.fillStyle = '#4b5563';
    ctx.font = font(0.36);
    for (let i = 0; i < text.length; i++) if (i % (cw >= 22 ? 1 : 5) === 0) ctx.fillText(String(i), x0 + i * cw + cw / 2, y0 + cw * 0.3);
  }

  // Text row, with found occurrences outlined.
  const ty = y0 + cw * 0.6;
  const s0 = Math.round(shift);
  for (let i = 0; i < text.length; i++) {
    const j = i - st.shift;
    const mark = j >= 0 && j < pat.length ? st.marks[j] : 0;
    ctx.fillStyle = mark === 1 ? MATCH + '55' : mark === 2 ? MISMATCH + '55' : '#111827';
    ctx.fillRect(x0 + i * cw + 1, ty + 1, cw - 2, cw - 2);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = font(0.6);
    ctx.fillText(text[i] === ' ' ? '·' : text[i], x0 + i * cw + cw / 2, ty + cw / 2 + 1);
  }
  ctx.strokeStyle = COLORS.found;
  ctx.lineWidth = 2;
  for (const f of st.found) ctx.strokeRect(x0 + f * cw + 1, ty + 1, pat.length * cw - 2, cw - 2);

  // Pattern row, sliding to the current alignment.
  const py = ty + cw * 1.35;
  const px = x0 + shift * cw;
  for (let j = 0; j < pat.length; j++) {
    const mark = st.marks[j];
    ctx.fillStyle = mark === 1 ? MATCH : mark === 2 ? MISMATCH : '#1f2937';
    ctx.fillRect(px + j * cw + 1, py + 1, cw - 2, cw - 2);
    ctx.fillStyle = mark ? '#030712' : '#e5e7eb';
    ctx.font = font(0.6);
    ctx.fillText(pat[j] === ' ' ? '·' : pat[j], px + j * cw + cw / 2, py + cw / 2 + 1);
  }

  // A line joining the two characters compared last.
  const l = st.last;
  if (l && (l.op === SOp.Match || l.op === SOp.Mismatch) && Math.abs(shift - s0) < 0.05) {
    ctx.strokeStyle = l.op === SOp.Match ? MATCH : MISMATCH;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + l.a * cw + cw / 2, ty + cw);
    ctx.lineTo(px + l.b * cw + cw / 2, py);
    ctx.stroke();
  }

  if (st.hashHit !== null) {
    ctx.strokeStyle = st.hashHit ? COLORS.compare : '#4b5563';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + st.shift * cw - 1, ty - 1, pat.length * cw + 2, cw + 2);
    ctx.setLineDash([]);
  }

  // Algorithm table under the pattern.
  if (table) {
    const yy = py + cw * 1.15;
    ctx.font = font(0.38);
    ctx.fillStyle = '#9ca3af';
    if (table.values.length === pat.length) {
      for (let j = 0; j < pat.length; j++) ctx.fillText(String(table.values[j]), px + j * cw + cw / 2, yy + cw * 0.3);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(table.label, px - 6, yy + cw * 0.3);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(String(table.values[0]), px, yy + cw * 0.3);
    }
  }
}
