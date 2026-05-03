import { useRef, useEffect } from 'react';
import type { RefObject } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  hue: number;
  isSmoke: boolean;
}

export function useParticleEmitter(
  diceRef: RefObject<HTMLDivElement | null>,
  active: boolean,
  tier: number
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrameId: number;
    let lastTime = performance.now();

    function emit(x: number, y: number, currentTier: number) {
      const isSmoke = currentTier === 2;
      const isNuclear = currentTier === 4;
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 3,
        vy: -(Math.random() * 2 + 1),
        size: isSmoke ? (5 + Math.random() * 5) : (3 + Math.random() * 3),
        life: 1.0,
        // Nuclear uses green hue range (100–140); fire/heat use warm orange (20–80)
        hue: isNuclear ? (Math.random() * 40 + 100) : (Math.random() * 60 + 20),
        isSmoke,
      });
    }

    const tick = (now: number) => {
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;

      // READ — sync buffer to CSS layout (handles resize), then read positions.
      // Both rects are in viewport space; subtracting the canvas origin converts
      // dice coords into canvas-local coords, sidestepping any CSS transform trap.
      const canvasRect = canvas.getBoundingClientRect();
      const cw = Math.round(canvasRect.width);
      const ch = Math.round(canvasRect.height);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const diceRect = diceRef.current?.getBoundingClientRect();
      const rect = active ? diceRect : undefined;

      // SPAWN — emission coords local to the canvas, not the viewport
      if (active && rect) {
        const localX = rect.left - canvasRect.left;
        const localY = rect.top - canvasRect.top;
        const cx1 = localX + rect.width * 0.25;
        const cx2 = localX + rect.width * 0.75;
        const cy = localY + rect.height * 0.5;
        const count = tier === 4 ? 6 : tier === 3 ? 4 : 2;
        for (let i = 0; i < count; i++) {
          emit(cx1, cy, tier);
          emit(cx2, cy, tier);
        }
      }

      // UPDATE — upward drift + gravity, horizontal velocity, life decay
      const dtNorm = dt / 16;
      particlesRef.current = particlesRef.current
        .map(p => ({
          ...p,
          x: p.x + p.vx * dtNorm,
          y: p.y + p.vy * dtNorm,
          vy: p.vy + 0.1 * dtNorm,
          life: p.life - (dt / 1000) * 1.5,
        }))
        .filter(p => p.life > 0);

      // WRITE
      ctx!.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particlesRef.current) {
        if (p.isSmoke) {
          ctx!.globalCompositeOperation = 'source-over';
          ctx!.fillStyle = 'rgba(200, 200, 200, ' + (p.life * 0.3) + ')';
        } else {
          ctx!.globalCompositeOperation = 'lighter';
          ctx!.fillStyle = 'hsl(' + p.hue + ', 100%, ' + (50 + p.life * 20) + '%)';
        }
        ctx!.globalAlpha = p.life;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Reset composite state so the next tick's clearRect is unaffected
      ctx!.globalCompositeOperation = 'source-over';
      ctx!.globalAlpha = 1;

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [active, tier, diceRef]);

  // Absolute so it stays inside the relative DiceZone container (no CSS-transform
  // trap). Negative insets give particles room to rise above/beside the dice
  // before fading out. z-0 keeps it below the z-10 dice flex container.
  return <canvas ref={canvasRef} className="absolute -top-32 -bottom-10 -left-16 -right-16 pointer-events-none z-0" />;
}
