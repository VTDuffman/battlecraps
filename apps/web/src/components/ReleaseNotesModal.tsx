// =============================================================================
// BATTLECRAPS — RELEASE NOTES MODAL
// apps/web/src/components/ReleaseNotesModal.tsx
//
// Scrollable timeline of all versions. Index 0 = current (prominent), rest = history.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import releaseNotes from '../lib/releaseNotes.json';

interface ReleaseEntry {
  version: string;
  date: string;
  commits: { hash: string; message: string; date: string }[];
}

const notes = releaseNotes as ReleaseEntry[];

function formatCommitMessage(message: string): { prefix: string; body: string } {
  const match = message.match(/^(feat|fix|chore|docs|refactor|style|test|perf|build|ci|revert)(?:\([^)]+\))?:\s*/i);
  if (match) {
    return { prefix: match[0].replace(/:\s*$/, '').toLowerCase(), body: message.slice(match[0].length) };
  }
  return { prefix: '', body: message };
}

const PREFIX_COLORS: Record<string, string> = {
  feat:     '#4ade80',
  feature:  '#4ade80',
  fix:      '#fb923c',
  chore:    '#94a3b8',
  docs:     '#60a5fa',
  refactor: '#c084fc',
  style:    '#f472b6',
  test:     '#facc15',
  perf:     '#34d399',
  build:    '#94a3b8',
  ci:       '#94a3b8',
  revert:   '#f87171',
};

function getPrefixColor(prefix: string): string {
  const key = prefix.replace(/\(.*\)/, '').toLowerCase();
  return PREFIX_COLORS[key] ?? '#94a3b8';
}

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({ isOpen, onClose }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const [current, ...history] = notes;
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md flex flex-col"
        style={{
          background: '#0a0a0a',
          border: '2px solid #facc15',
          boxShadow: '0 0 24px rgba(250,204,21,0.25)',
          maxHeight: '85dvh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: '#facc1540' }}
        >
          <span className="font-pixel text-[8px] tracking-widest text-yellow-300">
            RELEASE NOTES
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-pixel text-[7px] text-white/40 hover:text-white/80 transition-colors leading-none"
            aria-label="Close release notes"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-5">

          {/* Current version — prominent */}
          <div
            className="p-4 rounded"
            style={{
              background: 'linear-gradient(135deg, rgba(250,204,21,0.10) 0%, rgba(0,0,0,0) 100%)',
              border: '1px solid rgba(250,204,21,0.4)',
              boxShadow: '0 0 12px rgba(250,204,21,0.10)',
            }}
          >
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <span className="font-pixel text-[11px] text-yellow-300 tracking-wide">
                {current.version}
              </span>
              <span className="font-mono text-[8px] text-white/40">
                {current.date}
              </span>
            </div>
            <div
              className="font-pixel text-[5px] tracking-[0.3em] text-yellow-400/60 mb-2"
            >
              CURRENT BUILD
            </div>
            <ul className="flex flex-col gap-2">
              {current.commits.map((c) => {
                const { prefix, body } = formatCommitMessage(c.message);
                return (
                  <li key={c.hash} className="flex items-start gap-2">
                    {prefix && (
                      <span
                        className="font-pixel text-[5px] tracking-wide shrink-0 mt-[2px] px-1.5 py-0.5 rounded-sm"
                        style={{
                          color: getPrefixColor(prefix),
                          background: `${getPrefixColor(prefix)}18`,
                          border: `1px solid ${getPrefixColor(prefix)}40`,
                        }}
                      >
                        {prefix.toUpperCase()}
                      </span>
                    )}
                    <span className="font-mono text-[9px] text-white/85 leading-snug">{body}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Divider */}
          {history.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <span className="font-pixel text-[5px] tracking-widest text-white/25">HISTORY</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>
          )}

          {/* History entries */}
          {history.map((entry) => {
            return (
              <div key={entry.version} className="flex gap-3">
                {/* Timeline spine */}
                <div className="flex flex-col items-center pt-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: 'rgba(255,255,255,0.2)' }}
                  />
                  <div className="w-px flex-1 mt-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
                </div>

                <div className="flex-1 pb-2">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="font-pixel text-[8px] text-white/50 tracking-wide">
                      {entry.version}
                    </span>
                    <span className="font-mono text-[7px] text-white/25">
                      {entry.date}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {entry.commits.map((c) => {
                      const { prefix, body } = formatCommitMessage(c.message);
                      return (
                        <li key={c.hash} className="flex items-start gap-1.5">
                          {prefix && (
                            <span
                              className="font-pixel text-[5px] tracking-wide shrink-0 mt-[1px] px-1 py-0.5 rounded-sm"
                              style={{
                                color: `${getPrefixColor(prefix)}99`,
                                background: `${getPrefixColor(prefix)}10`,
                                border: `1px solid ${getPrefixColor(prefix)}28`,
                              }}
                            >
                              {prefix.toUpperCase()}
                            </span>
                          )}
                          <span className="font-mono text-[8px] text-white/45 leading-snug">{body}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}

          {/* Bottom padding */}
          <div className="h-2" />
        </div>

        {/* Bottom accent bar */}
        <div
          className="h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #facc15, transparent)' }}
        />
      </div>
    </div>
  );
};
