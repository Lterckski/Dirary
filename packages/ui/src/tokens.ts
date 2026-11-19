/** Dirary design tokens. Dark theme only. Source: the "Mascot & Look" canvas. */
export const colors = {
  night: '#0A0B0E',
  surface: '#14161B',
  raised: '#1C1F26',
  line: '#2A2E37',
  text: '#F4F5F7',
  muted: '#A3A9B6',
  faint: '#7D8492',
  inkBlue: '#7C83FF',
  onInkBlue: '#0A0B0E',
  tongue: '#FF7AA2',
  amber: '#FFB547',
  red: '#FF5C5C',
  collar: '#FF5C7A',
} as const;

/**
 * Home-screen widgets ("Midnight glow"): each module's accent, and the dark tint its card fades from.
 * Only widgets use these; app screens stay flat.
 */
export const widgetGlow = {
  tasks: { accent: '#7C83FF', wash: '#2E2A7A' },
  money: { accent: '#FF7AA2', accentTo: '#FF9A5C', wash: '#4E1F38' },
  food: { accent: '#FFB547', wash: '#4D3310' },
  workout: { accent: '#5BC0FF', wash: '#103457' },
  track: '#2A2E37',
} as const;

export const radius = { sm: 9, md: 14, lg: 20, xl: 24, widget: 28, pill: 999 } as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;

/** Font family names as registered on each platform. */
export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  webDisplay: "'Bricolage Grotesque', Inter, system-ui, sans-serif",
  webBody: 'Inter, system-ui, sans-serif',
} as const;

export const type = {
  hero: { size: 40, line: 40 },
  title: { size: 34, line: 36 },
  heading: { size: 24, line: 28 },
  body: { size: 16, line: 22 },
  label: { size: 14, line: 18 },
  small: { size: 12, line: 16 },
} as const;

export type ColorToken = keyof typeof colors;
