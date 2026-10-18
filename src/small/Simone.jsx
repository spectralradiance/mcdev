/*
 * Simone
 *
 * A Simon-style musical memory game. Each button is one note of a randomly
 * chosen scale and one hue of an evenly spaced rainbow, so you can remember
 * the sequence by sight, by ear, or both. Simone plays a sequence; you repeat
 * it; each success adds one random note and the playback gets a little faster.
 *
 * Pitch: a scale is a list of semitone steps (major is 2 2 1 2 2 2 1). Walking
 * those steps from C3 and converting with f = f0 * 2^(semitones / 12) gives
 * the frequency of every button, wrapping into the next octave as needed, so a
 * 16-button board spans two or three octaves.
 *
 * Modes: in strict mode a wrong note ends the game; in forgiving mode Simone
 * just plays the same sequence again. Your best level for each board size and
 * mode is kept in localStorage.
 *
 * Timing lives in refs, not state: the sequence, your position in it and the
 * current phase are read inside timer callbacks and key handlers, which would
 * otherwise see stale values from the render that created them. State holds
 * only what the screen shows.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'

const SCALES = {
  major: [2, 2, 1, 2, 2, 2, 1],
  'natural minor': [2, 1, 2, 2, 1, 2, 2],
  'harmonic minor': [2, 1, 2, 2, 1, 3, 1],
  'melodic minor': [2, 1, 2, 2, 2, 2, 1],
  'major pentatonic': [2, 2, 3, 2, 3],
  'minor pentatonic': [3, 2, 2, 3, 2],
}

const BOARD_SIZES = [4, 9, 16]
const C3_HZ = 440 * Math.pow(2, (48 - 69) / 12) // MIDI 48 (C3), relative to A4 = 440 Hz

// Keyboard layout: the board's grid mapped onto the left of a QWERTY keyboard
// (QW/AS, QWE/ASD/ZXC, or 1234/QWER/ASDF/ZXCV).
const KEY_ROWS = ['1234', 'qwer', 'asdf', 'zxcv']
function keysFor(size) {
  const side = Math.sqrt(size)
  const rows = side === 4 ? KEY_ROWS : KEY_ROWS.slice(1)
  return rows.slice(0, side).flatMap((row) => [...row.slice(0, side)])
}

const LEAD_IN_MS = 600 // pause before a sequence plays
const NEXT_LEVEL_MS = 700 // pause after you finish a sequence

// Gap between notes in playback: starts relaxed and tightens with each level,
// bottoming out where it's still possible to follow.
const noteGapMs = (level) => Math.max(200, 480 - 20 * (level - 1))

function scaleFrequencies(steps, startHz, count) {
  const out = []
  let semitones = 0
  for (let i = 0; i < count; i++) {
    out.push(startHz * Math.pow(2, semitones / 12))
    semitones += steps[i % steps.length]
  }
  return out
}

const randomInt = (n) => Math.floor(Math.random() * n)
const randomElement = (arr) => arr[randomInt(arr.length)]

function makeBoard(size) {
  const scale = randomElement(Object.keys(SCALES))
  const notes = scaleFrequencies(SCALES[scale], C3_HZ, size)
  const keys = keysFor(size)
  const buttons = notes.map((note, i) => ({ note, hue: Math.round((i / size) * 360), key: keys[i] }))
  return { scale, buttons }
}

const BEST_KEY = 'simone.best'
const bestSlot = (size, strict) => `${size}-${strict ? 'strict' : 'forgiving'}`

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) ?? {}
  } catch {
    return {}
  }
}

function saveBest(best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best))
  } catch {
    // Storage may be full or disabled (private mode); the best score just won't persist.
  }
}

export default function Simone() {
  const [size, setSize] = useState(9)
  const [strict, setStrict] = useState(true)
  const [board, setBoard] = useState(() => makeBoard(9))
  const [phase, setPhase] = useState('idle') // idle | playback | input | over
  const [level, setLevel] = useState(0)
  const [lit, setLit] = useState(-1)
  const [wrong, setWrong] = useState(-1)
  const [message, setMessage] = useState('Watch the sequence, then repeat it.')
  const [best, setBest] = useState(loadBest)

  const synthRef = useRef(null) // Simone's playback, one note at a time
  const userSynthRef = useRef(null) // your presses, which may overlap
  const buzzRef = useRef(null) // wrong-note buzz
  const sequenceRef = useRef([])
  const positionRef = useRef(0)
  const phaseRef = useRef('idle')
  const timersRef = useRef(new Set())
  // The board is read by timer callbacks scheduled before a re-render, so they
  // need the current one, not the one their closure captured.
  const boardRef = useRef(board)

  const goTo = (next) => {
    phaseRef.current = next
    setPhase(next)
  }

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id)
      fn()
    }, ms)
    timersRef.current.add(id)
  }, [])

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id)
    timersRef.current.clear()
  }, [])

  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimers()
      for (const ref of [synthRef, userSynthRef, buzzRef]) {
        ref.current?.dispose()
        ref.current = null
      }
    }
  }, [clearTimers])

  // Light a button and sound its note.
  const flash = useCallback(
    (index, ms, synth) => {
      setLit(index)
      synth?.triggerAttackRelease(boardRef.current.buttons[index].note, (ms * 0.8) / 1000)
      later(() => setLit((current) => (current === index ? -1 : current)), ms * 0.8)
    },
    [later],
  )

  const playSequence = useCallback(() => {
    const sequence = sequenceRef.current
    const gap = noteGapMs(sequence.length)
    goTo('playback')
    sequence.forEach((index, i) => later(() => flash(index, gap, synthRef.current), LEAD_IN_MS + i * gap))
    later(() => {
      positionRef.current = 0
      goTo('input')
    }, LEAD_IN_MS + sequence.length * gap)
  }, [flash, later])

  const recordBest = (completed) => {
    const slot = bestSlot(size, strict)
    setBest((previous) => {
      if ((previous[slot] ?? 0) >= completed) return previous
      const next = { ...previous, [slot]: completed }
      saveBest(next)
      return next
    })
  }

  const showBoard = (nextBoard) => {
    boardRef.current = nextBoard
    setBoard(nextBoard)
  }

  const start = async () => {
    goTo('playback') // lock input until the first sequence has played
    // Audio can only start from a user gesture, so synths are made lazily here.
    await Tone.start()
    if (!mountedRef.current) return // unmounted while audio was starting
    synthRef.current ??= new Tone.Synth().toDestination()
    userSynthRef.current ??= new Tone.PolySynth(Tone.Synth).toDestination()
    buzzRef.current ??= new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, release: 0.2 },
      volume: -10,
    }).toDestination()

    clearTimers()
    setLit(-1)
    setWrong(-1)
    const nextBoard = makeBoard(size) // a fresh random scale every game
    showBoard(nextBoard)
    sequenceRef.current = [randomInt(size)]
    setLevel(1)
    setMessage(`Scale: ${nextBoard.scale}`)
    playSequence()
  }

  const press = (index) => {
    if (phaseRef.current !== 'input') return
    const sequence = sequenceRef.current
    const expected = sequence[positionRef.current]

    if (index === expected) {
      flash(index, 250, userSynthRef.current)
      positionRef.current += 1
      if (positionRef.current === sequence.length) {
        recordBest(sequence.length)
        sequence.push(randomInt(size))
        setLevel(sequence.length)
        goTo('playback')
        later(playSequence, NEXT_LEVEL_MS)
      }
      return
    }

    // A wrong note: buzz, mark it, and show the note that was expected.
    buzzRef.current?.triggerAttackRelease('C2', 0.35)
    setWrong(index)
    later(() => setWrong(-1), 900)
    later(() => flash(expected, 900, null), 300)
    if (strict) {
      const completed = sequence.length - 1
      goTo('over')
      setMessage(`Game over. You completed ${completed} level${completed === 1 ? '' : 's'}.`)
    } else {
      setMessage('Not quite. Listen again.')
      goTo('playback')
      later(() => {
        setMessage(`Scale: ${boardRef.current.scale}`)
        playSequence()
      }, 1200)
    }
  }

  // Keyboard play. A window listener (cleaned up on unmount) so you needn't
  // focus the board first; keys aimed at form controls are left alone.
  const pressRef = useRef(press)
  pressRef.current = press
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.target.closest?.('input, select, textarea')) return
      const index = keysFor(boardRef.current.buttons.length).indexOf(event.key.toLowerCase())
      if (index < 0 || phaseRef.current === 'idle' || phaseRef.current === 'over') return
      event.preventDefault()
      pressRef.current(index)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const changeSize = (nextSize) => {
    setSize(nextSize)
    clearTimers()
    setLit(-1)
    goTo('idle')
    setLevel(0)
    showBoard(makeBoard(nextSize))
    setMessage('Watch the sequence, then repeat it.')
  }

  const side = Math.sqrt(board.buttons.length)
  const bestHere = best[bestSlot(size, strict)] ?? 0
  const playing = phase === 'playback' || phase === 'input'

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-panel px-4 py-6 font-light text-soft">
      <div className="flex w-full flex-wrap items-end justify-center gap-4 text-sm">
        <label className="text-xs text-muted">
          buttons
          <select
            value={size}
            disabled={playing}
            onChange={(e) => changeSize(Number(e.target.value))}
            className="mt-1 block rounded border border-line bg-panel px-2 py-1 text-sm text-soft focus:border-line-strong focus:outline-none disabled:opacity-50"
          >
            {BOARD_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1 text-soft">
          <input
            type="checkbox"
            checked={strict}
            disabled={playing}
            onChange={(e) => setStrict(e.target.checked)}
            className="accent-sky-500"
          />
          strict (a mistake ends the game)
        </label>
      </div>

      <div className="flex gap-6 text-center">
        <div>
          <div className="text-xs text-subtle">level</div>
          <div className="text-2xl text-white tabular-nums">{level || '–'}</div>
        </div>
        <div>
          <div className="text-xs text-subtle">best</div>
          <div className="text-2xl text-white tabular-nums">{bestHere || '–'}</div>
        </div>
      </div>

      <p
        aria-live="polite"
        className={`min-h-6 text-center ${phase === 'over' ? 'text-red-400' : 'text-soft'}`}
      >
        {phase === 'input' ? 'Your turn.' : message}
      </p>

      <div
        className="grid w-[320px] max-w-full touch-manipulation gap-[10px] select-none"
        style={{ gridTemplateColumns: `repeat(${side}, minmax(0, 1fr))` }}
      >
        {board.buttons.map((btn, i) => {
          const isLit = lit === i
          const isWrong = wrong === i
          const color = `hsl(${btn.hue} 100% 50%)`
          return (
            <button
              key={i}
              type="button"
              aria-label={`Note ${i + 1} (key ${btn.key.toUpperCase()})`}
              className={`relative aspect-square w-full rounded-sm transition-all duration-150 ease-out active:translate-y-[2px] ${
                phase === 'input' ? 'cursor-pointer' : 'cursor-default'
              } ${isWrong ? 'ring-4 ring-red-500' : ''}`}
              style={{
                backgroundColor: isLit ? color : `hsl(${btn.hue} 45% 88%)`,
                boxShadow: isLit ? `0 0 18px 2px ${color}` : '0 5px 4px rgba(120,120,120,0.6)',
                transform: isLit ? 'translateY(2px)' : undefined,
              }}
              // Pointer presses act on pointerdown so the note sounds the instant you
              // touch it; detail === 0 means Enter/Space on a focused button.
              onPointerDown={() => press(i)}
              onClick={(e) => e.detail === 0 && press(i)}
            >
              <span className="absolute right-1 bottom-0.5 font-mono text-xs text-faint uppercase">
                {btn.key}
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={start}
        className="rounded border border-line bg-raised px-5 py-2 text-soft hover:bg-strong hover:text-white"
      >
        {phase === 'idle' ? 'Start' : 'New game'}
      </button>
      <p className="text-center text-xs text-subtle">
        Tap the buttons or use the keys shown on them.
      </p>
    </div>
  )
}
