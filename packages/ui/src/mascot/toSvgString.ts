import { createMascot, type MascotProps } from './createMascot';

const ATTR: Record<string, string> = {
  strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin', stopColor: 'stop-color',
};
const esc = (v: unknown) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function h(type: string, props: Record<string, unknown> | null, ...children: string[]): string {
  const attrs = Object.entries(props ?? {})
    .filter(([key]) => key !== 'key')
    .map(([key, v]) => ` ${ATTR[key] ?? key}="${esc(v)}"`)
    .join('');
  const ns = type === 'svg' ? ' xmlns="http://www.w3.org/2000/svg"' : '';
  return `<${type}${ns}${attrs}>${children.join('')}</${type}>`;
}

const render = createMascot<string, string>(h, {
  Svg: 'svg', Path: 'path', Circle: 'circle', Ellipse: 'ellipse', Defs: 'defs',
  RadialGradient: 'radialGradient', LinearGradient: 'linearGradient', Stop: 'stop',
});

/** Ink as a standalone SVG string, for PNG export (widgets, app icon). */
export function mascotSvg(props: MascotProps = {}): string {
  return render(props);
}
