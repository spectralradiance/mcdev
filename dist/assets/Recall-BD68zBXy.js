var e=`/*\r
 * Recall\r
 *\r
 * Spaced-repetition flashcards, the one "brain game" with strong, replicated evidence. Two\r
 * habits do the work, and the game is built around them: you try to recall the answer\r
 * *before* seeing it (retrieval practice), and cards you know come back after longer and\r
 * longer gaps (spaced repetition). Both help only for the material you actually practise.\r
 * Nothing here trains general memory.\r
 *\r
 * Scheduling is a five-box Leitner system (see leitner.js). The deck is plain text, one\r
 * "front | back" per line, and is kept with its progress in localStorage. Editing the deck\r
 * keeps progress for any card whose text hasn't changed.\r
 */\r
import { useMemo, useState } from 'react'\r
import { LAST_BOX, deckToText, describeWait, dueCards, grade, mergeDeck, nextDue, parseDeck } from './leitner'\r
\r
const DECK_KEY = 'recall.deck'\r
\r
const STARTER = \`Canada | Ottawa\r
Australia | Canberra\r
Brazil | Brasília\r
Turkey | Ankara\r
Nigeria | Abuja\r
Switzerland | Bern\r
New Zealand | Wellington\r
Vietnam | Hanoi\r
Morocco | Rabat\r
Peru | Lima\`\r
\r
function loadDeck() {\r
  try {\r
    const saved = JSON.parse(localStorage.getItem(DECK_KEY))\r
    if (Array.isArray(saved) && saved.length) return saved\r
  } catch {\r
    // No saved deck, or storage is unavailable; fall through to the starter deck.\r
  }\r
  return parseDeck(STARTER)\r
}\r
\r
function saveDeck(cards) {\r
  try {\r
    localStorage.setItem(DECK_KEY, JSON.stringify(cards))\r
  } catch {\r
    // Progress just won't persist.\r
  }\r
}\r
\r
export default function Recall() {\r
  const [cards, setCards] = useState(loadDeck)\r
  const [revealed, setRevealed] = useState(false)\r
  const [typed, setTyped] = useState('')\r
  const [studyAhead, setStudyAhead] = useState(false)\r
  const [editing, setEditing] = useState(false)\r
  const [draft, setDraft] = useState('')\r
  const [now, setNow] = useState(Date.now)\r
\r
  const due = useMemo(() => dueCards(cards, now), [cards, now])\r
  // When nothing is due the learner can opt to study the soonest cards anyway.\r
  const queue = due.length ? due : studyAhead ? [...cards].sort((a, b) => a.due - b.due) : []\r
  const card = queue[0]\r
  const upcoming = nextDue(cards)\r
  const mastered = cards.filter((c) => c.box === LAST_BOX).length\r
\r
  const answer = (recalled) => {\r
    const at = Date.now()\r
    const next = cards.map((c) => (c === card ? grade(c, recalled, at) : c))\r
    setCards(next)\r
    saveDeck(next)\r
    setNow(at)\r
    setRevealed(false)\r
    setTyped('')\r
  }\r
\r
  const openEditor = () => {\r
    setDraft(deckToText(cards))\r
    setEditing(true)\r
  }\r
\r
  const saveEdit = () => {\r
    const merged = mergeDeck(parseDeck(draft), cards)\r
    if (!merged.length) return\r
    setCards(merged)\r
    saveDeck(merged)\r
    setNow(Date.now())\r
    setEditing(false)\r
  }\r
\r
  const resetProgress = () => {\r
    const next = cards.map((c) => ({ ...c, box: 0, due: Date.now() }))\r
    setCards(next)\r
    saveDeck(next)\r
    setNow(Date.now())\r
  }\r
\r
  const button = 'rounded border border-line bg-raised px-4 py-2 text-soft hover:bg-strong hover:text-white'\r
\r
  if (editing) {\r
    return (\r
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel px-4 py-6 font-light text-soft">\r
        <label className="text-xs text-muted" htmlFor="recall-deck">One card per line: front | back</label>\r
        <textarea\r
          id="recall-deck"\r
          value={draft}\r
          onChange={(e) => setDraft(e.target.value)}\r
          rows={12}\r
          className="rounded border border-line bg-deep p-3 font-mono text-sm text-soft focus:border-line-strong focus:outline-none"\r
        />\r
        <div className="flex gap-3">\r
          <button type="button" onClick={saveEdit} className={button}>Save deck</button>\r
          <button type="button" onClick={() => setEditing(false)} className={button}>Cancel</button>\r
        </div>\r
      </div>\r
    )\r
  }\r
\r
  return (\r
    <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-panel px-4 py-6 font-light text-soft">\r
      <div className="flex gap-6 text-center">\r
        <div>\r
          <div className="text-xs text-subtle">due</div>\r
          <div className="text-2xl text-white tabular-nums">{due.length}</div>\r
        </div>\r
        <div>\r
          <div className="text-xs text-subtle">cards</div>\r
          <div className="text-2xl text-white tabular-nums">{cards.length}</div>\r
        </div>\r
        <div>\r
          <div className="text-xs text-subtle">well known</div>\r
          <div className="text-2xl text-white tabular-nums">{mastered}</div>\r
        </div>\r
      </div>\r
\r
      {card ? (\r
        <div className="flex w-full max-w-md flex-col items-center gap-4">\r
          <div className="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-lg border border-line bg-deep p-6 text-center">\r
            <p className="text-2xl text-white">{card.front}</p>\r
            {revealed && <p className="text-xl text-teal-300">{card.back}</p>}\r
          </div>\r
          {!revealed ? (\r
            <>\r
              <input\r
                type="text"\r
                value={typed}\r
                onChange={(e) => setTyped(e.target.value)}\r
                onKeyDown={(e) => e.key === 'Enter' && setRevealed(true)}\r
                placeholder="Recall it first (optional: type your answer)"\r
                aria-label="Your answer"\r
                autoComplete="off"\r
                className="w-full rounded border border-line bg-deep px-3 py-2 text-center text-sm text-soft focus:border-line-strong focus:outline-none"\r
              />\r
              <button type="button" onClick={() => setRevealed(true)} className={button}>Show answer</button>\r
            </>\r
          ) : (\r
            <div className="flex gap-3">\r
              <button type="button" onClick={() => answer(false)} className={button}>Missed it</button>\r
              <button type="button" onClick={() => answer(true)} className={\`\${button} border-teal-700 text-teal-200\`}>Got it</button>\r
            </div>\r
          )}\r
        </div>\r
      ) : (\r
        <div className="flex flex-col items-center gap-3 py-6 text-center">\r
          <p className="text-lg text-white">All caught up.</p>\r
          <p className="text-sm text-muted">\r
            {upcoming ? \`The next card is due \${describeWait(upcoming - now)}.\` : 'Add some cards to begin.'}\r
            {' '}Coming back on schedule works better than cramming.\r
          </p>\r
          <button type="button" onClick={() => setStudyAhead(true)} className={button}>Study ahead anyway</button>\r
        </div>\r
      )}\r
\r
      <div className="flex flex-wrap justify-center gap-4 text-xs text-subtle">\r
        <button type="button" onClick={openEditor} className="underline underline-offset-2 hover:text-soft">Edit deck</button>\r
        <button type="button" onClick={resetProgress} className="underline underline-offset-2 hover:text-soft">Reset progress</button>\r
      </div>\r
      <p className="max-w-md text-center text-xs text-subtle">\r
        Intervals: 1, 2, 4, 8 and 16 days (a missed card goes back to 1 day). Spaced recall\r
        reliably helps you remember what you practise; it won&apos;t make you smarter in general.\r
      </p>\r
    </div>\r
  )\r
}\r
`;export{e as default};