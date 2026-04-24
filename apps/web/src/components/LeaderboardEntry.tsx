import React, { useState } from 'react';
import { getFloorTheme }   from '../lib/floorThemes.js';
import type { LeaderboardEntry as LeaderboardEntryData } from '@battlecraps/shared';

const CREW_EMOJI: Record<number, string> = {
  1:  '🎰', // Lefty
  2:  '🧪', // Physics Prof
  3:  '🔧', // Mechanic
  4:  '🧮', // Mathlete
  5:  '🪬', // Floor Walker
  6:  '🪑', // Regular
  7:  '💸', // Big Spender
  8:  '🦈', // Shark
  9:  '🐋', // Whale
  10: '🫣', // Nervous Intern
  11: '📣', // Hype-Train Holly
  12: '🍺', // Drunk Uncle
  13: '👥', // Mimic
  14: '🦯', // Old Pro
  15: '🍀', // Lucky Charm
  16: '🔭', // Lookout
  17: '🎯', // Ace McGee
  18: '😬', // Close Call
  19: '📈', // Momentum
  20: '🔁', // Echo
  21: '🌤️', // Silver Lining
  22: '🤪', // Odd Couple
  23: '⚖️', // Even Keel
  24: '🚪', // Doorman
  25: '⚙️', // Grinder
  26: '📊', // Handicapper
  27: '🪞', // Mirror
  28: '📒', // Bookkeeper
  29: '🌡️', // Pressure Cooker
  30: '📉', // Contrarian
};

interface LeaderboardEntryProps {
  entry:       LeaderboardEntryData;
  rank:        number;
  showMarker?: boolean;
}

const theme = getFloorTheme(0);

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export function LeaderboardEntry({ entry, rank, showMarker }: LeaderboardEntryProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="mb-2 rounded border"
      style={{ borderColor: `${theme.accentDim}25`, background: 'rgba(5,5,5,0.6)' }}
    >
      {/* Main row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        {/* Rank badge */}
        <span
          className="font-pixel text-[8px] w-5 text-right flex-shrink-0"
          style={{ color: `${theme.accentPrimary}60` }}
        >
          {rank}.
        </span>

        {/* Name */}
        <span
          className="font-pixel text-[9px] flex-1 truncate"
          style={{ color: theme.accentBright }}
        >
          {entry.displayName}
        </span>

        {/* Bankroll */}
        <span className="font-mono text-[9px]" style={{ color: theme.accentPrimary }}>
          {fmtDollars(entry.finalBankrollCents)}
        </span>

        {/* Marker badge or WIN star */}
        {showMarker ? (
          <span
            className="font-pixel text-[7px] px-1.5 py-0.5 rounded"
            style={{ background: `${theme.accentDim}20`, color: `${theme.accentPrimary}70` }}
          >
            MKR {Math.min(entry.highestMarkerIndex, 8) + 1}
          </span>
        ) : entry.didWinRun ? (
          <span className="font-pixel text-[7px]" style={{ color: theme.accentBright }}>★</span>
        ) : null}

        {/* Expand chevron */}
        <span className="font-mono text-[8px]" style={{ color: `${theme.accentPrimary}40` }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Secondary data row — always visible below main row */}
      <div className="px-3 pb-2 flex gap-4">
        <span className="font-mono text-[8px]" style={{ color: `${theme.accentPrimary}50` }}>
          Best roll: {fmtDollars(entry.highestRollAmplifiedCents)}
        </span>
        <span className="font-mono text-[8px]" style={{ color: `${theme.accentPrimary}40` }}>
          {fmtDate(entry.createdAt)}
        </span>
      </div>

      {/* Expandable crew drawer */}
      {expanded && (
        <div className="px-3 pb-3 border-t" style={{ borderColor: `${theme.accentDim}20` }}>
          <p
            className="font-pixel text-[7px] tracking-widest mt-2 mb-1.5"
            style={{ color: `${theme.accentPrimary}40` }}
          >
            CREW
          </p>
          <div className="grid grid-cols-5 gap-2">
            {entry.crewLayout.map((slot, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center p-2 rounded"
                style={{
                  background: slot ? `${theme.feltPrimary}30`  : 'rgba(20,20,20,0.5)',
                  border:     `1px solid ${slot ? `${theme.accentDim}40` : `${theme.accentDim}15`}`,
                }}
              >
                <span className="text-2xl leading-none mb-1">
                  {slot ? (CREW_EMOJI[slot.id] ?? '❓') : '·'}
                </span>
                <span
                  className="font-mono text-[8px] text-center break-words w-full leading-tight"
                  style={{ color: slot ? theme.accentPrimary : `${theme.accentPrimary}25` }}
                >
                  {slot ? slot.name : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
