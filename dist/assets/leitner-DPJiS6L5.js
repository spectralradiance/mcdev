var e=`// A Leitner-box scheduler: the simplest spaced-repetition system with solid evidence behind it.
// A card you recall moves up a box and is shown after a longer gap; a card you miss drops back
// to box 0 and returns tomorrow. Gaps grow roughly geometrically, the "expanding interval"
// pattern that distributed-practice studies favor over cramming.

export const DAY_MS = 24 * 60 * 60 * 1000
export const BOX_DAYS = [1, 2, 4, 8, 16]
export const LAST_BOX = BOX_DAYS.length - 1

export const newCard = (front, back, now = Date.now()) => ({ front, back, box: 0, due: now })

export function grade(card, recalled, now = Date.now()) {
  const box = recalled ? Math.min(card.box + 1, LAST_BOX) : 0
  return { ...card, box, due: now + BOX_DAYS[box] * DAY_MS }
}

// Most overdue first, so a backlog is worked off in the order it built up.
export const dueCards = (cards, now = Date.now()) =>
  cards.filter((c) => c.due <= now).sort((a, b) => a.due - b.due)

export const nextDue = (cards) => (cards.length ? Math.min(...cards.map((c) => c.due)) : null)

// "front | back" per line; blank lines and lines without a separator are skipped.
export function parseDeck(text, now = Date.now()) {
  return text
    .split('\\n')
    .map((line) => line.split('|').map((part) => part.trim()))
    .filter(([front, back]) => front && back)
    .map(([front, back]) => newCard(front, back, now))
}

export const deckToText = (cards) => cards.map((c) => \`\${c.front} | \${c.back}\`).join('\\n')

// Keep progress for cards whose text is unchanged when the deck is edited.
export function mergeDeck(parsed, previous) {
  const known = new Map(previous.map((c) => [\`\${c.front}\\n\${c.back}\`, c]))
  return parsed.map((c) => known.get(\`\${c.front}\\n\${c.back}\`) ?? c)
}

export function describeWait(ms) {
  if (ms <= 0) return 'now'
  const minutes = Math.ceil(ms / 60000)
  if (minutes < 60) return \`in \${minutes} min\`
  const hours = Math.ceil(minutes / 60)
  if (hours < 48) return \`in \${hours} h\`
  return \`in \${Math.ceil(hours / 24)} days\`
}
`;export{e as default};