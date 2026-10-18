var e=`// Trial generation and scoring for a go/no-go task, the standard lab measure of response inhibition.

// A shuffled block with an exact count of no-go trials (not a coin flip per trial), so every
// run has the same difficulty. Never starts with a no-go, so the first press is a plain "go".
export function makeTrials(total, noGoShare = 0.25, random = Math.random) {
  const noGo = Math.round(total * noGoShare)
  const trials = [...Array(total - noGo).fill('go'), ...Array(noGo).fill('nogo')]
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[trials[i], trials[j]] = [trials[j], trials[i]]
  }
  if (trials[0] === 'nogo') {
    const firstGo = trials.indexOf('go')
    ;[trials[0], trials[firstGo]] = [trials[firstGo], trials[0]]
  }
  return trials
}

// results: [{ kind: 'go' | 'nogo', rt: ms | null }], rt null means no press.
export function summarize(results) {
  const go = results.filter((r) => r.kind === 'go')
  const noGo = results.filter((r) => r.kind === 'nogo')
  const hits = go.filter((r) => r.rt !== null).map((r) => r.rt)
  const mean = hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : null
  const sd = hits.length > 1 ? Math.sqrt(hits.reduce((s, x) => s + (x - mean) ** 2, 0) / (hits.length - 1)) : null
  return {
    meanRt: mean === null ? null : Math.round(mean),
    sdRt: sd === null ? null : Math.round(sd),
    omissions: go.length - hits.length, // missed a go
    commissions: noGo.filter((r) => r.rt !== null).length, // pressed on a no-go
    goTrials: go.length,
    noGoTrials: noGo.length,
  }
}
`;export{e as default};