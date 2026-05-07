import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../store/useGameStore.js';

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '';
const MAX_COMMENT = 2000;

type FeedbackType = 'bug' | 'sentiment' | 'idea';

interface FeedbackModalProps {
  isOpen:  boolean;
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const feedbackContextSnapshot = useGameStore((s) => s.feedbackContextSnapshot);
  const getToken                = useGameStore((s) => s.getToken);
  const clearFeedbackSnapshot   = useGameStore((s) => s.clearFeedbackSnapshot);

  const [type,       setType]       = useState<FeedbackType>('sentiment');
  const [rating,     setRating]     = useState<number | null>(null);
  const [comment,    setComment]    = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  if (!isOpen) return null;

  const snap = feedbackContextSnapshot;
  const floor = snap ? Math.floor(snap.currentMarkerIndex / 3) + 1 : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken?.();
      const res = await fetch(`${API_BASE}/api/v1/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          type,
          rating,
          comment,
          context: snap ?? null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        throw new Error(body.error ?? `Submit failed: ${res.status}`);
      }

      setSubmitted(true);
      setTimeout(() => {
        onClose();
        clearFeedbackSnapshot();
        // Reset local state for next open
        setType('sentiment');
        setRating(null);
        setComment('');
        setSubmitted(false);
        setError(null);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleBackdropClick() {
    if (!submitting) onClose();
  }

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={handleBackdropClick}
    >
      <div
        className="relative w-full max-w-sm bg-black border-2 border-yellow-600/60 shadow-[0_0_30px_rgba(161,100,0,0.3)]"
        style={{ borderRadius: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent bar */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, transparent, #d97706 40%, #fbbf24 50%, #d97706 60%, transparent)' }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <span className="font-pixel text-[9px] text-yellow-300 tracking-widest">
            ── SEND FEEDBACK ──
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="font-pixel text-[8px] text-white/30 hover:text-white/70 transition-colors disabled:opacity-30"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Context disclaimer */}
        {snap && (
          <div className="mx-5 mb-3 px-3 py-2 bg-white/5 border border-white/10 text-[7px] font-mono text-white/40 leading-relaxed">
            Context attached: Floor {floor}, Bankroll: ${(snap.bankroll / 100).toFixed(2)}, Last {snap.rollHistory.length} rolls
          </div>
        )}

        {submitted ? (
          <div className="px-5 pb-6 pt-2 flex flex-col items-center gap-3">
            <div
              className="font-pixel text-[13px] text-yellow-300"
              style={{ textShadow: '0 0 20px rgba(253,224,71,0.4)' }}
            >
              ★ RECEIVED ★
            </div>
            <p className="font-pixel text-[7px] text-white/50 tracking-wide text-center">
              Thanks for helping make the game better.
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => { void handleSubmit(e); }} className="px-5 pb-5 flex flex-col gap-4">

            {/* Type selector */}
            <div className="flex flex-col gap-1.5">
              <label className="font-pixel text-[6px] text-white/40 tracking-widest">TYPE</label>
              <div className="flex gap-2">
                {(['sentiment', 'bug', 'idea'] as FeedbackType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`
                      flex-1 py-1.5 font-pixel text-[6px] tracking-widest border transition-all duration-100
                      ${type === t
                        ? 'border-yellow-500 text-yellow-300 bg-yellow-900/30'
                        : 'border-white/15 text-white/30 hover:border-white/30 hover:text-white/50'
                      }
                    `}
                  >
                    {t === 'sentiment' ? 'GENERAL' : t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Rating */}
            <div className="flex flex-col gap-1.5">
              <label className="font-pixel text-[6px] text-white/40 tracking-widest">
                RATING <span className="text-white/20">(OPTIONAL)</span>
              </label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    className={`
                      flex-1 py-1.5 font-pixel text-[9px] border transition-all duration-100
                      ${rating !== null && n <= rating
                        ? 'border-yellow-500/60 text-yellow-400'
                        : 'border-white/15 text-white/20 hover:text-white/40 hover:border-white/30'
                      }
                    `}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-end justify-between">
                <label className="font-pixel text-[6px] text-white/40 tracking-widest">
                  COMMENT
                </label>
                <span className={`font-mono text-[6px] ${comment.length > MAX_COMMENT * 0.9 ? 'text-red-400' : 'text-white/20'}`}>
                  {comment.length}/{MAX_COMMENT}
                </span>
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
                rows={4}
                placeholder="Tell us what's on your mind..."
                className="
                  w-full bg-white/5 border border-white/15 text-white/80
                  font-mono text-[9px] leading-relaxed px-3 py-2 resize-none
                  placeholder:text-white/20 focus:outline-none focus:border-yellow-600/50
                  transition-colors
                "
                style={{ borderRadius: 0 }}
              />
            </div>

            {/* Error */}
            {error && (
              <p className="font-pixel text-[6px] text-red-400 tracking-wide">
                ✕ {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || comment.trim().length === 0}
              className="
                w-full py-2.5 font-pixel text-[8px] tracking-widest border-2
                transition-all duration-150 active:scale-[0.98]
                disabled:opacity-30 disabled:cursor-not-allowed
                border-yellow-600 text-yellow-200
                hover:enabled:bg-yellow-900/30
              "
              style={{
                background: submitting ? 'rgba(0,0,0,0.5)' : undefined,
              }}
            >
              {submitting ? '▷ SENDING...' : '▶ SEND FEEDBACK'}
            </button>
          </form>
        )}

        {/* Bottom accent bar */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, transparent, #92400e 40%, #d97706 50%, #92400e 60%, transparent)' }}
        />
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
