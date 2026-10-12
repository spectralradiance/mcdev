/*
 * Hacker Typer
 *
 * Mash any keys and you "write" a famous piece of real source code at
 * superhuman speed. Every keypress reveals the next few characters of a file
 * fetched straight from GitHub, re-highlighted so it looks like a real editor.
 *
 * How it works: the whole file is downloaded once, and the only state that
 * changes as you type is `shown`, the length of the prefix on screen. The
 * highlighted HTML is derived from that prefix with useMemo, so there is no
 * imperative DOM juggling. Re-highlighting the whole prefix on every key is
 * O(file size), but these files are at most ~30 KB, which highlight.js chews
 * through in a few milliseconds.
 *
 * Like the classic hacker typer, pressing Alt three times quickly flashes
 * ACCESS GRANTED and Caps Lock three times flashes ACCESS DENIED.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import c from 'highlight.js/lib/languages/c';
import x86asm from 'highlight.js/lib/languages/x86asm';
import 'highlight.js/styles/monokai.css';

// highlight.js has no grammar for the Apollo Guidance Computer's assembly
// language, so here is a tiny one. In AGC source, `#` starts a comment, a label
// (if any) sits in column 0, and the first word after the label column is the
// opcode or an assembler directive such as `EBANK=` or `2CADR`. highlight.js
// compiles patterns with the `m` flag, so `^` means "start of line", and the
// lookbehind skips past the optional label to find the opcode.
function agc() {
  return {
    name: 'AGC',
    contains: [
      { scope: 'comment', begin: /#/, end: /$/ },
      { scope: 'title', match: /^[^\s#]+/ },
      { scope: 'keyword', match: /(?<=^[^\s#]*[ \t]+)[^\s#]+/ },
      { scope: 'number', match: /\b\d+(?:\.\d+)?\b/ },
    ],
  };
}

// Only the grammars these files need, so the bundle stays small.
hljs.registerLanguage('c', c);
hljs.registerLanguage('x86asm', x86asm);
hljs.registerLanguage('agc', agc);

const GITHUB_RAW = 'https://raw.githubusercontent.com/';

const SOURCES = [
  {
    id: 'unix',
    title: 'Research Unix C compiler, pass 2 (1970s)',
    language: 'c',
    path: 'qrush/unix/master/src/c/c02.c',
  },
  {
    id: 'apollo',
    title: 'Apollo 11 lunar module ignition routine (1969)',
    language: 'agc',
    path: 'chrislgarry/Apollo-11/master/Luminary099/BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc',
  },
  {
    id: 'linux',
    title: 'Linux 0.01 boot sector (1991)',
    language: 'x86asm',
    path: 'mariuz/linux-0.01/master/boot/boot.s',
  },
  {
    id: 'doom',
    title: 'DOOM column and span renderer (1993)',
    language: 'c',
    path: 'id-Software/DOOM/master/linuxdoom-1.10/r_draw.c',
  },
  {
    id: 'quake',
    title: 'Quake III Arena math library, home of the fast inverse square root (1999)',
    language: 'c',
    path: 'id-Software/Quake-III-Arena/master/code/game/q_math.c',
  },
];

// A secret combo is the same key pressed this many times within the window.
const COMBO_PRESSES = 3;
const COMBO_WINDOW_MS = 1000;
const COMBOS = { Alt: 'granted', CapsLock: 'denied' };

const countLines = (text) => (text.length === 0 ? 0 : text.split('\n').length);

export default function HackerTyper() {
  const [sourceId, setSourceId] = useState(SOURCES[0].id);
  // Downloaded files by source id: a string, or an Error if the fetch failed.
  // Keeping every file means switching back and forth never re-downloads.
  const [files, setFiles] = useState({});
  const [shown, setShown] = useState(0);
  const [charsPerKey, setCharsPerKey] = useState(6);
  const [overlay, setOverlay] = useState(null); // null | 'granted' | 'denied'

  const scrollRef = useRef(null);
  // Recent presses of a combo key. A ref, not state: it never affects
  // rendering, and keydowns can arrive faster than React re-renders.
  const comboRef = useRef({ key: null, times: [] });

  const source = SOURCES.find((s) => s.id === sourceId);
  const file = files[sourceId];
  const code = typeof file === 'string' ? file : '';

  useEffect(() => {
    if (file !== undefined) return;
    const controller = new AbortController();
    fetch(GITHUB_RAW + source.path, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => setFiles((f) => ({ ...f, [source.id]: text })))
      .catch((error) => {
        if (error.name !== 'AbortError') setFiles((f) => ({ ...f, [source.id]: error }));
      });
    return () => controller.abort();
  }, [file, source]);

  const typed = code.slice(0, shown);
  const html = useMemo(
    // ignoreIllegals: a half-typed file is often syntactically incomplete.
    () => hljs.highlight(typed, { language: source.language, ignoreIllegals: true }).value,
    [typed, source.language]
  );
  const totalLines = useMemo(() => countLines(code), [code]);
  const progress = code.length ? shown / code.length : 0;
  const finished = code.length > 0 && shown >= code.length;

  // Keep the cursor in view. A layout effect scrolls before the browser
  // paints, so the text never visibly jumps.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    el.scrollTop = el.scrollHeight;
  }, [html]);

  // Type the next chunk. Once the file is done, the next key starts over.
  const advance = () => {
    setOverlay(null);
    if (!code) return;
    setShown((n) => (n >= code.length ? 0 : Math.min(n + charsPerKey, code.length)));
  };

  const registerComboPress = (key) => {
    const now = performance.now();
    const previous = comboRef.current;
    const times = previous.key === key ? previous.times.filter((t) => now - t < COMBO_WINDOW_MS) : [];
    times.push(now);
    if (times.length >= COMBO_PRESSES) {
      comboRef.current = { key: null, times: [] };
      setOverlay(COMBOS[key]);
    } else {
      comboRef.current = { key, times };
    }
  };

  const handleKeyDown = (event) => {
    if (event.key in COMBOS) {
      event.preventDefault();
      // Holding the key down auto-repeats; only count real presses.
      if (!event.repeat) registerComboPress(event.key);
      return;
    }
    if (event.key === 'Escape') {
      setOverlay(null);
      return;
    }
    // Leave browser shortcuts and focus navigation alone.
    if (event.metaKey || event.ctrlKey || event.altKey || event.key === 'Tab') return;
    event.preventDefault();
    advance();
  };

  const chooseSource = (id) => {
    setSourceId(id);
    setShown(0);
    setOverlay(null);
  };

  let placeholder = null;
  if (file instanceof Error) placeholder = `Couldn't load the source: ${file.message}`;
  else if (file === undefined) placeholder = 'Downloading...';
  else if (shown === 0) placeholder = 'Click here (or tap) and start typing.';

  return (
    <div className="space-y-3 text-gray-300">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="min-w-0 flex-1 basis-60 text-xs text-gray-400">
          source
          <select
            value={sourceId}
            onChange={(e) => chooseSource(e.target.value)}
            className="mt-1 block w-full truncate rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
          >
            {SOURCES.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-400">
          characters per key: <span className="font-mono text-gray-200">{charsPerKey}</span>
          <input
            type="range"
            min="1"
            max="30"
            value={charsPerKey}
            onChange={(e) => setCharsPerKey(Number(e.target.value))}
            className="mt-1 block w-40 accent-green-500"
          />
        </label>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          tabIndex={0}
          aria-label={`Terminal: type any keys to write ${source.title}`}
          onKeyDown={handleKeyDown}
          onClick={advance}
          className="h-96 cursor-text overflow-y-auto rounded border border-gray-700 bg-[#272822] focus:border-gray-400 focus:outline-none"
        >
          <pre className="hljs m-0 whitespace-pre-wrap break-words p-3 text-xs sm:text-sm">
            <code dangerouslySetInnerHTML={{ __html: html }} />
            <span className="animate-pulse text-green-400" aria-hidden="true">█</span>
          </pre>
          {placeholder && <p className="px-3 pb-3 text-sm text-gray-400">{placeholder}</p>}
        </div>

        {overlay && (
          <div
            role="alert"
            onClick={() => setOverlay(null)}
            className="absolute inset-0 flex items-center justify-center rounded bg-black/60"
          >
            <div
              className={`animate-pulse border-2 px-6 py-4 text-center font-mono text-2xl font-bold tracking-widest sm:text-4xl ${
                overlay === 'granted'
                  ? 'border-green-500 bg-green-950 text-green-400'
                  : 'border-red-500 bg-red-950 text-red-400'
              }`}
            >
              ACCESS {overlay === 'granted' ? 'GRANTED' : 'DENIED'}
            </div>
          </div>
        )}
      </div>

      <div>
        <div
          role="progressbar"
          aria-label="Progress through the file"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-1.5 overflow-hidden rounded bg-gray-800"
        >
          <div className="h-full bg-green-500 transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="mt-1 flex flex-wrap justify-between gap-x-4 font-mono text-xs text-gray-500">
          <span>
            {finished
              ? 'EOF. Keep typing to start over.'
              : `line ${countLines(typed) || 1} of ${totalLines || '?'} · ${Math.floor(progress * 100)}%`}
          </span>
          <span>
            Alt ×3:{' '}
            <button type="button" className="underline hover:text-gray-300" onClick={() => setOverlay('granted')}>
              granted
            </button>
            {' · '}Caps Lock ×3:{' '}
            <button type="button" className="underline hover:text-gray-300" onClick={() => setOverlay('denied')}>
              denied
            </button>
          </span>
        </p>
      </div>
    </div>
  );
}
