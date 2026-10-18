import { describe, expect, it } from 'vitest'
import { BALL_R, H, PADDLE, createGame, launch, step } from './breakoutRules'

describe('breakout', () => {
  it('serves the ball from the paddle and follows it until launched', () => {
    const g = createGame()
    step(g, 0.016, { target: 100 })
    expect(g.ball.x).toBe(100)
    expect(g.state).toBe('ready')
    launch(g, () => 0.5)
    expect(g.state).toBe('playing')
    expect(g.ball.vy).toBeLessThan(0)
  })

  it('breaks a brick hit from below and bounces down', () => {
    const g = createGame()
    const brick = g.bricks[g.bricks.length - 1]
    g.state = 'playing'
    g.ball = { x: brick.x + 20, y: brick.y + 14 + BALL_R + 2, vx: 0, vy: -200 }
    step(g, 0.05)
    expect(brick.alive).toBe(false)
    expect(g.ball.vy).toBeGreaterThan(0)
    expect(g.score).toBeGreaterThan(0)
  })

  it('bounces off the paddle, angled by where it lands', () => {
    const g = createGame()
    g.state = 'playing'
    g.paddleX = 200
    g.ball = { x: 200 + PADDLE.w / 2 - 2, y: PADDLE.y - BALL_R - 1, vx: 0, vy: 200 }
    step(g, 0.016)
    expect(g.ball.vy).toBeLessThan(0)
    expect(g.ball.vx).toBeGreaterThan(0)
  })

  it('costs a life when the ball falls, and ends the game on the last one', () => {
    const g = createGame()
    g.paddleX = 40
    g.state = 'playing'
    g.ball = { x: 400, y: H + BALL_R + 1, vx: 0, vy: 100 }
    step(g, 0.016)
    expect(g.lives).toBe(2)
    expect(g.state).toBe('ready')
    g.lives = 1
    g.state = 'playing'
    g.ball = { x: 400, y: H + BALL_R + 1, vx: 0, vy: 100 }
    step(g, 0.016)
    expect(g.state).toBe('lost')
  })

  it('never loses in calm mode, and wins when the last brick goes', () => {
    const g = createGame({ calm: true })
    g.state = 'playing'
    g.ball = { x: 400, y: H + BALL_R + 1, vx: 0, vy: 100 }
    step(g, 0.016)
    expect(g.state).toBe('ready')
    for (const b of g.bricks.slice(1)) b.alive = false
    const last = g.bricks[0]
    g.state = 'playing'
    g.ball = { x: last.x + 20, y: last.y + 14 + BALL_R + 2, vx: 0, vy: -200 }
    step(g, 0.05)
    expect(g.state).toBe('won')
  })
})
