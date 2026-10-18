import { lazy, Suspense, useEffect, useState } from 'react';
import { sound, DEFAULT_SOUND, type Scale, type SoundSettings, type Waveform } from './sound';
import { Select } from './ui';
import { useParam } from './params';

const SortView = lazy(() => import('./views/SortView'));
const RaceView = lazy(() => import('./views/RaceView'));
const SearchView = lazy(() => import('./views/SearchView'));
const StringView = lazy(() => import('./views/StringView'));
const GridView = lazy(() => import('./views/GridView'));
const NetworkView = lazy(() => import('./views/NetworkView'));

const TABS = [
  { id: 'sort', name: 'Sort', blurb: '31 sorting algorithms, every comparison, swap and write traced, coloured and voiced.', view: SortView },
  { id: 'race', name: 'Race', blurb: 'Four sorts on the same input, side by side, at the same operations per second.', view: RaceView },
  { id: 'search', name: 'Search', blurb: 'Eight ways to find a value in an array. Click a bar to choose the target.', view: SearchView },
  { id: 'strings', name: 'Strings', blurb: 'Find a pattern in text, from brute force to Boyer–Moore.', view: StringView },
  { id: 'paths', name: 'Mazes & paths', blurb: 'Generate mazes, draw walls and heavy terrain, and watch seven pathfinders explore.', view: GridView },
  { id: 'graphs', name: 'Graphs', blurb: 'Shortest paths, spanning trees, traversal, colouring and topological order on a random planar graph.', view: NetworkView },
];

const WAVES: { id: Waveform; name: string }[] = [
  { id: 'triangle', name: 'Triangle' },
  { id: 'sine', name: 'Sine' },
  { id: 'square', name: 'Square' },
  { id: 'sawtooth', name: 'Sawtooth' },
];
const SCALE_OPTIONS: { id: Scale; name: string }[] = [
  { id: 'continuous', name: 'Continuous' },
  { id: 'pentatonic', name: 'Pentatonic' },
  { id: 'major', name: 'Major' },
  { id: 'minor', name: 'Minor' },
  { id: 'chromatic', name: 'Chromatic' },
];

const STORAGE_KEY = 'kosmos-sound';

function loadSound(): SoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SOUND, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { ...DEFAULT_SOUND };
}

const SpeakerIcon = ({ on }: { on: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" />
    {on ? <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></> : <><path d="m22 9-6 6" /><path d="m16 9 6 6" /></>}
  </svg>
);

function SoundPanel() {
  const [s, setS] = useState(loadSound);
  useEffect(() => {
    sound.settings = s;
    sound.applyVolume();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
  }, [s]);
  const update = (patch: Partial<SoundSettings>) => { sound.unlock(); setS((x) => ({ ...x, ...patch })); };
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button"
        onClick={() => update({ enabled: !s.enabled })}
        className={'inline-flex items-center gap-1.5 rounded border px-2.5 py-1 transition-colors ' + (s.enabled ? 'border-line-strong text-white' : 'border-line-soft text-subtle')}
        aria-pressed={s.enabled}
      >
        <SpeakerIcon on={s.enabled} /> {s.enabled ? 'Sound on' : 'Muted'}
      </button>
      <input
        type="range"
        aria-label="Volume"
        className="w-24 accent-white"
        min={0}
        max={1}
        step={0.01}
        value={s.volume}
        onChange={(e) => update({ volume: Number(e.target.value) })}
      />
      <Select value={s.wave} onChange={(wave) => update({ wave })} options={WAVES} />
      <Select value={s.scale} onChange={(scale) => update({ scale })} options={SCALE_OPTIONS} />
    </div>
  );
}

export default function KosmosPage() {
  const [tabId, setTabId] = useParam('tab', 'sort');
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];
  const View = tab.view;

  return (
    // Browsers only start audio after a gesture, so any press on the page unlocks it.
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6" onPointerDown={() => sound.unlock()} onKeyDown={() => sound.unlock()}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">Kosmos</h1>
          <p className="mt-1 text-muted">Sorting, searching and graph algorithms you can watch and hear.</p>
        </div>
        <SoundPanel />
      </div>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-line-soft" aria-label="Algorithm families">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTabId(t.id)}
            aria-current={t.id === tab.id ? 'page' : undefined}
            className={'-mb-px border-b-2 px-3 py-2 text-sm transition-colors ' + (t.id === tab.id ? 'border-white text-white' : 'border-transparent text-muted hover:text-white')}
          >
            {t.name}
          </button>
        ))}
      </nav>
      <p className="mb-5 mt-3 text-sm text-subtle">
        {tab.blurb} <span className="hidden sm:inline">Space plays and pauses, the arrow keys step, and [ and ] change speed.</span>
      </p>

      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <View key={tab.id} />
      </Suspense>
    </main>
  );
}
