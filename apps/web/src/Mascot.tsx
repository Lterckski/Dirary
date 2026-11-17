import { createElement, type ReactElement } from 'react';
import { createMascot, createMascotPaws } from '@dirary/ui';

/** Ink, drawn with plain SVG elements. */
export const Mascot = createMascot<string, ReactElement>(createElement, {
  Svg: 'svg', Path: 'path', Circle: 'circle', Ellipse: 'ellipse', Defs: 'defs',
  RadialGradient: 'radialGradient', LinearGradient: 'linearGradient', Stop: 'stop',
});

/** Ink's front paws, drawn in front of a card when he stands up to look over it. */
export const MascotPaws = createMascotPaws<string, ReactElement>(createElement, {
  Svg: 'svg', Path: 'path', Circle: 'circle', Ellipse: 'ellipse', Defs: 'defs',
  RadialGradient: 'radialGradient', LinearGradient: 'linearGradient', Stop: 'stop',
});
