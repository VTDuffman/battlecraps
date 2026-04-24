// =============================================================================
// BATTLECRAPS — ALIAS PICKER MODAL
// apps/web/src/components/AliasPickerModal.tsx
//
// Full-screen overlay shown once per account when aliasChosen === false.
// Player enters a public handle (2–20 chars, alphanumeric + _ -).
// On success, calls onConfirmed() so App.tsx can resume the flow.
// =============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { getFloorTheme } from '../lib/floorThemes.js';

const theme = getFloorTheme(0);

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '';

const ALIAS_PATTERN = /^[a-zA-Z0-9_-]{2,20}$/;

interface AliasPickerModalProps {
  onConfirmed: (alias: string) => void;
  getToken:    () => Promise<string | null>;
}

export const AliasPickerModal: React.FC<AliasPickerModalProps> = ({
  onConfirmed,
  getToken,
}) => {
  const [alias,       setAlias]       = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const validate = (value: string): string | null => {
    if (value.length < 2)  return 'Handle must be at least 2 characters.';
    if (value.length > 20) return 'Handle must be 20 characters or fewer.';
    if (!ALIAS_PATTERN.test(value)) return 'Letters, numbers, _ and - only.';
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAlias(e.target.value);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validate(alias);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/v1/auth/set-alias`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ alias }),
      });

      if (res.status === 409) {
        setError('That handle is already taken. Try another.');
        return;
      }

      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }

      onConfirmed(alias);
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="mx-6 w-full max-w-sm p-8 rounded flex flex-col items-center gap-6 border-2"
        style={{
          background:  `radial-gradient(ellipse at 50% 0%, ${theme.feltPrimary}30 0%, #050505 100%)`,
          borderColor: theme.accentPrimary,
          boxShadow:   `0 0 40px 8px ${theme.accentPrimary}25`,
        }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div
            className="font-pixel text-[11px] tracking-widest"
            style={{ color: theme.accentBright }}
          >
            CHOOSE YOUR HANDLE
          </div>
          <p
            className="font-mono text-center leading-relaxed"
            style={{ fontSize: '9px', color: `${theme.accentPrimary}70` }}
          >
            Your public alias on the leaderboard.
            <br />
            2–20 chars · letters, numbers, _ and -
          </p>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e); }} className="w-full flex flex-col gap-4">
          <input
            ref={inputRef}
            type="text"
            value={alias}
            onChange={handleChange}
            maxLength={20}
            placeholder="e.g. dice_wizard"
            disabled={submitting}
            className="
              w-full px-4 py-3 rounded
              font-pixel text-[9px] tracking-wider
              bg-black/60 border
              outline-none
              placeholder:opacity-30
              transition-colors
            "
            style={{
              color:       theme.accentBright,
              borderColor: error ? '#ef4444' : `${theme.accentDim}60`,
            }}
          />

          {/* Error */}
          {error && (
            <div
              className="font-mono text-center"
              style={{ fontSize: '8px', color: '#ef4444' }}
            >
              {error}
            </div>
          )}

          {/* Char counter */}
          <div
            className="font-pixel text-right"
            style={{ fontSize: '7px', color: `${theme.accentDim}50` }}
          >
            {alias.length}/20
          </div>

          <button
            type="submit"
            disabled={submitting || alias.length < 2}
            className="
              w-full py-3.5 rounded
              font-pixel text-[10px] tracking-widest
              border-2 text-amber-100
              transition-all duration-150 active:scale-95
              disabled:opacity-40 disabled:cursor-not-allowed
            "
            style={{
              borderColor: theme.accentPrimary,
              background:  `linear-gradient(180deg, ${theme.feltPrimary}cc 0%, #050505 100%)`,
              boxShadow:   alias.length >= 2 ? `0 0 24px 6px ${theme.accentPrimary}35` : 'none',
            }}
          >
            {submitting ? 'SAVING…' : '▶ CONFIRM HANDLE'}
          </button>
        </form>
      </div>
    </div>
  );
};
