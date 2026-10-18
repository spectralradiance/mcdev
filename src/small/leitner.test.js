import { describe, expect, it } from 'vitest'
import { BOX_DAYS, DAY_MS, LAST_BOX, describeWait, dueCards, grade, mergeDeck, newCard, nextDue, parseDeck } from './leitner'

describe('leitner', () => {
  const t0 = 1_000_000

  it('moves a recalled card up a box and schedules it further out', () => {
    const card = grade(newCard('a', 'b', t0), true, t0)
    expect(card.box).toBe(1)
    expect(card.due).toBe(t0 + BOX_DAYS[1] * DAY_MS)
  })

  it('caps at the last box', () => {
    let card = newCard('a', 'b', t0)
    for (let i = 0; i < 10; i++) card = grade(card, true, t0)
    expect(card.box).toBe(LAST_BOX)
  })

  it('sends a missed card back to box 0, due in a day', () => {
    const card = grade({ ...newCard('a', 'b', t0), box: 3 }, false, t0)
    expect(card.box).toBe(0)
    expect(card.due).toBe(t0 + DAY_MS)
  })

  it('lists due cards, most overdue first', () => {
    const cards = [{ ...newCard('a', 'b'), due: 50 }, { ...newCard('c', 'd'), due: 10 }, { ...newCard('e', 'f'), due: 500 }]
    expect(dueCards(cards, 100).map((c) => c.front)).toEqual(['c', 'a'])
    expect(nextDue(cards)).toBe(10)
    expect(nextDue([])).toBeNull()
  })

  it('parses decks and keeps progress for unchanged cards when merging', () => {
    const parsed = parseDeck('France | Paris\n\nbad line\n Spain | Madrid ', t0)
    expect(parsed.map((c) => [c.front, c.back])).toEqual([['France', 'Paris'], ['Spain', 'Madrid']])
    const merged = mergeDeck(parsed, [{ front: 'France', back: 'Paris', box: 3, due: 9 }])
    expect(merged[0].box).toBe(3)
    expect(merged[1].box).toBe(0)
  })

  it('describes waits', () => {
    expect(describeWait(0)).toBe('now')
    expect(describeWait(30 * 60000)).toBe('in 30 min')
    expect(describeWait(5 * 3600000)).toBe('in 5 h')
    expect(describeWait(4 * DAY_MS)).toBe('in 4 days')
  })
})
