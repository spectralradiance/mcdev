/*
 * Recall
 *
 * Spaced-repetition flashcards, the one "brain game" with strong, replicated evidence. Two
 * habits do the work, and the game is built around them: you try to recall the answer
 * *before* seeing it (retrieval practice), and cards you know come back after longer and
 * longer gaps (spaced repetition). Both help only for the material you actually practise.
 * Nothing here trains general memory.
 *
 * Scheduling is a five-box Leitner system (see leitner.js). The deck is plain text, one
 * "front | back" per line, and is kept with its progress in localStorage. Editing the deck
 * keeps progress for any card whose text hasn't changed.
 */
import { useMemo, useState } from 'react'
import { LAST_BOX, deckToText, describeWait, dueCards, grade, mergeDeck, nextDue, parseDeck } from './leitner'

const DECK_KEY = 'recall.deck'

const STARTER = `Canada | Ottawa
Australia | Canberra
Brazil | Brasília
Turkey | Ankara
Nigeria | Abuja
Switzerland | Bern
New Zealand | Wellington
Vietnam | Hanoi
Morocco | Rabat
Peru | Lima`

function loadDeck() {
  try {
    const saved = JSON.parse(localStorage.getItem(DECK_KEY))
    if (Array.isArray(saved) && saved.length) return saved
  } catch {
    // No saved deck, or storage is unavailable; fall through to the starter deck.
  }
  return parseDeck(STARTER)
}

function saveDeck(cards) {
  try {
    localStorage.setItem(DECK_KEY, JSON.stringify(cards))
  } catch {
    // Progress just won't persist.
  }
}

export default function Recall() {
  const [cards, setCards] = useState(loadDeck)
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [studyAhead, setStudyAhead] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(Date.now)

  const due = useMemo(() => dueCards(cards, now), [cards, now])
  // When nothing is due the learner can opt to study the soonest cards anyway.
  const queue = due.length ? due : studyAhead ? [...cards].sort((a, b) => a.due - b.due) : []
  const card = queue[0]
  const upcoming = nextDue(cards)
  const mastered = cards.filter((c) => c.box === LAST_BOX).length

  const answer = (recalled) => {
    const at = Date.now()
    const next = cards.map((c) => (c === card ? grade(c, recalled, at) : c))
    setCards(next)
    saveDeck(next)
    setNow(at)
    setRevealed(false)
    setTyped('')
  }

  const openEditor = () => {
    setDraft(deckToText(cards))
    setEditing(true)
  }

  const saveEdit = () => {
    const merged = mergeDeck(parseDeck(draft), cards)
    if (!merged.length) return
    setCards(merged)
    saveDeck(merged)
    setNow(Date.now())
    setEditing(false)
  }

  const resetProgress = () => {
    const next = cards.map((c) => ({ ...c, box: 0, due: Date.now() }))
    setCards(next)
    saveDeck(next)
    setNow(Date.now())
  }

  const button = 'rounded border border-gray-700 bg-gray-800 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white'

  if (editing) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-900 px-4 py-6 font-light text-gray-300">
        <label className="text-xs text-gray-400" htmlFor="recall-deck">One card per line: front | back</label>
        <textarea
          id="recall-deck"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={12}
          className="rounded border border-gray-700 bg-gray-950 p-3 font-mono text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
        />
        <div className="flex gap-3">
          <button type="button" onClick={saveEdit} className={button}>Save deck</button>
          <button type="button" onClick={() => setEditing(false)} className={button}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-gray-700 bg-gray-900 px-4 py-6 font-light text-gray-300">
      <div className="flex gap-6 text-center">
        <div>
          <div className="text-xs text-gray-500">due</div>
          <div className="text-2xl text-white tabular-nums">{due.length}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">cards</div>
          <div className="text-2xl text-white tabular-nums">{cards.length}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">well known</div>
          <div className="text-2xl text-white tabular-nums">{mastered}</div>
        </div>
      </div>

      {card ? (
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <div className="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-lg border border-gray-700 bg-gray-950 p-6 text-center">
            <p className="text-2xl text-white">{card.front}</p>
            {revealed && <p className="text-xl text-teal-300">{card.back}</p>}
          </div>
          {!revealed ? (
            <>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setRevealed(true)}
                placeholder="Recall it first (optional: type your answer)"
                aria-label="Your answer"
                autoComplete="off"
                className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-center text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              />
              <button type="button" onClick={() => setRevealed(true)} className={button}>Show answer</button>
            </>
          ) : (
            <div className="flex gap-3">
              <button type="button" onClick={() => answer(false)} className={button}>Missed it</button>
              <button type="button" onClick={() => answer(true)} className={`${button} border-teal-700 text-teal-200`}>Got it</button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-lg text-white">All caught up.</p>
          <p className="text-sm text-gray-400">
            {upcoming ? `The next card is due ${describeWait(upcoming - now)}.` : 'Add some cards to begin.'}
            {' '}Coming back on schedule works better than cramming.
          </p>
          <button type="button" onClick={() => setStudyAhead(true)} className={button}>Study ahead anyway</button>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-4 text-xs text-gray-500">
        <button type="button" onClick={openEditor} className="underline underline-offset-2 hover:text-gray-300">Edit deck</button>
        <button type="button" onClick={resetProgress} className="underline underline-offset-2 hover:text-gray-300">Reset progress</button>
      </div>
      <p className="max-w-md text-center text-xs text-gray-500">
        Intervals: 1, 2, 4, 8 and 16 days (a missed card goes back to 1 day). Spaced recall
        reliably helps you remember what you practise; it won&apos;t make you smarter in general.
      </p>
    </div>
  )
}
