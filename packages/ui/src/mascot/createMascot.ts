import { furPaths as P } from './paths';

export type MascotMood = 'happy' | 'coach' | 'cheer' | 'sleepy' | 'worried';
export const MASCOT_MOODS: readonly MascotMood[] = ['happy', 'coach', 'cheer', 'sleepy', 'worried'];

export interface MascotProps {
  mood?: MascotMood;
  size?: number;
  /** Collar colour. */
  collar?: string;
  /** Sparkle colour for the cheer mood. */
  sparkle?: string;
}

/** The SVG building blocks of the host platform (DOM tag names or react-native-svg components). */
export interface SvgPrimitives<T> {
  Svg: T; Path: T; Circle: T; Ellipse: T; Defs: T; RadialGradient: T; LinearGradient: T; Stop: T;
}

type Props = Record<string, unknown>;
/** React.createElement, or anything with the same shape. */
export type CreateElement<T, E> = (type: T, props: Props | null, ...children: E[]) => E;

const LABELS: Record<MascotMood, string> = {
  happy: 'Ink, happy with his tongue out',
  coach: 'Ink, coaching with a smile',
  cheer: 'Ink, celebrating',
  sleepy: 'Ink, asleep',
  worried: 'Ink, worried',
};

const OUTLINE = '#2B2F39';

/**
 * Builds the Ink mascot for any renderer. One drawing, shared by the web app,
 * the mobile app and the PNG exporter, so Ink looks the same everywhere.
 */
