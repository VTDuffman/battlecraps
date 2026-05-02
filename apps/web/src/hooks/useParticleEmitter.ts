import { useRef, useEffect, type RefObject } from 'react';

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
): RefObject<HTMLCanvasElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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

      // READ — before any canvas writes
      const diceRect = diceRef.current?.getBoundingClientRect();
      const rect = active ? diceRect : undefined;

      // SPAWN — particles per die at the 25% and 75% horizontal marks
      if (active && rect) {
        const cx1 = rect.left + rect.width * 0.25;
        const cx2 = rect.left + rect.width * 0.75;
        const cy = rect.top + rect.height * 0.5;
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

      // Clip the dice bounding box so particles don't obscure pip faces.
      // Evenodd fill rule: full-canvas rect XOR dice rect → draw everywhere except
      // inside the dice. Particles become visible the moment they rise above the top
      // edge of the dice, creating a "flames/radiation rising from the dice" look.
      ctx!.save();
      if (diceRect) {
        ctx!.beginPath();
        ctx!.rect(0, 0, canvas.width, canvas.height);
        ctx!.rect(diceRect.left, diceRect.top, diceRect.width, diceRect.height);
        ctx!.clip('evenodd');
      }

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

      // restore resets clip region, composite operation, and alpha in one call
      ctx!.restore();

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [active, tier, diceRef]);

  return canvasRef;
}
