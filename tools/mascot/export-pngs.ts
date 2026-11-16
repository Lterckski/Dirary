// Renders Ink to PNG for places that can't draw SVG: Android widgets, the app icon, the splash screen.
// Run with: pnpm mascot:export
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { MASCOT_MOODS, colors, mascotSvg } from '../../packages/ui/src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const inner = (mood: (typeof MASCOT_MOODS)[number]) => mascotSvg({ mood, size: 240 });

function png(svg: string, size: number, file: string) {
  const out = join(root, file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
  console.log('wrote', file);
}

/** Ink placed on a square canvas. scale = share of the canvas he fills. */
function framed(mood: (typeof MASCOT_MOODS)[number], opts: { bg?: string; scale?: number; round?: boolean } = {}) {
  const { bg, scale = 1, round = false } = opts;
  const s = 240 * scale;
  const o = (240 - s) / 2;
  const back = bg ? (round ? `<circle cx="120" cy="120" r="120" fill="${bg}"/>` : `<rect width="240" height="240" fill="${bg}"/>`) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">${back}<svg x="${o}" y="${o}" width="${s}" height="${s}" viewBox="0 0 240 240">${inner(mood).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg></svg>`;
}

for (const mood of MASCOT_MOODS) png(framed(mood), 512, `apps/mobile/assets/mascot/ink-${mood}.png`);

png(framed('happy', { bg: colors.inkBlue, scale: 0.86 }), 1024, 'apps/mobile/assets/images/icon.png');
png(framed('happy', { scale: 0.58 }), 1024, 'apps/mobile/assets/images/android-icon-foreground.png');
png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="${colors.inkBlue}"/></svg>`, 1024, 'apps/mobile/assets/images/android-icon-background.png');
png(framed('happy'), 512, 'apps/mobile/assets/images/splash-icon.png');
png(framed('happy', { bg: colors.inkBlue, scale: 0.9, round: true }), 400, 'apps/mobile/assets/widgets/today-tasks-preview.png');
png(framed('cheer', { bg: colors.inkBlue, scale: 0.9 }), 400, 'apps/mobile/assets/widgets/ink-progress-preview.png');
png(framed('happy', { bg: colors.inkBlue, scale: 0.9, round: true }), 192, 'apps/web/public/favicon.png');
