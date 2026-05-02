import React from 'react';

export const HypeFlash: React.FC<{ tier: 'heating-up' | 'on-fire' | 'nuclear' }> = ({ tier }) => {
  return (
    <div
      className="fixed left-1/2 z-50 pointer-events-none select-none animate-hype-flash"
      style={{ bottom: 'clamp(72px, 12dvh, 100px)' }}
    >
      {tier === 'nuclear' ? (
        <span
          className="font-pixel tracking-widest text-[clamp(20px,4dvw,28px)] text-[#39ff14]"
          style={{ filter: 'drop-shadow(0 0 8px #39ff14) drop-shadow(0 0 20px #00ff00) drop-shadow(0 0 40px #00aa00)' }}
        >
          GOING NUCLEAR!
        </span>
      ) : tier === 'on-fire' ? (
        <span
          className="font-pixel tracking-widest text-[clamp(20px,4dvw,28px)] text-red-400"
          style={{ filter: 'drop-shadow(0 0 8px #f87171) drop-shadow(0 0 16px #dc2626)' }}
        >
          ON FIRE!
        </span>
      ) : (
        <span
          className="font-pixel tracking-widest text-[clamp(16px,3.2dvw,22px)] text-orange-400"
          style={{ filter: 'drop-shadow(0 0 8px #fb923c) drop-shadow(0 0 14px #ea580c)' }}
        >
          HEATING UP!
        </span>
      )}
    </div>
  );
};
