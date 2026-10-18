var e=`/*
 * Breathe
 *
 * A paced-breathing guide: a circle swells while you breathe in and shrinks while you breathe
 * out. Slow breathing at roughly six breaths a minute is the best-supported relaxation
 * technique among the games in this set (it is what heart-rate-variability biofeedback
 * trains), though the trials are small and varied. This is a pacer, not a measurement:
 * it can't see your heart rate.
 *
 * The animation is computed from the clock, not from accumulated frames: each frame turns
 * the time since the session started into a position in the breath cycle, so the circle
 * can't drift if a frame is dropped. A cycle is inhale, then exhale; the exhale can be
 * longer than the inhale, which many protocols prefer. Easing with a cosine makes the
 * turnarounds soft.
 */
import { useEffect, useRef, useState } from 'react'

const DURATIONS = [1, 3, 5, 10] // minutes
const RATIOS = { even: 0.5, 'longer exhale': 0.4 } // inhale's share of a breath

// Where in the breath you are: which phase, and how full the lungs are (0 to 1).
function breathAt(elapsedMs, perMinute, inhaleShare) {
  const cycle = 60000 / perMinute
  const t = (elapsedMs % cycle) / cycle
  if (t < inhaleShare) return { phase: 'Breathe in', fill: ease(t / inhaleShare) }
  return { phase: 'Breathe out', fill: 1 - ease((t - inhaleShare) / (1 - inhaleShare)) }
}

const ease = (x) => (1 - Math.cos(Math.PI * x)) / 2

export default function Breathe() {
  const [perMinute, setPerMinute] = useState(6)
  const [ratio, setRatio] = useState('longer exhale')
  const [minutes, setMinutes] = useState(3)
  const [running, setRunning] = useState(false)
  const [label, setLabel] = useState('Ready when you are')
  const [remaining, setRemaining] = useState(null)
  const orb = useRef(null)

  useEffect(() => {
    if (!running) return undefined
    const start = performance.now()
    const total = minutes * 60000
    let frame = 0
    let lastPhase = ''
    let lastSecond = -1

    const tick = (now) => {
      const elapsed = now - start
      if (elapsed >= total) {
        setRunning(false)
        setLabel('Done. Notice how you feel.')
        setRemaining(null)
        if (orb.current) orb.current.style.transform = 'scale(0.4)'
        return
      }
      const { phase, fill } = breathAt(elapsed, perMinute, RATIOS[ratio])
      if (orb.current) orb.current.style.transform = \`scale(\${0.4 + 0.6 * fill})\`
      if (phase !== lastPhase) {
        lastPhase = phase
        setLabel(phase)
      }
      const second = Math.ceil((total - elapsed) / 1000)
      if (second !== lastSecond) {
        lastSecond = second
        setRemaining(second)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, perMinute, ratio, minutes])

  const toggle = () => {
    if (running) {
      setRunning(false)
      setLabel('Paused')
      setRemaining(null)
    } else {
      setRunning(true)
    }
  }

  const clock = remaining == null ? '' : \`\${Math.floor(remaining / 60)}:\${String(remaining % 60).padStart(2, '0')}\`
  const select = 'mt-1 block rounded border border-line bg-panel px-2 py-1 text-sm text-soft focus:border-line-strong focus:outline-none disabled:opacity-50'

  return (
    <div className="flex flex-col items-center gap-5 rounded-lg border border-line bg-panel px-4 py-6 font-light text-soft">
      <div className="flex w-full flex-wrap items-end justify-center gap-4 text-sm">
        <label className="text-xs text-muted">
          breaths per minute: {perMinute}
          <input
            type="range"
            min="4"
            max="8"
            step="0.5"
            value={perMinute}
            disabled={running}
            onChange={(e) => setPerMinute(Number(e.target.value))}
            className="mt-2 block w-40 accent-teal-400"
          />
        </label>
        <label className="text-xs text-muted">
          rhythm
          <select value={ratio} disabled={running} onChange={(e) => setRatio(e.target.value)} className={select}>
            {Object.keys(RATIOS).map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          session
          <select value={minutes} disabled={running} onChange={(e) => setMinutes(Number(e.target.value))} className={select}>
            {DURATIONS.map((n) => <option key={n} value={n}>{n} min</option>)}
          </select>
        </label>
      </div>

      <div className="flex h-64 w-64 items-center justify-center" aria-hidden="true">
        <div
          ref={orb}
          className="h-64 w-64 rounded-full"
          style={{
            transform: 'scale(0.4)',
            background: 'radial-gradient(circle at 40% 35%, #99f6e4, #0f766e 70%, #134e4a)',
            boxShadow: '0 0 60px 8px rgba(45, 212, 191, 0.25)',
          }}
        />
      </div>

      <p aria-live="polite" className="min-h-7 text-xl text-white">{label}</p>
      <p className="-mt-3 h-4 text-xs tabular-nums text-subtle">{clock}</p>

      <button
        type="button"
        onClick={toggle}
        className="rounded border border-line bg-raised px-5 py-2 text-soft hover:bg-strong hover:text-white"
      >
        {running ? 'Pause' : 'Begin'}
      </button>
      <p className="max-w-md text-center text-xs text-subtle">
        Breathe through your nose, low and easy; let the circle set the pace. Stop if you feel dizzy.
        This helps you relax a little; it is not a treatment for anxiety.
      </p>
    </div>
  )
}
`;export{e as default};