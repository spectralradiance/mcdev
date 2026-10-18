import { lazy } from 'react';

// Small projects are React ports of CodePen pens, keyed by the slug in src/data/projects.json.
// Each loads on demand, so the projects list doesn't pull in Tone.js or highlight.js.
// `files` are the sources shown on the project's page, main component first.
const smallProjects = {
  'seed-of-life': { component: lazy(() => import('./SeedOfLife')), files: ['SeedOfLife.jsx'] },
  aria: { component: lazy(() => import('./Aria')), files: ['Aria.jsx'] },
  simone: { component: lazy(() => import('./Simone')), files: ['Simone.jsx'] },
  'n-body-gravity-simulator': { component: lazy(() => import('./NBodyGravity')), files: ['NBodyGravity.jsx'] },
  'merging-balls': { component: lazy(() => import('./MergingBalls')), files: ['MergingBalls.jsx'] },
  'decoding-text': { component: lazy(() => import('./DecodingText')), files: ['DecodingText.jsx'] },
  'hacker-typer': { component: lazy(() => import('./HackerTyper')), files: ['HackerTyper.jsx'] },
  'numeric-base-converter': { component: lazy(() => import('./BaseConverter')), files: ['BaseConverter.jsx'] },
  'color-picker-sliders': { component: lazy(() => import('./ColorSliders')), files: ['ColorSliders.jsx'] },
  'hsv-color-picker': { component: lazy(() => import('./HsvColorPicker')), files: ['HsvColorPicker.jsx'] },
  'draw-division-remainder-pattern': { component: lazy(() => import('./DivisionPattern')), files: ['DivisionPattern.jsx'] },
  'media-list': { component: lazy(() => import('./MediaList')), files: ['MediaList.jsx'] },
  'qr-code-generator': { component: lazy(() => import('./QrCode')), files: ['QrCode.jsx', 'qr.js'] },
  breathe: { component: lazy(() => import('./Breathe')), files: ['Breathe.jsx'] },
  recall: { component: lazy(() => import('./Recall')), files: ['Recall.jsx', 'leitner.js'] },
  'go-no-go': { component: lazy(() => import('./GoNoGo')), files: ['GoNoGo.jsx', 'goNoGoTrials.js'] },
  pairs: { component: lazy(() => import('./Pairs')), files: ['Pairs.jsx'] },
  breakout: { component: lazy(() => import('./Breakout')), files: ['Breakout.jsx', 'breakoutRules.js'] },
};

export default smallProjects;
