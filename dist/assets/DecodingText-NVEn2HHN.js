var e=`/*
 * Decoding text
 *
 * The "movie hacker" effect: text starts as random glyphs and resolves into
 * the real message one character at a time.
 *
 * Every tick, each unresolved character either locks to its true value, with
 * probability p, or is replaced by a fresh random glyph. Each character is an
 * independent coin flip, so the number of ticks it takes to settle follows a
 * geometric distribution with mean 1/p. That gives the effect its texture: a
 * few characters lock almost at once, most land around the average, and a long
 * tail holds out. To keep that tail from dragging on, anything still
 * unresolved after twice the average is forced into place.
 *
 * In cycle mode the input is split into phrases at blank lines, and each is
 * decoded in turn, holding for a moment on the finished text.
 */
import { useEffect, useRef, useState } from 'react';

const GLYPH_SETS = {
  letters: { label: 'Letters', glyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' },
  binary: { label: 'Binary', glyphs: '01' },
  hex: { label: 'Hex', glyphs: '0123456789ABCDEF' },
  // Katakana are full-width in most fonts, so lines get wider while
  // scrambled and narrow as they resolve; that shimmer is part of the look.
  katakana: { label: 'Katakana', glyphs: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' },
  symbols: { label: 'Box drawing', glyphs: '─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬░▒▓█▀▄▌▐■□◆◇○●' },
};

const HOLD_MS = 2000; // how long a finished phrase stays up in cycle mode
const DEFAULT_TEXT = [
  'reality is a persistent illusion',
  'the map is not the territory',
  'all models are wrong, some are useful',
].join('\\n\\n');

// ---------------------------------------------------------------------------
// Pure decoding logic. A "cell" is { target, char, done } for one character.

const randomGlyph = (glyphs) => glyphs[Math.floor(Math.random() * glyphs.length)];

// Newlines must always stay put or the layout would jump around; other
// whitespace is left alone only if asked.
const isFixed = (ch, keepSpaces) => ch === '\\n' || (keepSpaces && /\\s/.test(ch));

// Spread rather than split('') so characters outside the Basic Multilingual
// Plane (emoji and the like) stay whole instead of splitting into halves.
function scramble(text, glyphs, keepSpaces) {
  return [...text].map((target) =>
    isFixed(target, keepSpaces) ? { target, char: target, done: true } : { target, char: randomGlyph(glyphs), done: false },
  );
}

// Advances every unresolved cell by one tick and returns whether all are done.
// \`force\` resolves everything at once (the cap on the geometric tail).
function advance(cells, glyphs, p, force) {
  let allDone = true;
  for (const cell of cells) {
    if (cell.done) continue;
    if (force || Math.random() < p) {
      cell.char = cell.target;
      cell.done = true;
    } else {
      cell.char = randomGlyph(glyphs);
      allDone = false;
    }
  }
  return allDone;
}

// A copy for React state, since the running animation mutates its cells.
const snapshot = (cells) => cells.map((cell) => ({ ...cell }));

const splitPhrases = (text) =>
  text
    .split(/\\n\\s*\\n/)
    .map((s) => s.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------
// UI

function Slider({ label, value, min, max, step, onChange, format = String }) {
  return (
    <label className="block text-sm text-gray-300">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-gray-400">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 block w-full accent-gray-300"
      />
    </label>
  );
}

export default function DecodingText() {
  const [draft, setDraft] = useState(DEFAULT_TEXT);
  // What is being decoded. Separate from the draft so typing doesn't restart
  // the animation on every keystroke; it commits on blur or Decode.
  const [text, setText] = useState(DEFAULT_TEXT);
  const [glyphSet, setGlyphSet] = useState('letters');
  const [keepSpaces, setKeepSpaces] = useState(true);
  const [cycle, setCycle] = useState(true);
  const [speed, setSpeed] = useState(60); // ticks per second
  const [settle, setSettle] = useState(50); // average ticks for a character to lock
  const [replay, setReplay] = useState(0);
  const [cells, setCells] = useState([]);

  // Speed and settle rate are read through a ref so adjusting them changes
  // the running animation instead of restarting it.
  const timing = useRef({ speed, settle });
  useEffect(() => {
    timing.current = { speed, settle };
  }, [speed, settle]);

  // One run of the animation: decode the phrase(s), then (in cycle mode) hold
  // and move on to the next. Changing anything that alters what's on screen
  // restarts it from scrambled text.
  useEffect(() => {
    const phrases = cycle ? splitPhrases(text) : [text];
    if (phrases.length === 0) {
      setCells([]);
      return undefined;
    }
    const { glyphs } = GLYPH_SETS[glyphSet];
    let index = 0;
    let ticks = 0;
    let current = scramble(phrases[0], glyphs, keepSpaces);
    let timer;

    const tick = () => {
      const { speed: perSecond, settle: average } = timing.current;
      ticks += 1;
      const done = advance(current, glyphs, 1 / average, ticks >= 2 * average);
      setCells(snapshot(current));
      if (!done) {
        timer = setTimeout(tick, 1000 / perSecond);
      } else if (phrases.length > 1) {
        timer = setTimeout(() => {
          index = (index + 1) % phrases.length;
          current = scramble(phrases[index], glyphs, keepSpaces);
          ticks = 0;
          tick();
        }, HOLD_MS);
      }
    };
    setCells(snapshot(current));
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [text, cycle, glyphSet, keepSpaces, replay]);

  const decode = () => {
    if (draft === text) setReplay((n) => n + 1);
    else setText(draft);
  };

  return (
    <div className="max-w-2xl space-y-4 text-gray-300">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          decode();
        }}
        className="space-y-2"
      >
        <label className="block text-sm">
          Text {cycle && <span className="text-gray-400">(blank lines separate phrases)</span>}
          <textarea
            value={draft}
            rows={5}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => draft !== text && setText(draft)}
            onKeyDown={(event) => {
              // Enter adds a line, so Ctrl/Cmd+Enter submits instead.
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                decode();
              }
            }}
            className="mt-1 block w-full rounded border border-gray-700 bg-gray-900 p-2 font-mono text-sm text-white focus:border-gray-400 focus:outline-none"
          />
        </label>
        <button type="submit" className="rounded bg-gray-800 px-3 py-1 text-sm text-gray-200 hover:bg-gray-700">
          Decode <span className="text-gray-400">(Ctrl+Enter)</span>
        </button>
      </form>

      {/* Screen readers get the finished text rather than a stream of noise. */}
      <p className="sr-only">{cells.map((cell) => cell.target).join('')}</p>
      <p
        aria-hidden="true"
        className="min-h-24 rounded border border-gray-700 bg-black p-4 font-mono text-lg break-words whitespace-pre-wrap text-white"
      >
        {cells.map((cell, i) => (
          <span key={i} className={cell.done ? undefined : 'text-gray-500'}>
            {cell.char}
          </span>
        ))}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Slider label="Speed" value={speed} min={5} max={60} step={1} onChange={setSpeed} format={(v) => \`\${v} ticks/s\`} />
        <Slider
          label="Settle time"
          value={settle}
          min={5}
          max={150}
          step={5}
          onChange={setSettle}
          format={(v) => \`~\${v} ticks\`}
        />
        <label className="block text-sm">
          Glyphs
          <select
            value={glyphSet}
            onChange={(event) => setGlyphSet(event.target.value)}
            className="mt-1 block w-full rounded border border-gray-700 bg-gray-900 p-1 text-gray-200"
          >
            {Object.entries(GLYPH_SETS).map(([key, set]) => (
              <option key={key} value={key}>
                {set.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col justify-end gap-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={keepSpaces} onChange={(e) => setKeepSpaces(e.target.checked)} className="accent-gray-300" />
            Keep spaces
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cycle} onChange={(e) => setCycle(e.target.checked)} className="accent-gray-300" />
            Cycle through phrases
          </label>
        </div>
      </div>
    </div>
  );
}
`;export{e as default};