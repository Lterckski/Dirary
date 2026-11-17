/**
 * A one-off confetti burst for finishing the last task of the day. Draws on a temporary full-screen canvas
 * that ignores the pointer and removes itself. Does nothing when the person prefers reduced motion.
 */
type Shape = 'rect' | 'dot' | 'streamer';
interface Bit { x: number; y: number; vx: number; vy: number; spin: number; angle: number; flip: number; size: number; color: string; shape: Shape; born: number }

const TOKENS = ['--inkBlue', '--tongue', '--amber', '--text', '--red'];
const LIFE_MS = 2400;
const GRAVITY = 1500; // px/s²
const DRAG = 1.9; // per second

export function confettiFrom(origin: Element | null): void {
  if (!origin || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const css = getComputedStyle(document.documentElement);
  const colors = TOKENS.map((t) => css.getPropertyValue(t).trim()).filter(Boolean);
  const box = origin.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '100' });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(ratio, ratio);

  const start = performance.now();
  const bits: Bit[] = [];
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;
  // One big burst up and out of the progress bar, then two smaller pops from its ends.
  const burst = (x: number, y: number, count: number, spread: [number, number], speed: [number, number], delay: number) => {
    for (let i = 0; i < count; i++) {
      const a = ((spread[0] + Math.random() * (spread[1] - spread[0])) * Math.PI) / 180;
      const v = speed[0] + Math.random() * (speed[1] - speed[0]);
      bits.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, spin: (Math.random() - 0.5) * 14, angle: Math.random() * Math.PI, flip: 4 + Math.random() * 8,
        size: 5 + Math.random() * 5, color: pick(colors), shape: pick<Shape>(['rect', 'rect', 'dot', 'streamer']), born: start + delay,
      });
    }
  };
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  burst(cx, cy, 130, [-165, -15], [500, 1250], 0);
  burst(box.left, cy, 40, [-120, -60], [450, 950], 140);
  burst(box.right, cy, 40, [-120, -60], [450, 950], 140);

  const frame = (now: number) => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const b of bits) {
      const t = (now - b.born) / 1000;
      if (t < 0) continue;
      // Linear drag towards a terminal fall speed: a quick explosion that slows and drifts down.
      const decay = (1 - Math.exp(-DRAG * t)) / DRAG;
      const x = b.x + b.vx * decay;
      const y = b.y + (b.vy - GRAVITY / DRAG) * decay + (GRAVITY / DRAG) * t;
      const life = (now - b.born) / LIFE_MS;
      ctx.save();
      ctx.globalAlpha = life > 0.75 ? Math.max(0, (1 - life) / 0.25) : 1;
      ctx.translate(x, y);
      ctx.rotate(b.angle + b.spin * t);
      ctx.scale(1, Math.cos(b.flip * t)); // the flutter of a falling scrap of paper
      ctx.fillStyle = b.color;
      if (b.shape === 'dot') { ctx.beginPath(); ctx.arc(0, 0, b.size / 2.4, 0, Math.PI * 2); ctx.fill(); }
      else if (b.shape === 'streamer') ctx.fillRect(-1.5, -b.size, 3, b.size * 2);
      else ctx.fillRect(-b.size / 2, -b.size * 0.35, b.size, b.size * 0.7);
      ctx.restore();
    }
    if (now - start < LIFE_MS + 200) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
