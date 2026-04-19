// =============================================================================
// BATTLECRAPS — UNLOCK NOTIFICATION TOAST
// apps/web/src/components/UnlockNotification.tsx
//
// Fixed-position overlay that appears when the `unlocks:granted` WebSocket
// event fires. Auto-dismisses after 4 s. Player can also close it manually.
// =============================================================================

import React, { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore.js';

const AUTO_DISMISS_MS = 4000;

export const UnlockNotification: React.FC = () => {
  const notification          = useGameStore((s) => s.unlockNotification);
  const clearUnlockNotification = useGameStore((s) => s.clearUnlockNotification);

  // Auto-dismiss timer — resets whenever a new notification arrives.
  useEffect(() => {
    if (!notification) return;
    const id = setTimeout(clearUnlockNotification, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [notification, clearUnlockNotification]);

  if (!notification) return null;

  const { crewNames } = notification;

  return (
    <div
      role="status"
      aria-live="polite"
      className="
        fixed top-4 left-1/2 -translate-x-1/2 z-[9999]
        pointer-events-auto
        max-w-xs w-full px-4 py-3
        bg-black border-2 border-yellow-400
        shadow-[0_0_16px_rgba(250,204,21,0.5)]
        flex flex-col gap-2
        animate-[fadeSlideDown_0.25s_ease-out]
      "
      style={{ borderRadius: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-pixel text-[8px] text-yellow-300 tracking-widest leading-none">
          NEW CREW UNLOCKED!
        </span>
        <button
          type="button"
          onClick={clearUnlockNotification}
          aria-label="Dismiss"
          className="
            font-pixel text-[7px] text-gray-400 hover:text-gray-100
            leading-none transition-colors
          "
        >
          ✕
        </button>
      </div>

      {/* Crew names */}
      <ul className="flex flex-col gap-1">
        {crewNames.map((name) => (
          <li
            key={name}
            className="font-pixel text-[7px] text-white leading-none pl-2
              before:content-['▶'] before:mr-2 before:text-yellow-400"
          >
            {name}
          </li>
        ))}
      </ul>

      {/* Progress bar */}
      <div className="h-px bg-white/10 w-full mt-1">
        <div
          className="h-full bg-yellow-400"
          style={{
            animation: `shrink ${AUTO_DISMISS_MS}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
};
