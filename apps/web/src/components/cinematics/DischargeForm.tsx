// =============================================================================
// BATTLECRAPS — DISCHARGE FORM (FB-033, Sarge)
// apps/web/src/components/cinematics/DischargeForm.tsx
//
// The paper shared by Sarge's two moments: HONORABLY DISCHARGED (win) and
// DISHONORABLE DISCHARGE (loss). A cream form with a reserved blank band at the
// bottom where a small ink stamp comes down from above and lands (the parent
// times it); the form jolts on impact. Children render over the form (e.g. the
// dog tags on the loss).
// =============================================================================

import React from 'react';

interface DischargeFormProps {
  title:       string;
  body:        React.ReactNode;
  stampText:   string;
  stampColor:  string;
  /** The stamp is on its way down / on the paper. */
  stamped:     boolean;
  /** The stamp just landed — jolt the paper. */
  impact:      boolean;
  children?:   React.ReactNode;
}

export const DischargeForm: React.FC<DischargeFormProps> = ({
  title, body, stampText, stampColor, stamped, impact, children,
}) => (
  <div
    className={`relative flex flex-col items-center gap-3 px-7 py-7 text-center${impact ? ' animate-stamp-impact' : ''}`}
    style={{
      background: 'linear-gradient(180deg, #fbf6e6 0%, #f1e7c7 100%)',
      border:     '6px double #8a6d2f',
      boxShadow:  '0 18px 40px rgba(0,0,0,0.6)',
      color:      '#3b2f1a',
    }}
  >
    <div className="font-pixel text-[10px] tracking-[0.3em]" style={{ color: '#8a6d2f' }}>★ VFW HALL · FLOOR 2 ★</div>
    <div className="font-pixel text-r-15 tracking-widest leading-tight">{title}</div>
    <div className="h-px w-3/4" style={{ background: '#8a6d2f66' }} />
    <p className="font-mono text-[13px] leading-relaxed">{body}</p>

    {/* Blank band reserved for the stamp, so it never covers the text */}
    <div className="relative flex h-24 w-full items-center justify-center">
      {stamped && (
        <div
          className="font-pixel px-2.5 py-1.5 tracking-widest whitespace-nowrap animate-honor-stamp"
          style={{
            fontSize:     'clamp(11px, 3.2vw, 14px)',
            color:        stampColor,
            border:       `3px double ${stampColor}`,
            borderRadius: '5px',
            background:   'rgba(255,255,255,0.18)',
            mixBlendMode: 'multiply',
            opacity:      0.9,
          }}
        >
          {stampText}
        </div>
      )}
    </div>

    <div className="flex w-full items-end justify-between border-t pt-1 font-mono text-[11px]" style={{ color: '#6b5a36', borderColor: '#8a6d2f55' }}>
      <span>— SARGE, Pit Boss</span>
      <span>Floor 2</span>
    </div>

    {children}
  </div>
);
