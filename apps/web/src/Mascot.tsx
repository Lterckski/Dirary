import type { MascotProps } from '@dirary/ui';

/**
 * Ink, from the cut-out pictures in public/ink (made by tools/mascot/build.py from the Gemini art).
 * Each picture is square with Ink bottom-aligned, her head and collar about 80% of the width.
 */
export function Mascot({ mood = 'happy', size = 240 }: MascotProps) {
  return <img src={`/ink/ink-${mood}.png`} width={size} height={size} alt="" draggable={false} style={{ display: 'block', objectFit: 'contain' }} />;
}

/** The paws picture is 410 × 108; the card's edge (the ledge she leans on) is two thirds of the way down. */
const PAWS_RATIO = 108 / 410;
const LEDGE = 2 / 3;

/** Ink's front paws, in front of a card so she seems to lean on it. Same box as the old drawing: size wide, size/4 tall. */
export function MascotPaws({ size = 240 }: { size?: number }) {
  const width = size * 0.8;
  const height = width * PAWS_RATIO;
  const edge = (size / 4) * 0.58;
  return (
    <span style={{ position: 'relative', display: 'block', width: size, height: size / 4 }}>
      <img src="/ink/ink-paws.png" alt="" draggable={false} width={width} height={height}
        style={{ position: 'absolute', left: (size - width) / 2, top: edge - height * LEDGE }} />
    </span>
  );
}
