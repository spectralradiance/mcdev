/*
 * Aria
 *
 * A melody maker that thinks in scale degrees instead of note names. You
 * write a melody as numbers ("5, -5, -5, 4"), where 0 is the key's root, 1 is
 * the next note up the scale, -1 the next note down, and so on. The same
 * numbers then sound right in any key and any of eighteen scales and modes.
 *
 * The music theory: a scale is a repeating list of semitone steps, e.g. major
 * is 2 2 1 2 2 2 1 (whole, whole, half, ...). Degree d lies the sum of the
 * first d steps above the root (or below it, for negative d), cycling through
 * the list so degrees past 7 climb into the next octave. Notes are numbered in
 * semitones from C0, and an equal-tempered pitch is f = 16.352 Hz * 2^(n / 12),
 * C0 being 16.352 Hz and each octave doubling the frequency.
 *
 * Playback runs on Tone.js's Transport, the Web Audio clock, rather than
 * setInterval, so timing stays tight even when the page is busy. Each tick
 * plays the next note at the exact audio time it was scheduled for, and
 * Tone.Draw lights that note in the piano roll in sync with what you hear.
 *
 * The settings live in the URL hash, so a link reproduces the melody exactly.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';

// JavaScript's % keeps the dividend's sign; scales need -1 mod 12 to be 11.
const mod = (a, b) => ((a % b) + b) % b;

// Sharps and flats both parse; the first spelling is used for display.
const NOTE_NAMES = [
  ['C'], ['C#', 'Db'], ['D'], ['D#', 'Eb'], ['E'], ['F'],
  ['F#', 'Gb'], ['G'], ['G#', 'Ab'], ['A'], ['A#', 'Bb'], ['B'],
];

// Semitone steps between successive degrees. Every pattern spans one octave
// (sums to 12), which the piano roll relies on to shade in-scale rows.
const SCALE_PATTERNS = {
  chromatic: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  major: [2, 2, 1, 2, 2, 2, 1],
  natural_minor: [2, 1, 2, 2, 1, 2, 2],
  minor_pentatonic: [3, 2, 2, 3, 2],
  blues: [3, 2, 1, 1, 3, 2],
  major_pentatonic: [2, 2, 3, 2, 3],
  harmonic_minor: [2, 1, 2, 2, 1, 3, 1],
  melodic_minor: [2, 1, 2, 2, 2, 2, 1],
  ionian: [2, 2, 1, 2, 2, 2, 1],
  dorian: [2, 1, 2, 2, 2, 1, 2],
  phrygian: [1, 2, 2, 2, 1, 2, 2],
  lydian: [2, 2, 2, 1, 2, 2, 1],
  mixolydian: [2, 2, 1, 2, 2, 1, 2],
  aeolian: [2, 1, 2, 2, 1, 2, 2],
  locrian: [1, 2, 2, 1, 2, 2, 2],
  whole_tone: [2, 2, 2, 2, 2, 2],
  whole_half_diminished: [2, 1, 2, 1, 2, 1, 2, 1],
  half_whole_diminished: [1, 2, 1, 2, 1, 2, 1, 2],
};

const WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'];
const MAX_GENERATED = 64;
const MAX_HISTORY = 12;

const DEFAULTS = {
  scale: 'dorian',
  key: 'C3',
  melody: '5, -5, -5, 4, -4, -1',
  tempo: 200, // notes per minute: one note per beat
  gate: 33, // how much of each beat the note sounds, in percent
  wave: 'triangle',
};

// "F#3" -> semitones above C0, or null if it isn't a note name.
function parseNoteName(text) {
  const match = /^([A-Ga-g][#b]?)(-?\d+)$/.exec(text.trim());
  if (!match) return null;
  const letter = match[1][0].toUpperCase() + match[1].slice(1);
  const pitchClass = NOTE_NAMES.findIndex((names) => names.includes(letter));
  return pitchClass < 0 ? null : 12 * parseInt(match[2], 10) + pitchClass;
}

const noteName = (n) => NOTE_NAMES[mod(n, 12)][0] + Math.floor(n / 12);
const frequencyOf = (n) => 16.352 * Math.pow(2, n / 12);

// Semitone number of scale degree `degree` (may be negative) above `root`.
function scaleNote(root, pattern, degree) {
  let semitones = 0;
  for (let k = 0; k < degree; ++k) semitones += pattern[mod(k, pattern.length)];
  for (let k = -1; k >= degree; --k) semitones -= pattern[mod(k, pattern.length)];
  return root + semitones;
}

// Pitch classes (0-11, relative to the root) that belong to the scale.
function scalePitchClasses(pattern) {
  const classes = new Set([0]);
  let semitones = 0;
  for (const step of pattern) classes.add(mod((semitones += step), 12));
  return classes;
}

// Any run of digits with an optional minus sign is a degree; anything else separates.
const parseDegrees = (text) => (text.match(/-?\d+/g) ?? []).map(Number);

const randomDegrees = (low, high, count) =>
  Array.from({ length: count }, () => low + Math.floor(Math.random() * (high - low + 1)));

// Turn the settings into playable notes, or explain what's wrong with them.
function buildMelody({ scale, key, melody }) {
  const root = parseNoteName(key);
  if (root === null) return { error: `"${key}" isn't a note name (try C3, F#2, Bb1).` };
  const degrees = parseDegrees(melody);
  if (degrees.length === 0) return { error: 'The melody needs at least one scale degree.' };
  return { root, notes: degrees.map((d) => scaleNote(root, SCALE_PATTERNS[scale], d)) };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Settings <-> URL hash. Anything missing or invalid falls back to the default.
function readHash() {
  const p = new URLSearchParams(window.location.hash.slice(1));
  const num = (name, lo, hi) => {
    const x = Number(p.get(name));
    return p.has(name) && Number.isFinite(x) ? clamp(x, lo, hi) : DEFAULTS[name];
  };
  return {
    scale: p.get('scale') in SCALE_PATTERNS ? p.get('scale') : DEFAULTS.scale,
    key: p.get('key') ?? DEFAULTS.key,
    melody: p.get('melody') ?? DEFAULTS.melody,
    tempo: num('tempo', 40, 400),
    gate: num('gate', 5, 100),
    wave: WAVEFORMS.includes(p.get('wave')) ? p.get('wave') : DEFAULTS.wave,
  };
}

function writeHash(params) {
  // Don't decorate a plain visit's URL until something has been changed.
  const isDefault = Object.keys(DEFAULTS).every((k) => params[k] === DEFAULTS[k]);
  if (isDefault && !window.location.hash) return;
  const url = `${window.location.pathname}${window.location.search}#${new URLSearchParams(params)}`;
  // Keep the router's history state; we're only changing the fragment.
  window.history.replaceState(window.history.state, '', url);
}

// Pitch on the vertical axis, time on the horizontal. Rows in the scale are
// shaded lighter, like a keyboard's white keys, and labeled when there's room
// (the root's rows always, and brighter).
function PianoRoll({ root, notes, pattern, gate, current }) {
  const low = Math.min(...notes) - 1;
  const high = Math.max(...notes) + 1;
  const rows = high - low + 1;
  const gutter = 34;
  const width = 600;
  const rowHeight = clamp(180 / rows, 3, 16);
  const height = rows * rowHeight;
  const cell = (width - gutter) / notes.length;
  const inScale = scalePitchClasses(pattern);
  const y = (n) => (high - n) * rowHeight;

  const rowsOut = [];
  for (let n = low; n <= high; ++n) {
    const degreeClass = mod(n - root, 12);
    rowsOut.push(
      <g key={n}>
        <rect x={gutter} y={y(n)} width={width - gutter} height={rowHeight}
          className={inScale.has(degreeClass) ? 'fill-gray-800' : 'fill-gray-950'} />
        {(degreeClass === 0 || (inScale.has(degreeClass) && rowHeight >= 11)) && (
          <text x={gutter - 4} y={y(n) + rowHeight / 2} textAnchor="end" dominantBaseline="central"
            className={`font-mono ${degreeClass === 0 ? 'fill-gray-200' : 'fill-gray-500'}`}
            fontSize={Math.min(10, rowHeight + 2)}>
            {noteName(n)}
          </text>
        )}
      </g>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full rounded border border-gray-700"
      role="img" aria-label={`Piano roll: ${notes.map(noteName).join(' ')}`}>
      {rowsOut}
      {notes.map((n, i) => (
        <rect key={i} x={gutter + i * cell + 1} y={y(n) + 0.5}
          width={Math.max(1.5, cell * (gate / 100) - 2)} height={rowHeight - 1} rx={Math.min(3, rowHeight / 3)}
          className={i === current ? 'fill-sky-200' : 'fill-sky-600'} />
      ))}
      {current >= 0 && current < notes.length && (
        <line x1={gutter + current * cell} x2={gutter + current * cell} y1={0} y2={height}
          className="stroke-sky-300/60" strokeWidth={1} />
      )}
    </svg>
  );
}

const labelCls = 'block text-xs text-gray-400 mb-1';
const inputCls =
  'block bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-gray-500';
const smallInputCls = `${inputCls} w-20`;
const buttonCls =
  'px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 active:translate-y-px text-sm text-white shadow-[0_2px_0_rgb(55,65,81)]';

export default function Aria() {
  const uid = useId();
  const [params, setParams] = useState(readHash);
  const [bounds, setBounds] = useState({ lower: '-5', upper: '5', count: '6' });
  const [generateError, setGenerateError] = useState(null);
  const [generated, setGenerated] = useState([]); // newest first
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [copied, setCopied] = useState(false);

  const built = useMemo(() => buildMelody(params), [params]);

  // Audio objects and the loop's position are read inside the Transport's
  // callback, which outlives any single render, so they live in refs.
  const synthRef = useRef(null);
  const loopRef = useRef(null);
  const positionRef = useRef(0);
  // The last valid melody keeps playing while you're mid-edit on an invalid one.
  const melodyRef = useRef(null);
  const mountedRef = useRef(false);
  const copiedTimerRef = useRef(null);

  useEffect(() => {
    if (built.error) return;
    melodyRef.current = {
      frequencies: built.notes.map(frequencyOf),
      seconds: (params.gate / 100) * (60 / params.tempo),
    };
  }, [built, params.gate, params.tempo]);

  // Live changes to sound and tempo, once audio exists.
  useEffect(() => {
    if (synthRef.current) synthRef.current.oscillator.type = params.wave;
  }, [params.wave]);
  useEffect(() => {
    if (synthRef.current) Tone.getTransport().bpm.value = params.tempo;
  }, [params.tempo]);

  useEffect(() => writeHash(params), [params]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(copiedTimerRef.current);
      if (synthRef.current) {
        Tone.getTransport().stop();
        Tone.getDraw().cancel(0);
      }
      loopRef.current?.dispose();
      synthRef.current?.dispose();
      loopRef.current = synthRef.current = null;
    };
  }, []);

  const play = async () => {
    setPlaying(true);
    await Tone.start(); // browsers only allow audio after a user gesture
    if (!mountedRef.current) return;
    synthRef.current ??= new Tone.Synth({ oscillator: { type: params.wave }, volume: -8 }).toDestination();
    loopRef.current ??= new Tone.Loop((time) => {
      const melody = melodyRef.current;
      if (!melody) return;
      const i = positionRef.current % melody.frequencies.length;
      positionRef.current = i + 1;
      synthRef.current.triggerAttackRelease(melody.frequencies[i], melody.seconds, time);
      // `time` is slightly in the future (Tone schedules ahead); Draw fires the
      // visual update at the moment the note is actually heard.
      Tone.getDraw().schedule(() => setCurrent(i), time);
    }, '4n');

    const transport = Tone.getTransport();
    transport.bpm.value = params.tempo;
    positionRef.current = 0;
    loopRef.current.start(0);
    transport.start();
  };

  const stop = () => {
    setPlaying(false);
    setCurrent(-1);
    if (!synthRef.current) return;
    Tone.getTransport().stop();
    loopRef.current.stop();
    Tone.getDraw().cancel(0); // drop highlights already scheduled for notes we won't play
  };

  const update = (field, value) => setParams((p) => ({ ...p, [field]: value }));

  const generate = () => {
    const lower = parseInt(bounds.lower, 10);
    const upper = parseInt(bounds.upper, 10);
    const count = parseInt(bounds.count, 10);
    if (![lower, upper, count].every(Number.isFinite) || count < 1 || lower > upper) {
      setGenerateError('Bounds must be whole numbers with lower ≤ upper, and notes at least 1.');
      return;
    }
    setGenerateError(null);
    const melody = randomDegrees(lower, upper, Math.min(count, MAX_GENERATED)).join(', ');
    setParams((p) => ({ ...p, melody }));
    setGenerated((g) => [{ melody, scale: params.scale, key: params.key }, ...g].slice(0, MAX_HISTORY));
  };

  const recall = (entry) => setParams((p) => ({ ...p, ...entry }));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the link is still in the address bar.
    }
  };

  const field = (name, label, children) => (
    <div key={name}>
      <label htmlFor={uid + name} className={labelCls}>{label}</label>
      {children}
    </div>
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-gray-300 font-light space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        {field('scale', 'scale',
          <select id={uid + 'scale'} className={inputCls} value={params.scale}
            onChange={(e) => update('scale', e.target.value)}>
            {Object.keys(SCALE_PATTERNS).map((name) => (
              <option key={name} value={name}>{name.replaceAll('_', ' ')}</option>
            ))}
          </select>
        )}
        {field('key', 'key',
          <input id={uid + 'key'} type="text" className={smallInputCls} value={params.key}
            onChange={(e) => update('key', e.target.value)} />
        )}
        {field('wave', 'waveform',
          <select id={uid + 'wave'} className={inputCls} value={params.wave}
            onChange={(e) => update('wave', e.target.value)}>
            {WAVEFORMS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        )}
        <button type="button" className={`${buttonCls} w-16`} onClick={playing ? stop : play}>
          {playing ? 'stop' : 'play'}
        </button>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {field('tempo', <>tempo: <span className="font-mono text-gray-200">{params.tempo}</span> bpm</>,
          <input id={uid + 'tempo'} type="range" min="40" max="400" step="5" value={params.tempo}
            onChange={(e) => update('tempo', Number(e.target.value))} className="w-40 accent-sky-500" />
        )}
        {field('gate', <>note length: <span className="font-mono text-gray-200">{params.gate}%</span> of a beat</>,
          <input id={uid + 'gate'} type="range" min="5" max="100" value={params.gate}
            onChange={(e) => update('gate', Number(e.target.value))} className="w-40 accent-sky-500" />
        )}
      </div>

      <div>
        <label htmlFor={uid + 'melody'} className={labelCls}>melody (scale degrees; 0 is the root)</label>
        <input id={uid + 'melody'} type="text" className={`${inputCls} w-full font-mono`} value={params.melody}
          onChange={(e) => update('melody', e.target.value)} />
      </div>

      {built.error ? (
        <p className="text-sm text-red-400">{built.error}</p>
      ) : (
        <div>
          <PianoRoll root={built.root} notes={built.notes} pattern={SCALE_PATTERNS[params.scale]}
            gate={params.gate} current={current} />
          <p className="mt-1 text-xs text-gray-500 font-mono break-words">
            {built.notes.map((n, i) => (
              <span key={i} className={i === current ? 'text-sky-300' : undefined}>{noteName(n)} </span>
            ))}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        {[['lower', 'lowest degree'], ['upper', 'highest degree'], ['count', 'notes']].map(([name, label]) =>
          field(name, label,
            <input id={uid + name} type="number" className={smallInputCls} value={bounds[name]}
              onChange={(e) => setBounds((b) => ({ ...b, [name]: e.target.value }))} />
          )
        )}
        <button type="button" className={buttonCls} onClick={generate}>generate</button>
        <button type="button" className="text-sm text-gray-400 underline hover:text-gray-200 py-1" onClick={copyLink}>
          {copied ? 'link copied' : 'copy link'}
        </button>
      </div>
      {generateError && <p className="text-sm text-red-400">{generateError}</p>}

      {generated.length > 0 && (
        <div>
          <h3 className={labelCls}>generated (click to recall)</h3>
          <ul className="space-y-1">
            {generated.map((entry, i) => (
              <li key={i}>
                <button type="button" onClick={() => recall(entry)}
                  className="w-full truncate text-left rounded px-2 py-1 text-xs font-mono text-gray-400 hover:bg-gray-800 hover:text-gray-200">
                  <span className="text-gray-500">{entry.key} {entry.scale.replaceAll('_', ' ')}:</span> {entry.melody}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
