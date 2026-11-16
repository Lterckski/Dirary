import { createElement, type ReactElement } from 'react';
import { createMascot } from '@dirary/ui';

/** Ink, drawn with plain SVG elements. */
export const Mascot = createMascot<string, ReactElement>(createElement, {
  Svg: 'svg', Path: 'path', Circle: 'circle', Ellipse: 'ellipse', Defs: 'defs',
  RadialGradient: 'radialGradient', LinearGradient: 'linearGradient', Stop: 'stop',
});
