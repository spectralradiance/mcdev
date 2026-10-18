var e=`/*
 * Pairs
 *
 * Concentration: turn over two cards at a time and find the matching pairs. Hue and shape
 * both identify a pair, so you can remember them by color, by form or both. A pleasant, quiet
 * game and good practice at *this* game. There is little evidence that matching games
 * improve memory in general, so treat it as a calm way to pass a few minutes.
 *
 * The deck is built by taking N/2 distinct (shape, hue) symbols, doubling them, and
 * shuffling with Fisher-Yates. A mismatched pair is held face-up briefly and then turned
 * back; clicks are ignored while two cards are showing. Your best (fewest moves) for each
 * board size is kept in localStorage.
 */
import { useEffect, useRef, useState } from 'react'

const SIZES = { '2 × 2': [2, 2], '4 × 3': [4, 3], '4 × 4': [4, 4], '6 × 6': [6, 6] }
const SHAPES = ['●', '▲', '■', '◆', '★', '♥', '♣', '♠', '✚', '⬟', '☾', '✦', '▼', '◗', '⬢', '❖', '☀', '☁']
const BEST_KEY = 'pairs.best'
const MISMATCH_MS = 900

function shuffled(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function deal(cols, rows) {
  const pairs = (cols * rows) / 2
  // Walk the hue wheel with a step coprime to 360 so neighbours differ, and shape and hue move
  // together: every symbol is unique.
  const symbols = Array.from({ length: pairs }, (_, i) => ({
    glyph: SHAPES[i % SHAPES.length],
    hue: Math.round((i * 360) / pairs + 10) % 360,
  }))
  return shuffled([...symbols, ...symbols]).map((symbol, id) => ({ id, ...symbol, state: 'down' }))
}

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) ?? {}
  } catch {
    return {}
  }
}

export default function Pairs() {
  const [sizeName, setSizeName] = useState('4 × 3')
  const [cards, setCards] = useState(() => deal(...SIZES['4 × 3']))
  const [moves, setMoves] = useState(0)
  const [best, setBest] = useState(loadBest)
  const openRef = useRef([]) // indexes of the face-up, unmatched cards
  const lockedRef = useRef(false)
  const timerRef = useRef(0)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const newGame = (name = sizeName) => {
    clearTimeout(timerRef.current)
    openRef.current = []
    lockedRef.current = false
    setSizeName(name)
    setCards(deal(...SIZES[name]))
    setMoves(0)
  }

  const flip = (index) => {
    if (lockedRef.current || cards[index].state !== 'down') return
    const open = [...openRef.current, index]
    openRef.current = open
    const next = cards.map((c, i) => (i === index ? { ...c, state: 'up' } : c))

    if (open.length < 2) {
      setCards(next)
      return
    }

    setMoves((m) => m + 1)
    const [a, b] = open
    if (next[a].glyph === next[b].glyph && next[a].hue === next[b].hue) {
      next[a].state = 'matched'
      next[b].state = 'matched'
      openRef.current = []
      setCards(next)
      if (next.every((c) => c.state === 'matched')) {
        const finalMoves = moves + 1
        setBest((previous) => {
          if (previous[sizeName] <= finalMoves) return previous
          const updated = { ...previous, [sizeName]: finalMoves }
          try {
            localStorage.setItem(BEST_KEY, JSON.stringify(updated))
          } catch {
            // Best just won't persist.
          }
          return updated
        })
      }
      return
    }

    setCards(next)
    lockedRef.current = true
    timerRef.current = setTimeout(() => {
      setCards((current) => current.map((c, i) => (i === a || i === b ? { ...c, state: 'down' } : c)))
      openRef.current = []
      lockedRef.current = false
    }, MISMATCH_MS)
  }

  const [cols] = SIZES[sizeName]
  const won = cards.every((c) => c.state === 'matched')
  const cell = sizeName === '6 × 6' ? 'text-xl' : 'text-3xl'

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-panel px-4 py-6 font-light text-soft">
      <div className="flex w-full flex-wrap items-end justify-center gap-4 text-sm">
        <label className="text-xs text-muted">
          board
          <select
            value={sizeName}
            onChange={(e) => newGame(e.target.value)}
            className="mt-1 block rounded border border-line bg-panel px-2 py-1 text-sm text-soft focus:border-line-strong focus:outline-none"
          >
            {Object.keys(SIZES).map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => newGame()}
          className="rounded border border-line bg-raised px-4 py-1.5 text-soft hover:bg-strong hover:text-white"
        >
          New game
        </button>
      </div>

      <div className="flex gap-6 text-center">
        <div>
          <div className="text-xs text-subtle">moves</div>
          <div className="text-2xl text-white tabular-nums">{moves}</div>
        </div>
        <div>
          <div className="text-xs text-subtle">best</div>
          <div className="text-2xl text-white tabular-nums">{best[sizeName] ?? '–'}</div>
        </div>
      </div>

      <div
        className="grid w-[340px] max-w-full touch-manipulation gap-2 select-none"
        style={{ gridTemplateColumns: \`repeat(\${cols}, minmax(0, 1fr))\` }}
      >
        {cards.map((card, i) => {
          const faceUp = card.state !== 'down'
          return (
            <button
              key={card.id}
              type="button"
              aria-label={faceUp ? \`\${card.glyph}, \${card.state}\` : 'Face-down card'}
              onClick={() => flip(i)}
              className={\`aspect-square rounded-md border transition-colors duration-150 \${cell} \${
                faceUp ? 'border-transparent' : 'border-line bg-raised hover:bg-strong'
              } \${card.state === 'matched' ? 'opacity-40' : ''}\`}
              style={faceUp ? { backgroundColor: \`hsl(\${card.hue} 45% 18%)\`, color: \`hsl(\${card.hue} 90% 68%)\` } : undefined}
            >
              {faceUp ? card.glyph : ''}
            </button>
          )
        })}
      </div>

      <p aria-live="polite" className="min-h-6 text-center text-teal-300">
        {won ? \`All \${cards.length / 2} pairs in \${moves} moves.\` : ''}
      </p>
      <p className="max-w-md text-center text-xs text-subtle">
        Pairs share both shape and color. Fewer moves is better, but there&apos;s no clock.
      </p>
    </div>
  )
}
`;export{e as default};