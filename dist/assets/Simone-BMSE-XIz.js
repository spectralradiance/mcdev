var e=`/*\r
 * Simone\r
 *\r
 * A Simon-style musical memory game. Each button is one note of a randomly\r
 * chosen scale and one hue of an evenly spaced rainbow, so you can remember\r
 * the sequence by sight, by ear, or both. Simone plays a sequence; you repeat\r
 * it; each success adds one random note and the playback gets a little faster.\r
 *\r
 * Pitch: a scale is a list of semitone steps (major is 2 2 1 2 2 2 1). Walking\r
 * those steps from C3 and converting with f = f0 * 2^(semitones / 12) gives\r
 * the frequency of every button, wrapping into the next octave as needed, so a\r
 * 16-button board spans two or three octaves.\r
 *\r
 * Modes: in strict mode a wrong note ends the game; in forgiving mode Simone\r
 * just plays the same sequence again. Your best level for each board size and\r
 * mode is kept in localStorage.\r
 *\r
 * Timing lives in refs, not state: the sequence, your position in it and the\r
 * current phase are read inside timer callbacks and key handlers, which would\r
 * otherwise see stale values from the render that created them. State holds\r
 * only what the screen shows.\r
 */\r
import { useCallback, useEffect, useRef, useState } from 'react'\r
import * as Tone from 'tone'\r
\r
const SCALES = {\r
  major: [2, 2, 1, 2, 2, 2, 1],\r
  'natural minor': [2, 1, 2, 2, 1, 2, 2],\r
  'harmonic minor': [2, 1, 2, 2, 1, 3, 1],\r
  'melodic minor': [2, 1, 2, 2, 2, 2, 1],\r
  'major pentatonic': [2, 2, 3, 2, 3],\r
  'minor pentatonic': [3, 2, 2, 3, 2],\r
}\r
\r
const BOARD_SIZES = [4, 9, 16]\r
const C3_HZ = 440 * Math.pow(2, (48 - 69) / 12) // MIDI 48 (C3), relative to A4 = 440 Hz\r
\r
// Keyboard layout: the board's grid mapped onto the left of a QWERTY keyboard\r
// (QW/AS, QWE/ASD/ZXC, or 1234/QWER/ASDF/ZXCV).\r
const KEY_ROWS = ['1234', 'qwer', 'asdf', 'zxcv']\r
function keysFor(size) {\r
  const side = Math.sqrt(size)\r
  const rows = side === 4 ? KEY_ROWS : KEY_ROWS.slice(1)\r
  return rows.slice(0, side).flatMap((row) => [...row.slice(0, side)])\r
}\r
\r
const LEAD_IN_MS = 600 // pause before a sequence plays\r
const NEXT_LEVEL_MS = 700 // pause after you finish a sequence\r
\r
// Gap between notes in playback: starts relaxed and tightens with each level,\r
// bottoming out where it's still possible to follow.\r
const noteGapMs = (level) => Math.max(200, 480 - 20 * (level - 1))\r
\r
function scaleFrequencies(steps, startHz, count) {\r
  const out = []\r
  let semitones = 0\r
  for (let i = 0; i < count; i++) {\r
    out.push(startHz * Math.pow(2, semitones / 12))\r
    semitones += steps[i % steps.length]\r
  }\r
  return out\r
}\r
\r
const randomInt = (n) => Math.floor(Math.random() * n)\r
const randomElement = (arr) => arr[randomInt(arr.length)]\r
\r
function makeBoard(size) {\r
  const scale = randomElement(Object.keys(SCALES))\r
  const notes = scaleFrequencies(SCALES[scale], C3_HZ, size)\r
  const keys = keysFor(size)\r
  const buttons = notes.map((note, i) => ({ note, hue: Math.round((i / size) * 360), key: keys[i] }))\r
  return { scale, buttons }\r
}\r
\r
const BEST_KEY = 'simone.best'\r
const bestSlot = (size, strict) => \`\${size}-\${strict ? 'strict' : 'forgiving'}\`\r
\r
function loadBest() {\r
  try {\r
    return JSON.parse(localStorage.getItem(BEST_KEY)) ?? {}\r
  } catch {\r
    return {}\r
  }\r
}\r
\r
function saveBest(best) {\r
  try {\r
    localStorage.setItem(BEST_KEY, JSON.stringify(best))\r
  } catch {\r
    // Storage may be full or disabled (private mode); the best score just won't persist.\r
  }\r
}\r
\r
export default function Simone() {\r
  const [size, setSize] = useState(9)\r
  const [strict, setStrict] = useState(true)\r
  const [board, setBoard] = useState(() => makeBoard(9))\r
  const [phase, setPhase] = useState('idle') // idle | playback | input | over\r
  const [level, setLevel] = useState(0)\r
  const [lit, setLit] = useState(-1)\r
  const [wrong, setWrong] = useState(-1)\r
  const [message, setMessage] = useState('Watch the sequence, then repeat it.')\r
  const [best, setBest] = useState(loadBest)\r
\r
  const synthRef = useRef(null) // Simone's playback, one note at a time\r
  const userSynthRef = useRef(null) // your presses, which may overlap\r
  const buzzRef = useRef(null) // wrong-note buzz\r
  const sequenceRef = useRef([])\r
  const positionRef = useRef(0)\r
  const phaseRef = useRef('idle')\r
  const timersRef = useRef(new Set())\r
  // The board is read by timer callbacks scheduled before a re-render, so they\r
  // need the current one, not the one their closure captured.\r
  const boardRef = useRef(board)\r
\r
  const goTo = (next) => {\r
    phaseRef.current = next\r
    setPhase(next)\r
  }\r
\r
  const later = useCallback((fn, ms) => {\r
    const id = setTimeout(() => {\r
      timersRef.current.delete(id)\r
      fn()\r
    }, ms)\r
    timersRef.current.add(id)\r
  }, [])\r
\r
  const clearTimers = useCallback(() => {\r
    for (const id of timersRef.current) clearTimeout(id)\r
    timersRef.current.clear()\r
  }, [])\r
\r
  const mountedRef = useRef(false)\r
  useEffect(() => {\r
    mountedRef.current = true\r
    return () => {\r
      mountedRef.current = false\r
      clearTimers()\r
      for (const ref of [synthRef, userSynthRef, buzzRef]) {\r
        ref.current?.dispose()\r
        ref.current = null\r
      }\r
    }\r
  }, [clearTimers])\r
\r
  // Light a button and sound its note.\r
  const flash = useCallback(\r
    (index, ms, synth) => {\r
      setLit(index)\r
      synth?.triggerAttackRelease(boardRef.current.buttons[index].note, (ms * 0.8) / 1000)\r
      later(() => setLit((current) => (current === index ? -1 : current)), ms * 0.8)\r
    },\r
    [later],\r
  )\r
\r
  const playSequence = useCallback(() => {\r
    const sequence = sequenceRef.current\r
    const gap = noteGapMs(sequence.length)\r
    goTo('playback')\r
    sequence.forEach((index, i) => later(() => flash(index, gap, synthRef.current), LEAD_IN_MS + i * gap))\r
    later(() => {\r
      positionRef.current = 0\r
      goTo('input')\r
    }, LEAD_IN_MS + sequence.length * gap)\r
  }, [flash, later])\r
\r
  const recordBest = (completed) => {\r
    const slot = bestSlot(size, strict)\r
    setBest((previous) => {\r
      if ((previous[slot] ?? 0) >= completed) return previous\r
      const next = { ...previous, [slot]: completed }\r
      saveBest(next)\r
      return next\r
    })\r
  }\r
\r
  const showBoard = (nextBoard) => {\r
    boardRef.current = nextBoard\r
    setBoard(nextBoard)\r
  }\r
\r
  const start = async () => {\r
    goTo('playback') // lock input until the first sequence has played\r
    // Audio can only start from a user gesture, so synths are made lazily here.\r
    await Tone.start()\r
    if (!mountedRef.current) return // unmounted while audio was starting\r
    synthRef.current ??= new Tone.Synth().toDestination()\r
    userSynthRef.current ??= new Tone.PolySynth(Tone.Synth).toDestination()\r
    buzzRef.current ??= new Tone.Synth({\r
      oscillator: { type: 'sawtooth' },\r
      envelope: { attack: 0.01, release: 0.2 },\r
      volume: -10,\r
    }).toDestination()\r
\r
    clearTimers()\r
    setLit(-1)\r
    setWrong(-1)\r
    const nextBoard = makeBoard(size) // a fresh random scale every game\r
    showBoard(nextBoard)\r
    sequenceRef.current = [randomInt(size)]\r
    setLevel(1)\r
    setMessage(\`Scale: \${nextBoard.scale}\`)\r
    playSequence()\r
  }\r
\r
  const press = (index) => {\r
    if (phaseRef.current !== 'input') return\r
    const sequence = sequenceRef.current\r
    const expected = sequence[positionRef.current]\r
\r
    if (index === expected) {\r
      flash(index, 250, userSynthRef.current)\r
      positionRef.current += 1\r
      if (positionRef.current === sequence.length) {\r
        recordBest(sequence.length)\r
        sequence.push(randomInt(size))\r
        setLevel(sequence.length)\r
        goTo('playback')\r
        later(playSequence, NEXT_LEVEL_MS)\r
      }\r
      return\r
    }\r
\r
    // A wrong note: buzz, mark it, and show the note that was expected.\r
    buzzRef.current?.triggerAttackRelease('C2', 0.35)\r
    setWrong(index)\r
    later(() => setWrong(-1), 900)\r
    later(() => flash(expected, 900, null), 300)\r
    if (strict) {\r
      const completed = sequence.length - 1\r
      goTo('over')\r
      setMessage(\`Game over. You completed \${completed} level\${completed === 1 ? '' : 's'}.\`)\r
    } else {\r
      setMessage('Not quite. Listen again.')\r
      goTo('playback')\r
      later(() => {\r
        setMessage(\`Scale: \${boardRef.current.scale}\`)\r
        playSequence()\r
      }, 1200)\r
    }\r
  }\r
\r
  // Keyboard play. A window listener (cleaned up on unmount) so you needn't\r
  // focus the board first; keys aimed at form controls are left alone.\r
  const pressRef = useRef(press)\r
  pressRef.current = press\r
  useEffect(() => {\r
    const onKeyDown = (event) => {\r
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return\r
      if (event.target.closest?.('input, select, textarea')) return\r
      const index = keysFor(boardRef.current.buttons.length).indexOf(event.key.toLowerCase())\r
      if (index < 0 || phaseRef.current === 'idle' || phaseRef.current === 'over') return\r
      event.preventDefault()\r
      pressRef.current(index)\r
    }\r
    window.addEventListener('keydown', onKeyDown)\r
    return () => window.removeEventListener('keydown', onKeyDown)\r
  }, [])\r
\r
  const changeSize = (nextSize) => {\r
    setSize(nextSize)\r
    clearTimers()\r
    setLit(-1)\r
    goTo('idle')\r
    setLevel(0)\r
    showBoard(makeBoard(nextSize))\r
    setMessage('Watch the sequence, then repeat it.')\r
  }\r
\r
  const side = Math.sqrt(board.buttons.length)\r
  const bestHere = best[bestSlot(size, strict)] ?? 0\r
  const playing = phase === 'playback' || phase === 'input'\r
\r
  return (\r
    <div className="flex flex-col items-center gap-4 rounded-lg border border-gray-700 bg-gray-900 px-4 py-6 font-light text-gray-300">\r
      <div className="flex w-full flex-wrap items-end justify-center gap-4 text-sm">\r
        <label className="text-xs text-gray-400">\r
          buttons\r
          <select\r
            value={size}\r
            disabled={playing}\r
            onChange={(e) => changeSize(Number(e.target.value))}\r
            className="mt-1 block rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-gray-200 focus:border-gray-500 focus:outline-none disabled:opacity-50"\r
          >\r
            {BOARD_SIZES.map((n) => (\r
              <option key={n} value={n}>{n}</option>\r
            ))}\r
          </select>\r
        </label>\r
        <label className="flex items-center gap-2 pb-1 text-gray-300">\r
          <input\r
            type="checkbox"\r
            checked={strict}\r
            disabled={playing}\r
            onChange={(e) => setStrict(e.target.checked)}\r
            className="accent-sky-500"\r
          />\r
          strict (a mistake ends the game)\r
        </label>\r
      </div>\r
\r
      <div className="flex gap-6 text-center">\r
        <div>\r
          <div className="text-xs text-gray-500">level</div>\r
          <div className="text-2xl text-white tabular-nums">{level || '–'}</div>\r
        </div>\r
        <div>\r
          <div className="text-xs text-gray-500">best</div>\r
          <div className="text-2xl text-white tabular-nums">{bestHere || '–'}</div>\r
        </div>\r
      </div>\r
\r
      <p\r
        aria-live="polite"\r
        className={\`min-h-6 text-center \${phase === 'over' ? 'text-red-400' : 'text-gray-300'}\`}\r
      >\r
        {phase === 'input' ? 'Your turn.' : message}\r
      </p>\r
\r
      <div\r
        className="grid w-[320px] max-w-full touch-manipulation gap-[10px] select-none"\r
        style={{ gridTemplateColumns: \`repeat(\${side}, minmax(0, 1fr))\` }}\r
      >\r
        {board.buttons.map((btn, i) => {\r
          const isLit = lit === i\r
          const isWrong = wrong === i\r
          const color = \`hsl(\${btn.hue} 100% 50%)\`\r
          return (\r
            <button\r
              key={i}\r
              type="button"\r
              aria-label={\`Note \${i + 1} (key \${btn.key.toUpperCase()})\`}\r
              className={\`relative aspect-square w-full rounded-sm transition-all duration-150 ease-out active:translate-y-[2px] \${\r
                phase === 'input' ? 'cursor-pointer' : 'cursor-default'\r
              } \${isWrong ? 'ring-4 ring-red-500' : ''}\`}\r
              style={{\r
                backgroundColor: isLit ? color : \`hsl(\${btn.hue} 45% 88%)\`,\r
                boxShadow: isLit ? \`0 0 18px 2px \${color}\` : '0 5px 4px rgba(120,120,120,0.6)',\r
                transform: isLit ? 'translateY(2px)' : undefined,\r
              }}\r
              // Pointer presses act on pointerdown so the note sounds the instant you\r
              // touch it; detail === 0 means Enter/Space on a focused button.\r
              onPointerDown={() => press(i)}\r
              onClick={(e) => e.detail === 0 && press(i)}\r
            >\r
              <span className="absolute right-1 bottom-0.5 font-mono text-xs text-gray-600 uppercase">\r
                {btn.key}\r
              </span>\r
            </button>\r
          )\r
        })}\r
      </div>\r
\r
      <button\r
        type="button"\r
        onClick={start}\r
        className="rounded border border-gray-700 bg-gray-800 px-5 py-2 text-gray-300 hover:bg-gray-700 hover:text-white"\r
      >\r
        {phase === 'idle' ? 'Start' : 'New game'}\r
      </button>\r
      <p className="text-center text-xs text-gray-500">\r
        Tap the buttons or use the keys shown on them.\r
      </p>\r
    </div>\r
  )\r
}\r
`;export{e as default};