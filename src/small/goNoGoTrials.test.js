import { describe, expect, it } from 'vitest'
import { makeTrials, summarize } from './goNoGoTrials'

describe('go/no-go', () => {
  it('makes a block with the exact share of no-go trials, never starting with one', () => {
    for (let i = 0; i < 50; i++) {
      const trials = makeTrials(40, 0.25)
      expect(trials).toHaveLength(40)
      expect(trials.filter((t) => t === 'nogo')).toHaveLength(10)
      expect(trials[0]).toBe('go')
    }
  })

  it('summarizes reaction times, omissions and commissions', () => {
    const s = summarize([
      { kind: 'go', rt: 300 },
      { kind: 'go', rt: 400 },
      { kind: 'go', rt: null },
      { kind: 'nogo', rt: 350 },
      { kind: 'nogo', rt: null },
    ])
    expect(s.meanRt).toBe(350)
    expect(s.sdRt).toBe(71)
    expect(s.omissions).toBe(1)
    expect(s.commissions).toBe(1)
    expect(s.goTrials).toBe(3)
    expect(s.noGoTrials).toBe(2)
  })

  it('handles a run with no presses', () => {
    const s = summarize([{ kind: 'go', rt: null }])
    expect(s.meanRt).toBeNull()
    expect(s.omissions).toBe(1)
  })
})