export function createMascot<T, E>(h: CreateElement<T, E>, S: SvgPrimitives<T>) {
  let k = 0;
  const el = (type: T, props: Props, ...children: E[]) => h(type, { key: `k${k++}`, ...props }, ...children);
  const fill = (d: string, f: string, extra: Props = {}) => el(S.Path, { d, fill: f, ...extra });
  const line = (d: string, stroke: string, strokeWidth: number, opacity = 1, extra: Props = {}) =>
    el(S.Path, { d, fill: 'none', stroke, strokeWidth, strokeLinecap: 'round', opacity, ...extra });
  const stop = (offset: string, stopColor: string) => el(S.Stop, { offset, stopColor });
  const radial = (id: string, cx: string, cy: string, r: string, stops: [string, string][]) =>
    el(S.RadialGradient, { id, cx, cy, r }, ...stops.map(([o, c]) => stop(o, c)));
  const linear = (id: string, stops: [string, string][]) =>
    el(S.LinearGradient, { id, x1: '0', y1: '0', x2: '0', y2: '1' }, ...stops.map(([o, c]) => stop(o, c)));

  const eye = (cx: number, r: number, pupil: number): E[] => [
    el(S.Circle, { cx, cy: 114, r, fill: 'url(#ink-iris)', stroke: '#5E3822', strokeWidth: 1 }),
    el(S.Circle, { cx, cy: 115, r: pupil, fill: '#080403' }),
    el(S.Ellipse, { cx: cx + 4, cy: 109.5, rx: 4.2, ry: 3.4, fill: '#FFFFFF' }),
    el(S.Circle, { cx: cx - 3.6, cy: 119, r: 1.7, fill: '#FFFFFF', opacity: 0.75 }),
    line(`M${cx - 10} 123 Q${cx} 129 ${cx + 10} 123`, '#2C303A', 1.4),
  ];

  return function Mascot({ mood = 'happy', size = 240, collar = '#FF5C7A', sparkle = '#FFB547' }: MascotProps): E {
    k = 0;
    const open = mood === 'happy' || mood === 'coach' || mood === 'worried';
    const tongue = mood === 'happy' || mood === 'coach' || mood === 'cheer';
    const tonguePath =
      mood === 'cheer' ? 'M109 154 C108 178 113 190 120 190 C127 190 132 178 131 154 Z'
      : mood === 'coach' ? 'M113 155 C113 163 116 167 120 167 C124 167 127 163 127 155 Z'
      : 'M111 154 C110 172 114 182 120 182 C126 182 130 172 129 154 Z';
    const tongueLine = mood === 'cheer' ? 'M120 159 L120 182' : mood === 'coach' ? 'M120 158 L120 163' : 'M120 158 L120 174';
    const eyeR = mood === 'worried' ? 10.5 : 11.5;
    const pupilR = mood === 'worried' ? 6.5 : 7.6;
    const furOutline = { stroke: OUTLINE, strokeWidth: 1.2, strokeLinejoin: 'round' };

    const parts: E[] = [
      el(S.Defs, {},
        radial('ink-head', '0.38', '0.3', '0.78', [['0', '#3A3F4C'], ['0.45', '#1F2229'], ['1', '#111216']]),
        linear('ink-fur', [['0', '#24272F'], ['1', '#101115']]),
        radial('ink-beard', '0.5', '0.25', '0.8', [['0', '#2E323B'], ['1', '#17191E']]),
        radial('ink-iris', '0.4', '0.68', '0.72', [['0', '#8E5230'], ['0.5', '#4A2412'], ['1', '#1C0D06']]),
        radial('ink-nose', '0.36', '0.3', '0.8', [['0', '#3E4350'], ['0.5', '#0E0E11'], ['1', '#040405']]),
        linear('ink-tongue', [['0', '#E65A88'], ['1', '#FF95B6']]),
      ),
      el(S.Ellipse, { cx: 120, cy: 234, rx: 66, ry: 5.5, fill: '#000000', opacity: 0.35 }),
      // tail, ears, body
      fill(P.tail, 'url(#ink-fur)', { stroke: OUTLINE, strokeWidth: 1.2 }),
      line(P.tailStrands, '#3A4050', 1.4, 0.7),
      fill(P.earL, 'url(#ink-fur)', { stroke: OUTLINE, strokeWidth: 1.1 }),
      fill(P.earR, 'url(#ink-fur)', { stroke: OUTLINE, strokeWidth: 1.1 }),
      line(P.earStrandsL, '#3A4050', 1.3, 0.75),
      line(P.earStrandsR, '#3A4050', 1.3, 0.75),
      fill(P.body, 'url(#ink-fur)', furOutline),
      line(P.bodyStrands, '#363C4B', 1.5, 0.7),
      // collar
      fill('M68 177 Q120 199 172 177 L173 189 Q120 212 67 189 Z', collar),
      line('M70 182 Q120 203 170 182', '#FFFFFF', 1.2, 0.25),
      // paws
      fill(P.pawL, '#1A1C22', furOutline),
      fill(P.pawR, '#1A1C22', furOutline),
      line('M90 221 L89 231 M97 220 L97 231 M104 221 L105 231 M138 221 L137 231 M145 220 L145 231 M152 221 L153 231', '#08090B', 1.5),
      line('M84 217 Q96 212 108 217 M132 217 Q144 212 156 217', '#4A5164', 1.3, 0.6),
      // head
      fill(P.head, 'url(#ink-head)', furOutline),
      line(P.headDark, '#0C0D10', 1.3, 0.4),
      line(P.headSheen, '#7C87A3', 1.2, 0.35),
      el(S.Ellipse, { cx: 94, cy: 115, rx: 16, ry: 14, fill: '#0D0E12', opacity: 0.85 }),
      el(S.Ellipse, { cx: 146, cy: 115, rx: 16, ry: 14, fill: '#0D0E12', opacity: 0.85 }),
      fill(P.beard, 'url(#ink-beard)'),
      line(P.beardStrands, '#4C5366', 1.3, 0.6),
      line(P.chinGrey, '#B3B8C3', 1.1, 0.55),
      fill(P.mustache, '#2A2E37', { stroke: '#3A4050', strokeWidth: 0.8 }),
    ];

    // eyes
    if (open) parts.push(...eye(94, eyeR, pupilR), ...eye(146, eyeR, pupilR));
    if (mood === 'cheer') parts.push(line('M83 118 Q94 103 105 118 M135 118 Q146 103 157 118', '#E2E5EC', 3.4));
    if (mood === 'sleepy') parts.push(line('M83 114 Q94 123 105 114 M135 114 Q146 123 157 114', '#B5BBC7', 3.4));

    // fringe and cowlick sit over the eyes
    parts.push(
      fill(P.fringeBack, '#16171C', { stroke: '#262A33', strokeWidth: 0.9 }),
      fill(P.fringeFront, '#1E2128', { stroke: '#2E333D', strokeWidth: 0.9 }),
      line(P.fringeSheen, '#8792AE', 1.3, 0.4),
      fill(P.cowlick, '#1E2128', { stroke: '#2E333D', strokeWidth: 1 }),
      line(P.cowlickSheen, '#8792AE', 1.4, 0.5),
    );
    if (mood === 'worried') parts.push(line('M81 99 L104 90 M159 99 L136 90', '#AEB5C3', 3.4));

    // nose
    parts.push(
      fill('M106 131 C105 121 135 121 134 131 C134 141 126 147 120 147 C114 147 106 141 106 131 Z', 'url(#ink-nose)'),
      line('M111 136 Q113 133 116 136 M124 136 Q127 133 129 136', '#000000', 2),
      el(S.Ellipse, { cx: 114, cy: 127, rx: 4.6, ry: 2.5, fill: '#FFFFFF', opacity: 0.55 }),
      el(S.Circle, { cx: 125, cy: 126, r: 1.3, fill: '#FFFFFF', opacity: 0.4 }),
      line('M120 147 L120 152', '#050506', 2.2),
    );

    // mouth
    if (tongue) {
      parts.push(
        fill('M107 153 Q120 160 133 153 Q133 158 120 161 Q107 158 107 153 Z', '#0A0A0C'),
        fill(tonguePath, 'url(#ink-tongue)', { stroke: '#D14B78', strokeWidth: 0.8 }),
        line(tongueLine, '#C93F6E', 1.6),
        el(S.Ellipse, { cx: 114.5, cy: 163, rx: 2, ry: 4.5, fill: '#FFC2D4', opacity: 0.7 }),
        line('M105 152 Q112.5 159 120 152 Q127.5 159 135 152', '#050506', 2.3),
      );
    }
    if (mood === 'sleepy') parts.push(line('M113 157 Q120 161 127 157', '#9AA3B2', 2.2));
    if (mood === 'worried') parts.push(line('M107 159 Q113.5 154 120 159 Q126.5 164 133 159', '#C9CED8', 2.2));

    // name tag: an amber disc with an "I"
    parts.push(
      line('M120 196 L120 199', '#C9CED8', 1.4),
      el(S.Circle, { cx: 120, cy: 206, r: 8, fill: '#FFB547', stroke: '#C98A22', strokeWidth: 1.2 }),
      line('M117.5 202.5 H122.5 M120 202.5 V209.5 M117.5 209.5 H122.5', '#5A3A06', 1.6),
    );

    // mood extras
    if (mood === 'cheer') {
      parts.push(fill(
        'M34 38 Q34 52 48 52 Q34 52 34 66 Q34 52 20 52 Q34 52 34 38 Z M208 28 Q208 38 218 38 Q208 38 208 48 Q208 38 198 38 Q208 38 208 28 Z M216 104 Q216 112 224 112 Q216 112 216 120 Q216 112 208 112 Q216 112 216 104 Z',
        sparkle,
      ));
    }
    if (mood === 'sleepy') {
      parts.push(line('M178 56 H187 L178 66 H187 M194 28 H207 L194 44 H207', '#9AA3B2', 2.6, 1, { strokeLinejoin: 'round' }));
    }
    if (mood === 'worried') {
      parts.push(
        fill('M192 64 C192 64 183 78 183 84 C183 89 187 93 192 93 C197 93 201 89 201 84 C201 78 192 64 192 64 Z', '#7CC4FF'),
        el(S.Ellipse, { cx: 189, cy: 83, rx: 1.6, ry: 3, fill: '#FFFFFF', opacity: 0.6 }),
      );
    }

    return h(S.Svg, { viewBox: '0 0 240 240', width: size, height: size, role: 'img', 'aria-label': LABELS[mood] }, ...parts);
  };
}
