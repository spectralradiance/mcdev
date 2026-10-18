/*
 * Go / No-Go
 *
 * Press when you see the green circle; hold still for the red square. It is a classic
 * measure of response inhibition and attention. It's here as a mirror, not a workout: it
 * shows your reaction time and how often you slip, and training it has not been shown to
 * improve attention in daily life. Your speed also varies with sleep, caffeine and the
 * time of day, which is more interesting than the number itself.
 *
 * A block is 60 trials, three in four "go". Each stimulus stays up for 700 ms and a press
 * during that window counts; the gap before the next one is random (0.6 to 1.2 s), so you
 * can't settle into a beat. Reaction times are measured from the frame the stimulus is
 * painted, using performance.now() and a double requestAnimationFrame so the clock starts
 * after the browser has actually drawn it. Timing lives in refs and state holds only what
 * the screen shows, as in Simone.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { makeTrials, summarize } from './goNoGoTrials'

const TRIALS = 60
const SHOW_MS = 700
const BEST_KEY = 'gonogo.best'

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) ?? null
  } catch {
    return null
  }
}

export default function GoNoGo() {
  const [phase, setPhase] = useState('idle') // idle | running | done
  const [stimulus, setStimulus] = useState(null) // 'go' | 'nogo' | null
  const [progress, setProgress] = useState(0)
  const [summary, setSummary] = useState(null)
  const [best, setBest] = useState(loadBest)

  const trialsRef = useRef([])
  const resultsRef = useRef([])
  const indexRef = useRef(0)
  const shownAtRef = useRef(0)
  const respondedRef = useRef(false)
  const stimulusRef = useRef(null)
  const timersRef = useRef(new Set())
  const frameRef = useRef(0)

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id)
      fn()
    }, ms)
    timersRef.current.add(id)
  }, [])

  const clearAll = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id)
    timersRef.current.clear()
    cancelAnimationFrame(frameRef.current)
  }, [])

  useEffect(() => clearAll, [clearAll])

  const finish = useCallback(() => {
    const result = summarize(resultsRef.current)
    setSummary(result)
    setStimulus(null)
    setPhase('done')
    setBest((previous) => {
      // Rank by fewest mistakes, then fastest.
      const errors = result.omissions + result.commissions
      const better = !previous || errors < previous.errors || (errors === previous.errors && result.meanRt < previous.meanRt)
      if (!better || result.meanRt === null) return previous
      const next = { errors, meanRt: result.meanRt }
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(next))
      } catch {
        // Best just won't persist.
      }
      return next
    })
  }, [])

  const nextTrial = useCallback(() => {
    const i = indexRef.current
    if (i >= TRIALS) {
      finish()
      return
    }
    const kind = trialsRef.current[i]
    respondedRef.current = false
    stimulusRef.current = kind
    setProgress(i + 1)
    setStimulus(kind)
    // Start the clock on the frame after the stimulus is painted.
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        shownAtRef.current = performance.now()
      })
    })
    later(() => {
      if (!respondedRef.current) resultsRef.current.push({ kind, rt: null })
      indexRef.current += 1
      stimulusRef.current = null
      setStimulus(null)
      later(nextTrial, 600 + Math.random() * 600)
    }, SHOW_MS)
  }, [finish, later])

  const start = () => {
    clearAll()
    trialsRef.current = makeTrials(TRIALS)
    resultsRef.current = []
    indexRef.current = 0
    setSummary(null)
    setProgress(0)
    setPhase('running')
    later(nextTrial, 1000)
  }

  const respond = useCallback(() => {
    if (!stimulusRef.current || respondedRef.current || !shownAtRef.current) return
    respondedRef.current = true
    const rt = Math.round(performance.now() - shownAtRef.current)
    resultsRef.current.push({ kind: stimulusRef.current, rt })
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== 'Space' || event.repeat) return
      if (event.target.closest?.('button, input, select, textarea')) return
      event.preventDefault()
      respond()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [respond])

  const total = summary ? summary.omissions + summary.commissions : 0

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-gray-700 bg-gray-900 px-4 py-6 font-light text-gray-300">
      <p className="text-center text-sm text-gray-400">
        Press <span className="text-green-400">space or tap</span> for the circle. Do nothing for the{' '}
        <span className="text-red-400">square</span>.
      </p>

      <div
        role="button"
        tabIndex={-1}
        aria-label="Response area"
        onPointerDown={phase === 'running' ? respond : undefined}
        className="flex h-56 w-full max-w-sm touch-manipulation items-center justify-center rounded-lg border border-gray-700 bg-gray-950 select-none"
      >
        {stimulus === 'go' && <div className="h-24 w-24 rounded-full bg-green-500" />}
        {stimulus === 'nogo' && <div className="h-24 w-24 rounded-sm bg-red-500" />}
        {phase === 'running' && !stimulus && <div className="h-2 w-2 rounded-full bg-gray-600" />}
        {phase === 'idle' && <p className="text-gray-500">{TRIALS} trials, about 2 minutes</p>}
        {phase === 'done' && summary && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-gray-500">mean reaction</dt>
            <dd className="text-white tabular-nums">{summary.meanRt ?? '–'} ms</dd>
            <dt className="text-gray-500">variability (SD)</dt>
            <dd className="text-white tabular-nums">{summary.sdRt ?? '–'} ms</dd>
            <dt className="text-gray-500">missed circles</dt>
            <dd className="text-white tabular-nums">{summary.omissions} of {summary.goTrials}</dd>
            <dt className="text-gray-500">pressed on square</dt>
            <dd className="text-white tabular-nums">{summary.commissions} of {summary.noGoTrials}</dd>
          </dl>
        )}
      </div>

      <div className="h-4 text-xs text-gray-500 tabular-nums">
        {phase === 'running' && `${progress} / ${TRIALS}`}
        {phase === 'done' && `${total} mistake${total === 1 ? '' : 's'}`}
        {phase === 'idle' && best && `best: ${best.errors} mistakes, ${best.meanRt} ms`}
      </div>

      <button
        type="button"
        onClick={start}
        disabled={phase === 'running'}
        className="rounded border border-gray-700 bg-gray-800 px-5 py-2 text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50"
      >
        {phase === 'idle' ? 'Start' : 'Go again'}
      </button>
      <p className="max-w-md text-center text-xs text-gray-500">
        Pressing on the square is the number to watch: it is the slip that this task is built to
        catch. Compare yourself with yourself on a different day, not with anyone else.
      </p>
    </div>
  )
}
