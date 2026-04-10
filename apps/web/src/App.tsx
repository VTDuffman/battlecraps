// =============================================================================
// BATTLECRAPS — ROOT APP
// apps/web/src/App.tsx
//
// Dev Bootstrapper: on first load, calls POST /api/v1/dev/bootstrap to create
// a fresh run with 3 seated crew members. Persists the userId and runId in
// localStorage so a page refresh reconnects to the same run rather than
// creating a new one. A "New Run" button clears localStorage and resets.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { TableBoard }               from './components/TableBoard.js';
import { useGameStore }             from './store/useGameStore.js';
import { TransitionOrchestrator }   from './transitions/TransitionOrchestrator.js';
import type { StoredCrewSlots }     from './store/useGameStore.js';
import type { Bets }                from '@battlecraps/shared';

// ---------------------------------------------------------------------------
// API base URL
// In production this must point to the Render API (set VITE_API_URL env var).
// In dev the Vite proxy is not used here — VITE_API_URL should be http://localhost:3001.
// ---------------------------------------------------------------------------

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '';

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

const LS_USER_ID = 'bc_dev_user_id';
const LS_RUN_ID  = 'bc_dev_run_id';

// ---------------------------------------------------------------------------
// Bootstrap API shape (mirrors apps/api/src/routes/bootstrap.ts)
// ---------------------------------------------------------------------------

interface BootstrapResponse {
  userId: string;
  runId:  string;
  run: {
    bankroll:           number;
    shooters:           number;
    hype:               number;
    phase:              'COME_OUT' | 'POINT_ACTIVE';
    status:             string;
    point:              number | null;
    crewSlots:          StoredCrewSlots;
    currentMarkerIndex: number;
    bets?:              Bets;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const App: React.FC = () => {
  const connectToRun = useGameStore((s) => s.connectToRun);
  const disconnect   = useGameStore((s) => s.disconnect);

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const bootstrap = React.useCallback(async (forceNew = false) => {
    setLoading(true);
    setError(null);

    if (forceNew) {
      localStorage.removeItem(LS_USER_ID);
      localStorage.removeItem(LS_RUN_ID);
    }

    try {
      let userId = localStorage.getItem(LS_USER_ID);
      let runId  = localStorage.getItem(LS_RUN_ID);

      // If we have both IDs cached, try to load the existing run first.
      // Falls through to bootstrap if the run no longer exists (e.g. DB wiped).
      if (userId && runId) {
        const check = await fetch(`${API_BASE}/api/v1/runs/${runId}`, {
          headers: { 'x-user-id': userId },
        });

        if (check.ok) {
          const data = (await check.json()) as BootstrapResponse['run'];
          connectToRun(runId, userId, {
            bankroll:           data.bankroll,
            shooters:           data.shooters,
            hype:               data.hype,
            phase:              data.phase,
            status:             data.status as never,
            point:              data.point,
            crewSlots:          data.crewSlots,
            currentMarkerIndex: data.currentMarkerIndex,
            ...(data.bets && { bets: data.bets }),
          });
          setLoading(false);
          return;
        }
      }

      // No cached run (or stale) — hit the bootstrap endpoint.
      const res = await fetch(`${API_BASE}/api/v1/dev/bootstrap`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    '{}',
      });
      if (!res.ok) {
        throw new Error(`Bootstrap failed: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as BootstrapResponse;
      localStorage.setItem(LS_USER_ID, data.userId);
      localStorage.setItem(LS_RUN_ID,  data.runId);

      connectToRun(data.runId, data.userId, {
        bankroll:           data.run.bankroll,
        shooters:           data.run.shooters,
        hype:               data.run.hype,
        phase:              data.run.phase,
        status:             data.run.status as never,
        point:              data.run.point,
        crewSlots:          data.run.crewSlots,
        currentMarkerIndex: data.run.currentMarkerIndex,
        ...(data.run.bets && { bets: data.run.bets }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[bootstrap]', err);
    } finally {
      setLoading(false);
    }
  }, [connectToRun]);

  // Bootstrap on mount; tear down socket on unmount.
  useEffect(() => {
    void bootstrap();
    return () => disconnect();
  // bootstrap and disconnect are stable — safe to omit from deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen h-[100dvh] flex flex-col items-center justify-center bg-black gap-4">
        <div className="font-pixel text-[10px] text-gold animate-pulse">
          LOADING TABLE…
        </div>
        <div className="font-pixel text-[7px] text-white/30">
          Connecting to server
        </div>
      </main>
    );
  }

  // ── Error screen ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="min-h-screen h-[100dvh] flex flex-col items-center justify-center bg-black gap-6 px-8">
        <div className="font-pixel text-[9px] text-red-400 text-center leading-6">
          FAILED TO CONNECT
        </div>
        <div className="font-mono text-xs text-white/50 text-center max-w-sm break-words">
          {error}
        </div>
        <div className="font-pixel text-[7px] text-white/30 text-center leading-6">
          Is the API running on :3001?
          <br />
          Did you run the DB migration?
        </div>
        <button
          type="button"
          onClick={() => void bootstrap(true)}
          className="
            mt-2 px-6 py-2 rounded
            font-pixel text-[8px]
            bg-red-900 border border-red-500 text-red-200
            hover:bg-red-800 active:scale-95
            transition-all
          "
        >
          RETRY
        </button>
      </main>
    );
  }

  // ── Game screens ──────────────────────────────────────────────────────────
  return (
    <main className="h-[100dvh] overflow-hidden flex items-start justify-center bg-black">
      {/* New Run button — top-left corner, always accessible */}
      <button
        type="button"
        onClick={() => void bootstrap(true)}
        className="
          fixed top-2 left-2 z-50
          font-pixel text-[5px] text-white/30
          border border-white/10 rounded
          px-1.5 py-1
          hover:text-white/60 hover:border-white/30
          transition-colors
        "
        title="Wipe localStorage and start a brand-new run"
      >
        NEW RUN
      </button>

      <TransitionOrchestrator onPlayAgain={() => void bootstrap(true)}>
        <TableBoard />
      </TransitionOrchestrator>
    </main>
  );
};
