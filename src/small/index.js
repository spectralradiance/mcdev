import { lazy } from 'react';

// Small projects are React ports of CodePen pens, keyed by the slug in public/projects.json.
// Each loads on demand, so the projects list doesn't pull in Tone.js or highlight.js.
const smallProjects = {
  'seed-of-life': lazy(() => import('./SeedOfLife')),
  aria: lazy(() => import('./Aria')),
  simone: lazy(() => import('./Simone')),
  'n-body-gravity-simulator': lazy(() => import('./NBodyGravity')),
  'merging-balls': lazy(() => import('./MergingBalls')),
  'decoding-text': lazy(() => import('./DecodingText')),
  'hacker-typer': lazy(() => import('./HackerTyper')),
  'numeric-base-converter': lazy(() => import('./BaseConverter')),
  'color-picker-sliders': lazy(() => import('./ColorSliders')),
  'hsv-color-picker': lazy(() => import('./HsvColorPicker')),
  'draw-division-remainder-pattern': lazy(() => import('./DivisionPattern')),
  'media-list': lazy(() => import('./MediaList')),
};

export default smallProjects;
