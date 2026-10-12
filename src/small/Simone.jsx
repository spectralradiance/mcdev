import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'

// Simone: a Simon-style musical memory game. Nine buttons, each a note of a
// randomly chosen scale starting at C2 and a hue of an evenly spaced rainbow.
// Repeat the played sequence; each success adds one note, a mistake restarts
// at level 1.

const N_BUTTONS = 9

// Semitone steps between successive scale degrees (as in scale-maker).
const SCALES = {
  major: [2, 2, 1, 2, 2, 2, 1],
  naturalMinor: [2, 1, 2, 2, 1, 2, 2],
  harmonicMinor: [2, 1, 2, 2, 1, 3, 1],
  melodicMinor: [2, 1, 2, 2, 2, 2, 1],
  majorPentatonic: [2, 2, 3, 2, 3],
  minorPentatonic: [3, 2, 2, 3, 2],
}

const C2_HZ = 440 * Math.pow(2, (36 - 69) / 12) // MIDI 36 (C2) relative to A4 = 440 Hz

function makeScale(intervals, startHz, count) {
  const out = []
  let semis = 0
  for (let i = 0; i < count; i++) {
    out.push(startHz * Math.pow(2, semis / 12))
    semis += intervals[i % intervals.length]
  }
  return out
}

// google-palette 'rainbow': n evenly spaced hues at full saturation/value.
function rainbow(n) {
  return Array.from({ length: n }, (_, i) => `hsl(${Math.round((i / n) * 360)}, 100%, 50%)`)
}

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomButtonID() {
  return Math.floor(Math.random() * N_BUTTONS)
}

function generateButtons() {
  const notes = makeScale(SCALES[randomElement(Object.keys(SCALES))], C2_HZ, N_BUTTONS)
  const colors = rainbow(N_BUTTONS)
  return notes.map((note, i) => ({ index: i, color: colors[i], note }))
}

export default function Simone() {
  const [buttons] = useState(generateButtons)
  const [started, setStarted] = useState(false)
  const [level, setLevel] = useState(1)
  const [hovered, setHovered] = useState(-1)
  const [held, setHeld] = useState(-1) // pressed by the user
  const [lit, setLit] = useState(-1) // pressed by autoplay

  const synthRef = useRef(null) // sequence playback
  const userSynthRef = useRef(null) // user presses (may overlap)
  const sequenceRef = useRef([])
  const userPosRef = useRef(0)
  const autoplayPosRef = useRef(-1)
  const timersRef = useRef(new Set())

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id)
      fn()
    }, ms)
    timersRef.current.add(id)
  }, [])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const id of timers) {
        clearTimeout(id)
        clearInterval(id)
      }
      timers.clear()
      synthRef.current?.dispose()
      userSynthRef.current?.dispose()
      synthRef.current = null
      userSynthRef.current = null
    }
  }, [])

  const pressButton = useCallback(
    (index) => {
      setLit(index)
      synthRef.current?.triggerAttackRelease(buttons[index].note, '8n')
      later(() => setLit((l) => (l === index ? -1 : l)), 200)
    },
    [buttons, later],
  )

  const autoplay = useCallback(() => {
    const sequence = sequenceRef.current
    if (autoplayPosRef.current >= 0 || sequence.length === 0) return
    autoplayPosRef.current = 0 // lock out the buttons
    later(() => {
      const interval = setInterval(() => {
        pressButton(sequence[autoplayPosRef.current])
        autoplayPosRef.current += 1
        if (autoplayPosRef.current >= sequence.length) {
          clearInterval(interval)
          timersRef.current.delete(interval)
          autoplayPosRef.current = -1
          userPosRef.current = 0
        }
      }, 300)
      timersRef.current.add(interval)
    }, 500)
  }, [later, pressButton])

  const start = async () => {
    await Tone.start()
    if (!synthRef.current) synthRef.current = new Tone.Synth().toDestination()
    if (!userSynthRef.current) userSynthRef.current = new Tone.PolySynth(Tone.Synth).toDestination()
    sequenceRef.current = [randomButtonID()]
    userPosRef.current = 0
    setLevel(1)
    setStarted(true)
    autoplay()
  }

  const onPointerDown = (btn) => {
    setHeld(btn.index)
    userSynthRef.current?.triggerAttackRelease(btn.note, '8n')
  }

  const onClick = (btn) => {
    if (!started || autoplayPosRef.current >= 0) return
    const sequence = sequenceRef.current
    if (btn.index === sequence[userPosRef.current]) {
      userPosRef.current += 1
      if (userPosRef.current >= sequence.length) {
        userPosRef.current = 0
        sequence.push(randomButtonID())
        setLevel(sequence.length)
        autoplay()
      }
    } else {
      userPosRef.current = 0
      sequenceRef.current = [randomButtonID()]
      setLevel(1)
      autoplay()
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-gray-700 bg-gray-900 px-4 py-6 font-light text-gray-300">
      <div className="h-6 text-center text-lg">
        {started ? `Level ${level}` : 'Watch the sequence, then repeat it.'}
      </div>

      <div className="grid w-[320px] max-w-full touch-manipulation grid-cols-3 gap-[10px] select-none">
        {buttons.map((btn) => {
          const isLit = lit === btn.index
          const isHeld = held === btn.index
          const colored = isLit || hovered === btn.index
          return (
            <div
              key={btn.index}
              role="button"
              aria-label={`Note ${btn.index + 1}`}
              className="mx-auto aspect-square w-full max-w-[100px] cursor-pointer rounded-sm transition-all duration-200 ease-in-out active:translate-y-[2px]"
              style={{
                backgroundColor: colored ? btn.color : 'white',
                filter:
                  isLit || isHeld
                    ? `drop-shadow(0px 0px 2px ${btn.color})`
                    : 'drop-shadow(0px 5px 4px rgba(120,120,120,0.6))',
                transform: isLit ? 'translateY(2px)' : undefined,
              }}
              onPointerEnter={() => setHovered(btn.index)}
              onPointerLeave={() => {
                setHovered(-1)
                setHeld(-1)
              }}
              onPointerDown={() => onPointerDown(btn)}
              onPointerUp={() => setHeld(-1)}
              onClick={() => onClick(btn)}
            />
          )
        })}
      </div>

      {!started && (
        <button
          type="button"
          onClick={start}
          className="rounded border border-gray-700 bg-gray-800 px-5 py-2 text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          Start
        </button>
      )}
    </div>
  )
}
