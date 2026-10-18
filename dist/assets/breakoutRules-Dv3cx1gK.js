var e=`// Breakout rules, kept apart from the canvas so they can be tested. Everything is in
// canvas pixels; step() advances the game by dt seconds and mutates it.

export const W = 480
export const H = 360
export const PADDLE = { w: 64, h: 8, y: H - 24 }
export const BALL_R = 5

const COLS = 10
const ROWS = 6
const BRICK_W = 44
const BRICK_H = 14
const GAP = 4
const TOP = 44
const LEFT = (W - (COLS * (BRICK_W + GAP) - GAP)) / 2
const MAX_BOUNCE_DEG = 60
const PADDLE_KEY_SPEED = 380

export const ROW_HUES = [0, 28, 50, 130, 190, 270]
export const brickSize = { w: BRICK_W, h: BRICK_H }

// Calm mode: a slower ball and no lives to lose.
export function createGame({ calm = false } = {}) {
  const bricks = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      bricks.push({ x: LEFT + col * (BRICK_W + GAP), y: TOP + row * (BRICK_H + GAP), row, alive: true })
    }
  }
  return {
    calm,
    speed: calm ? 190 : 270,
    paddleX: W / 2,
    ball: { x: W / 2, y: PADDLE.y - BALL_R, vx: 0, vy: 0 },
    bricks,
    lives: calm ? Infinity : 3,
    score: 0,
    state: 'ready', // ready | playing | won | lost
  }
}

const serve = (g) => {
  g.state = 'ready'
  g.ball = { x: g.paddleX, y: PADDLE.y - BALL_R, vx: 0, vy: 0 }
}

export function launch(g, random = Math.random) {
  if (g.state !== 'ready') return
  const angle = ((random() - 0.5) * 40 * Math.PI) / 180
  g.ball.vx = g.speed * Math.sin(angle)
  g.ball.vy = -g.speed * Math.cos(angle)
  g.state = 'playing'
}

// input: { target: paddle centre x or null, dir: -1 | 0 | 1 for the keys }
export function step(g, dt, input = {}) {
  if (g.state === 'won' || g.state === 'lost') return
  const half = PADDLE.w / 2
  if (input.target != null) g.paddleX = input.target
  g.paddleX += (input.dir ?? 0) * PADDLE_KEY_SPEED * dt
  g.paddleX = Math.min(W - half, Math.max(half, g.paddleX))

  if (g.state === 'ready') {
    g.ball.x = g.paddleX
    return
  }

  // Sub-steps keep a fast ball from tunnelling through a brick between frames.
  const sub = Math.ceil((g.speed * dt) / 4)
  for (let i = 0; i < sub && g.state === 'playing'; i++) move(g, dt / sub)
}

function move(g, dt) {
  const b = g.ball
  const px = b.x
  const py = b.y
  b.x += b.vx * dt
  b.y += b.vy * dt

  if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) }
  if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) }
  if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy) }

  if (b.y - BALL_R > H) {
    g.lives -= 1
    if (g.lives <= 0) g.state = 'lost'
    else serve(g)
    return
  }

  const half = PADDLE.w / 2
  if (b.vy > 0 && b.y + BALL_R >= PADDLE.y && py + BALL_R <= PADDLE.y + PADDLE.h && Math.abs(b.x - g.paddleX) <= half + BALL_R) {
    // Where the ball lands on the paddle sets its angle: centre goes straight up.
    const t = Math.max(-1, Math.min(1, (b.x - g.paddleX) / half))
    const angle = (t * MAX_BOUNCE_DEG * Math.PI) / 180
    b.vx = g.speed * Math.sin(angle)
    b.vy = -g.speed * Math.cos(angle)
    b.y = PADDLE.y - BALL_R
  }

  for (const brick of g.bricks) {
    if (!brick.alive) continue
    const nearX = Math.max(brick.x, Math.min(b.x, brick.x + BRICK_W))
    const nearY = Math.max(brick.y, Math.min(b.y, brick.y + BRICK_H))
    if ((b.x - nearX) ** 2 + (b.y - nearY) ** 2 > BALL_R ** 2) continue
    brick.alive = false
    g.score += (ROWS - brick.row) * 10
    // If the ball was beside the brick a moment ago it hit a side; otherwise top or bottom.
    if (px < brick.x || px > brick.x + BRICK_W) b.vx = -b.vx
    else b.vy = -b.vy
    break
  }

  if (g.bricks.every((brick) => !brick.alive)) g.state = 'won'
}
`;export{e as default};