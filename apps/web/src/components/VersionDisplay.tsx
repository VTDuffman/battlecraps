// =============================================================================
// BATTLECRAPS — VERSION DISPLAY
// apps/web/src/components/VersionDisplay.tsx
//
// Renders the current version as a clickable button. Shows a NEW badge when
// the stored version doesn't match the latest (string equality — avoids semver
// parsing pitfalls like "v0.10.0" < "v0.9.0" under lexicographic comparison).
// Clicking marks the version seen and opens the ReleaseNotesModal.
// =============================================================================

import React, { useState, useEffect } from 'react';
import releaseNotes from '../lib/releaseNotes.json';
import { ReleaseNotesModal } from './ReleaseNotesModal.js';

interface ReleaseEntry {
  version: string;
  date: string;
  commits: { hash: string; message: string; date: string }[];
}

const notes = releaseNotes as ReleaseEntry[];
const STORAGE_KEY = 'battlecraps_last_seen_version';

export const VersionDisplay: React.FC = () => {
  const latestVersion = notes[0]?.version ?? '';

  const [hasNew, setHasNew]     = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    setHasNew(seen !== latestVersion);
  }, [latestVersion]);

  const handleClick = () => {
    localStorage.setItem(STORAGE_KEY, latestVersion);
    setHasNew(false);
    setModalOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={[
          'relative inline-flex items-center gap-1.5 group transition-transform',
          hasNew
            ? 'scale-150 origin-bottom-right animate-pulse'
            : '',
        ].join(' ')}
        aria-label={`Version ${latestVersion}${hasNew ? ' — new update available' : ''}`}
      >
        <span
          className={[
            'font-pixel text-[6px] tracking-widest transition-colors leading-none',
            hasNew
              ? 'text-green-400 group-hover:text-green-300 [text-shadow:_0_0_12px_currentColor]'
              : 'text-white/30 group-hover:text-white/60',
          ].join(' ')}
        >
          {hasNew ? `New - ${latestVersion}` : latestVersion}
        </span>
      </button>

      <ReleaseNotesModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
};
