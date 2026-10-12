import { useCallback, useEffect, useId, useRef, useState } from 'react';
import * as Tone from 'tone';

// we want -1%4 to be 3, not -1
function mod(a, b) {
  return a < 0 ? b + (a % b) : a % b;
}

// uses # and b instead of ♯ and ♭
const RELATIVE_NAMES = [
  ['C'],
  ['C#/Db', 'C#', 'Db'],
  ['D'],
  ['D#/Eb', 'D#', 'Eb'],
  ['E'],
  ['F'],
  ['F#/Gb', 'F#', 'Gb'],
  ['G'],
  ['G#/Ab', 'G#', 'Ab'],
  ['A'],
  ['A#/Bb', 'A#', 'Bb'],
  ['B'],
];

const SCALE_PATTERNS = {
  chromatic: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  major: [2, 2, 1, 2, 2, 2, 1],
  natural_minor: [2, 1, 2, 2, 1, 2, 2],
  minor_pentatonic: [3, 2, 2, 3, 2],
  blues: [3, 2, 1, 1, 3, 2],
  major_pentatonic: [2, 2, 3, 2, 3],
  harmonic_minor: [2, 1, 2, 2, 1, 3, 2],
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

// Absolute index: 0 = C0. Returns null for an unparseable name.
function indexFromRelativeName(relativeName, octave) {
  for (let i = 0; i < RELATIVE_NAMES.length; ++i) {
    if (RELATIVE_NAMES[i].includes(relativeName)) return 12 * octave + i;
  }
  return null;
}

function indexFromAbsoluteName(name) {
  const rel = name.match(/\D+/);
  const oct = name.match(/\d+/);
  if (!rel || !oct) return null;
  return indexFromRelativeName(rel[0], parseInt(oct[0], 10));
}

const frequencyOf = (index) => 16.352 * Math.pow(2, index / 12);
const nameOf = (index) =>
  RELATIVE_NAMES[mod(index, 12)][0] + Math.floor(index / 12);

// Index of the i-th degree of the scale starting at keyIndex (i may be negative).
function scaleNote(keyIndex, pattern, i) {
  let halfSteps = 0;
  if (i < 0) {
    for (let k = 0; k > i; --k) halfSteps -= pattern[mod(k, pattern.length)];
  } else {
    for (let k = 0; k < i; ++k) halfSteps += pattern[mod(k, pattern.length)];
  }
  return keyIndex + halfSteps;
}

function randomPattern(low, high, n) {
  const pattern = [];
  for (let i = 0; i < n; ++i) {
    pattern.push(low + Math.floor(Math.random() * (high - low + 1)));
  }
  return pattern;
}

function parseMelody(text) {
  return text
    .split(/[^\d-]/)
    .filter((x) => x.length > 0)
    .map((x) => parseInt(x, 10))
    .filter((x) => Number.isFinite(x));
}

// Build the played notes from the current settings, or return { error }.
function buildMelody({ scale, key, duration, delay, melody }) {
  const keyIndex = indexFromAbsoluteName(key.trim());
  if (keyIndex === null) return { error: `"${key}" isn't a note name (try C2, F#3, Bb1).` };
  const dur = parseFloat(duration);
  if (!(dur > 0)) return { error: 'Duration must be a positive number of seconds.' };
  const del = parseFloat(delay);
  if (!(del > 0)) return { error: 'Delay must be a positive number of seconds.' };
  const degrees = parseMelody(melody);
  if (degrees.length === 0) return { error: 'The melody needs at least one scale degree.' };
  const pattern = SCALE_PATTERNS[scale];
  const indices = degrees.map((d) => scaleNote(keyIndex, pattern, d));
  return {
    notes: indices.map((idx) => ({ frequency: frequencyOf(idx), duration: dur })),
    names: indices.map(nameOf),
    delay: del,
  };
}

const labelCls = 'block text-xs text-gray-400 mb-1';
const inputCls =
  'block bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-gray-500';
const smallInputCls = `${inputCls} w-20`;
const buttonCls =
  'px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 active:translate-y-px text-sm text-white shadow-[0_2px_0_rgb(55,65,81)]';

export default function Aria() {
  const uid = useId();
  const [params, setParams] = useState({
    scale: 'dorian',
    key: 'C2',
    duration: '0.1',
    delay: '0.3',
    melody: '5, -5, -5, 4, -4, -1',
  });
  const [lower, setLower] = useState('-5');
  const [upper, setUpper] = useState('5');
  const [nNotes, setNNotes] = useState('6');
  const [playing, setPlaying] = useState(false);
  const [noteNames, setNoteNames] = useState(null);
  const [error, setError] = useState(null);

  const paramsRef = useRef(params);
  paramsRef.current = params;
  const playingRef = useRef(false);
  const intervalRef = useRef(null);
  const synthRef = useRef(null);
  const mountedRef = useRef(true);

  const stopInterval = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const stop = useCallback(() => {
    stopInterval();
    playingRef.current = false;
    setPlaying(false);
  }, []);

  // Start (or restart) the loop with the given settings.
  const play = useCallback(async (p) => {
    const built = buildMelody(p);
    if (built.error) {
      setError(built.error);
      stopInterval();
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    setError(null);
    setNoteNames(built.names);
    stopInterval();
    playingRef.current = true;
    setPlaying(true);

    await Tone.start();
    if (!mountedRef.current || !playingRef.current) return;
    if (!synthRef.current) synthRef.current = new Tone.Synth().toDestination();
    const synth = synthRef.current;

    // The pen repeats the melody 4 times, then loops over it.
    const notes = [];
    for (let r = 0; r < 4; ++r) notes.push(...built.notes);
    let position = 0;
    stopInterval();
    intervalRef.current = setInterval(() => {
      const n = notes[position];
      synth.triggerAttackRelease(n.frequency, n.duration, Tone.now());
      position = (position + 1) % notes.length;
    }, built.delay * 1000);
  }, []);

  // Pen behaviour: changing a setting while playing restarts playback.
  const restartWith = useCallback(
    (p) => {
      if (playingRef.current) play(p);
    },
    [play]
  );

  const update = (field, value, restart) => {
    const next = { ...paramsRef.current, [field]: value };
    paramsRef.current = next;
    setParams(next);
    if (restart) restartWith(next);
  };

  // Text fields restart on commit (blur / Enter), like the DOM "change" event.
  const commitProps = {
    onBlur: () => restartWith(paramsRef.current),
    onKeyDown: (e) => {
      if (e.key === 'Enter') restartWith(paramsRef.current);
    },
  };

  const generate = () => {
    const lo = parseInt(lower, 10);
    const hi = parseInt(upper, 10);
    const n = parseInt(nNotes, 10);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || !Number.isFinite(n) || n < 0) {
      setError('Lower bound, upper bound and notes must be whole numbers.');
      return;
    }
    setError(null);
    update('melody', randomPattern(lo, hi, Math.min(n, 1000)).join(', '), true);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      playingRef.current = false;
      stopInterval();
      if (synthRef.current) {
        synthRef.current.dispose();
        synthRef.current = null;
      }
    };
  }, []);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-gray-300 font-light space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor={uid + 'scale'} className={labelCls}>scale</label>
          <select
            id={uid + 'scale'}
            className={inputCls}
            value={params.scale}
            onChange={(e) => update('scale', e.target.value, true)}
          >
            {Object.keys(SCALE_PATTERNS).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={uid + 'key'} className={labelCls}>key</label>
          <input
            id={uid + 'key'}
            type="text"
            className={smallInputCls}
            value={params.key}
            onChange={(e) => update('key', e.target.value, false)}
            {...commitProps}
          />
        </div>
        <div>
          <label htmlFor={uid + 'duration'} className={labelCls}>duration</label>
          <input
            id={uid + 'duration'}
            type="number"
            step="0.1"
            className={smallInputCls}
            value={params.duration}
            onChange={(e) => update('duration', e.target.value, true)}
          />
        </div>
        <div>
          <label htmlFor={uid + 'delay'} className={labelCls}>delay</label>
          <input
            id={uid + 'delay'}
            type="number"
            step="0.1"
            className={smallInputCls}
            value={params.delay}
            onChange={(e) => update('delay', e.target.value, true)}
          />
        </div>
        <div>
          {playing ? (
            <button type="button" className={buttonCls} onClick={stop}>stop</button>
          ) : (
            <button type="button" className={buttonCls} onClick={() => play(paramsRef.current)}>
              play
            </button>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={uid + 'melody'} className={labelCls}>melody</label>
        <input
          id={uid + 'melody'}
          type="text"
          className={`${inputCls} w-full`}
          value={params.melody}
          onChange={(e) => update('melody', e.target.value, false)}
          {...commitProps}
        />
        {noteNames && (
          <p className="mt-1 text-xs text-gray-500 font-mono break-words">{noteNames.join(' ')}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor={uid + 'lower'} className={labelCls}>lower bound</label>
          <input
            id={uid + 'lower'}
            type="number"
            className={smallInputCls}
            value={lower}
            onChange={(e) => setLower(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={uid + 'upper'} className={labelCls}>upper bound</label>
          <input
            id={uid + 'upper'}
            type="number"
            className={smallInputCls}
            value={upper}
            onChange={(e) => setUpper(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={uid + 'notes'} className={labelCls}>notes</label>
          <input
            id={uid + 'notes'}
            type="number"
            className={smallInputCls}
            value={nNotes}
            onChange={(e) => setNNotes(e.target.value)}
          />
        </div>
        <div>
          <button type="button" className={buttonCls} onClick={generate}>generate</button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
