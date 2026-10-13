// =============================================================================
// BATTLECRAPS — SEVEN-SEGMENT DISPLAY
// apps/web/src/components/SevenSegmentDisplay.tsx
//
// A digital-clock readout drawn as inline SVG (no font assets). Unlit "ghost"
// segments stay faintly visible behind the lit ones, like a real LED/LCD clock.
// Used by Sarge's Double Time clock in BossRoomHeader.
// =============================================================================

import React from 'react';

// Digit cell geometry (viewBox units).
const W   = 14;   // digit width
const H   = 24;   // digit height
const T   = 3;    // segment thickness
const GAP = 0.7;  // gap between segments
const PITCH = W + 4; // horizontal distance between digits

type Segment = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';
const ALL_SEGMENTS: readonly Segment[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

const DIGIT_SEGMENTS: Readonly<Record<string, readonly Segment[]>> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'e', 'd', 'c'],
  '7': ['a', 'b', 'c'],
  '8': ALL_SEGMENTS,
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  '-': ['g'],
};

const HALF = T / 2;
const LEFT = HALF, RIGHT = W - HALF, TOP = HALF, MID = H / 2, BOTTOM = H - HALF;

/** Hexagonal horizontal segment centred on y, spanning x1→x2. */
function hSeg(x1: number, x2: number, y: number): string {
  return `${x1},${y} ${x1 + HALF},${y - HALF} ${x2 - HALF},${y - HALF} ${x2},${y} ${x2 - HALF},${y + HALF} ${x1 + HALF},${y + HALF}`;
}

/** Hexagonal vertical segment centred on x, spanning y1→y2. */
function vSeg(x: number, y1: number, y2: number): string {
  return `${x},${y1} ${x + HALF},${y1 + HALF} ${x + HALF},${y2 - HALF} ${x},${y2} ${x - HALF},${y2 - HALF} ${x - HALF},${y1 + HALF}`;
}

const SEGMENT_POINTS: Readonly<Record<Segment, string>> = {
  a: hSeg(LEFT + GAP, RIGHT - GAP, TOP),
  b: vSeg(RIGHT, TOP + GAP, MID - GAP),
  c: vSeg(RIGHT, MID + GAP, BOTTOM - GAP),
  d: hSeg(LEFT + GAP, RIGHT - GAP, BOTTOM),
  e: vSeg(LEFT, MID + GAP, BOTTOM - GAP),
  f: vSeg(LEFT, TOP + GAP, MID - GAP),
  g: hSeg(LEFT + GAP, RIGHT - GAP, MID),
};

interface SevenSegmentDisplayProps {
  /** Characters to show — digits 0–9 or '-'. */
  value:       string;
  /** Lit segment colour. */
  color:       string;
  /** Rendered height in px; width scales to fit. */
  height?:     number;
  /** Opacity of unlit "ghost" segments. */
  ghostOpacity?: number;
  /** Accessible label (defaults to the value). */
  label?:      string;
  className?:  string;
}

export const SevenSegmentDisplay: React.FC<SevenSegmentDisplayProps> = ({
  value,
  color,
  height = 22,
  ghostOpacity = 0.12,
  label,
  className,
}) => {
  const chars  = value.split('');
  const vbW    = chars.length * PITCH - (PITCH - W);
  const width  = (height / H) * vbW;

  return (
    <svg
      role="img"
      aria-label={label ?? value}
      viewBox={`-1 -1 ${vbW + 2} ${H + 2}`}
      width={width}
      height={height}
      className={className}
      style={{ filter: `drop-shadow(0 0 3px ${color}99)`, overflow: 'visible' }}
    >
      {/* Slight forward lean, like a real digital clock face. */}
      <g transform={`skewX(-6) translate(${H * 0.05} 0)`}>
        {chars.map((ch, i) => {
          const lit = DIGIT_SEGMENTS[ch] ?? [];
          return (
            <g key={i} transform={`translate(${i * PITCH} 0)`}>
              {ALL_SEGMENTS.map((seg) => (
                <polygon
                  key={seg}
                  points={SEGMENT_POINTS[seg]}
                  fill={color}
                  opacity={lit.includes(seg) ? 1 : ghostOpacity}
                />
              ))}
            </g>
          );
        })}
      </g>
    </svg>
  );
};
