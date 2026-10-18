/*
 * Breakout
 *
 * A bat, a ball and a wall of bricks. Nobody has tested whether a game this simple does
 * anything for your brain, so it makes no claim; it is here because a minute of easy, absorbing
 * play is pleasant. Calm mode slows the ball and takes away lives, so you can just keep
 * bouncing.
 *
 * The rules live in breakoutRules.js and are tested without a browser. This file draws the state
 * to a canvas and feeds in input. The canvas is a fixed 480 x 360 logical size, scaled by CSS
 * with pixelated rendering for the retro look. The game runs in a ref, advanced once per
 * animation frame by the time since the last one (capped, so a backgrounded tab doesn't
 * teleport the ball); React state holds only the score line.
 */
import { useEffect, useRef, useState } from 'react'
import { H, PADDLE, ROW_HUES, W, BALL_R, brickSize, createGame, launch, step } from './breakoutRules'

const CALM_KEY = 'breakout.calm'

function loadCalm() {
  try {
    return localStorage.getItem(CALM_KEY) === 'true'
  } catch {
    return false
  }
}

function draw(ctx, g) {
  ctx.fillStyle = '#05070d'
  ctx.fillRect(0, 0, W, H)
  for (const b of g.bricks) {
    if (!b.alive) continue
    const hue = ROW_HUES[b.row]
    ctx.fillStyle = `hsl(${hue} 80% 55%)`
    ctx.fillRect(b.x, b.y, brickSize.w, brickSize.h)
    ctx.fillStyle = `hsl(${hue} 80% 75%)` // top highlight, for a chunky pixel look
    ctx.fillRect(b.x, b.y, brickSize.w, 2)
  }
  ctx.fillStyle = '#e5e7eb'
  ctx.fillRect(g.paddleX - PADDLE.w / 2, PADDLE.y, PADDLE.w, PADDLE.h)
  ctx.fillRect(Math.round(g.ball.x - BALL_R), Math.round(g.ball.y - BALL_R), BALL_R * 2, BALL_R * 2)
}

export default function Breakout() {
  const [calm, setCalm] = useState(loadCalm)
  const [round, setRound] = useState(0) // bumped to restart
  const [hud, setHud] = useState({ score: 0, lives: 3, state: 'ready' })
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const inputRef = useRef({ target: null, dir: 0 })
  const keysRef = useRef(new Set())

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const game = createGame({ calm })
    gameRef.current = game
    inputRef.current = { target: null, dir: 0 }
    let last = performance.now()
    let frame = 0
    let shown = ''

    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.033)
      last = now
      step(game, dt, inputRef.current)
      inputRef.current.target = null // a pointer position applies once, then keys take over
      draw(ctx, game)
      const key = `${game.score}|${game.lives}|${game.state}`
      if (key !== shown) {
        shown = key
        setHud({ score: game.score, lives: game.lives, state: game.state })
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [calm, round])

  useEffect(() => {
    const sync = () => {
      const keys = keysRef.current
      inputRef.current.dir = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0)
    }
    const side = (key) => (key === 'ArrowLeft' || key === 'a' ? 'left' : key === 'ArrowRight' || key === 'd' ? 'right' : null)
    const onDown = (event) => {
      if (event.target.closest?.('input, select, textarea')) return
      if (event.key === ' ') {
        if (event.target.closest?.('button')) return
        event.preventDefault()
        launch(gameRef.current)
        return
      }
      const dir = side(event.key)
      if (!dir) return
      event.preventDefault()
      keysRef.current.add(dir)
      sync()
    }
    const onUp = (event) => {
      const dir = side(event.key)
      if (!dir) return
      keysRef.current.delete(dir)
      sync()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  const aim = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    inputRef.current.target = ((event.clientX - rect.left) / rect.width) * W
  }

  const toggleCalm = (checked) => {
    setCalm(checked)
    try {
      localStorage.setItem(CALM_KEY, String(checked))
    } catch {
      // Preference just won't persist.
    }
  }

  const finished = hud.state === 'won' || hud.state === 'lost'
  const status = {
    ready: 'Move to aim, then tap or press space to serve.',
    playing: '',
    won: 'Wall cleared!',
    lost: 'Out of lives.',
  }[hud.state]

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-panel px-4 py-6 font-light text-soft">
      <div className="flex items-center gap-6 text-sm">
        <label className="flex items-center gap-2 text-soft">
          <input type="checkbox" checked={calm} onChange={(e) => toggleCalm(e.target.checked)} className="accent-teal-400" />
          calm mode (slower, no lives)
        </label>
        <button
          type="button"
          onClick={() => setRound((r) => r + 1)}
          className="rounded border border-line bg-raised px-3 py-1 text-soft hover:bg-strong hover:text-white"
        >
          {finished ? 'Play again' : 'Restart'}
        </button>
      </div>

      <div className="flex gap-6 font-mono text-sm tabular-nums text-muted">
        <span>SCORE {String(hud.score).padStart(4, '0')}</span>
        <span>{calm ? 'LIVES ∞' : `LIVES ${hud.lives}`}</span>
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        aria-label="Breakout game"
        onPointerMove={aim}
        onPointerDown={(event) => {
          aim(event)
          launch(gameRef.current)
        }}
        className="w-full max-w-[480px] touch-none rounded border border-line"
        style={{ imageRendering: 'pixelated', aspectRatio: `${W} / ${H}` }}
      />

      <p aria-live="polite" className="min-h-6 text-center text-teal-300">{status}</p>
      <p className="text-center text-xs text-subtle">Mouse or touch to move; arrow keys or A / D also work.</p>
    </div>
  )
}
