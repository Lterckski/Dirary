// Widget pieces are plain functions too; see the note at the top of TodayTasksWidget.tsx.
'use no memo';

import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { ReactNode } from 'react';
import { colors, fonts, widgetGlow } from '@dirary/ui';

type Hex = `#${string}`;
export type GlowModule = 'tasks' | 'money' | 'food' | 'workout';

export const INK = {
  happy: require('../../assets/mascot/ink-happy.png'),
  coach: require('../../assets/mascot/ink-coach.png'),
  cheer: require('../../assets/mascot/ink-cheer.png'),
  sleepy: require('../../assets/mascot/ink-sleepy.png'),
  worried: require('../../assets/mascot/ink-worried.png'),
} as const;

/** Task urgency → checkbox edge: normal and low in blue, high in amber, urgent in red. */
export const EDGE: Record<number, Hex> = { 0: colors.inkBlue, 1: colors.inkBlue, 2: colors.amber, 3: colors.red };

export const accent = (m: GlowModule): Hex => widgetGlow[m].accent;

/** The card every widget sits on: its module's dark tint in the top corner, fading into surface. */
export function glowCard(m: GlowModule, padding = 14) {
  return {
    height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding, borderRadius: 28,
    borderWidth: 1, borderColor: colors.line,
    backgroundGradient: { from: widgetGlow[m].wash, to: colors.surface, orientation: 'TL_BR' },
  } as const;
}

/** Text styles: Bricolage for the big numbers, Inter for the rest. */
export const big = (fontSize: number, color: Hex = colors.text) => ({ fontSize, color, fontFamily: fonts.display });
export const label = (fontSize = 12, color: Hex = colors.muted) => ({ fontSize, color, fontFamily: fonts.bodySemi });
export const strong = (fontSize = 12, color: Hex = colors.text) => ({ fontSize, color, fontFamily: fonts.bodyBold });

const clamp = (p: number) => (Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0);

function ringSvg(size: number, stroke: number, pct: number, color: string): string {
  const c = size / 2, r = (size - stroke) / 2, len = 2 * Math.PI * r, p = clamp(pct);
  const arc = p <= 0 ? '' : p >= 1
    ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`
    : `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(len * p).toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${widgetGlow.track}" stroke-width="${stroke}"/>${arc}</svg>`;
}

/** A progress ring with something (usually Ink or a number) centred inside it. */
export function Ring({ size, stroke, pct, color, children }: { size: number; stroke: number; pct: number; color: Hex; children?: ReactNode }) {
  return (
    <OverlapWidget style={{ width: size, height: size }}>
      <SvgWidget svg={ringSvg(size, stroke, pct, color)} style={{ width: size, height: size }} />
      <FlexWidget style={{ width: size, height: size, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </FlexWidget>
    </OverlapWidget>
  );
}

/** A thin progress bar that stretches to its row. `to` turns the fill into a gradient. */
export function Bar({ pct, color, to, height = 8 }: { pct: number; color: Hex; to?: Hex; height?: number }) {
  const p = clamp(pct);
  const fill = Math.round(p * 1000);
  return (
    <FlexWidget style={{ width: 'match_parent', height, flexDirection: 'row', borderRadius: height / 2, backgroundColor: widgetGlow.track }}>
      {fill > 0 ? (
        <FlexWidget style={{ flex: fill, height, borderRadius: height / 2, ...(to ? { backgroundGradient: { from: color, to, orientation: 'LEFT_RIGHT' } } : { backgroundColor: color }) }} />
      ) : null}
      {fill < 1000 ? <FlexWidget style={{ flex: 1000 - fill, height }} /> : null}
    </FlexWidget>
  );
}

/** A task's checkbox, tappable to tick it off. Filled with a check while a just-ticked task lingers. */
export function TickBox({ id, edge, done }: { id: string; edge: Hex; done: boolean }) {
  return (
    <FlexWidget clickAction="TOGGLE_TASK" clickActionData={{ id }} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <FlexWidget style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: done ? colors.inkBlue : edge, ...(done ? { backgroundColor: colors.inkBlue } : {}), alignItems: 'center', justifyContent: 'center' }}>
        {done ? <TextWidget text="✓" style={{ fontSize: 14, fontWeight: '800', color: colors.onInkBlue }} /> : null}
      </FlexWidget>
    </FlexWidget>
  );
}

/** A round accent button, like the + on the task and food widgets. */
export function RoundButton({ text, color, uri, size = 40, radius = 14, fontSize = 24 }: { text: string; color: Hex; uri: string; size?: number; radius?: number; fontSize?: number }) {
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri }}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <TextWidget text={text} style={{ fontSize, fontWeight: '800', color: colors.onInkBlue }} />
    </FlexWidget>
  );
}
