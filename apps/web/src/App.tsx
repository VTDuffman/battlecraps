// =============================================================================
// BATTLECRAPS — ROOT APP
// apps/web/src/App.tsx
//
// Dev Bootstrapper: on first load, calls POST /api/v1/dev/bootstrap to create
// a fresh run with 3 seated crew members. Persists the userId and runId in
// localStorage so a page refresh reconnects to the same run rather than
// creating a new one. A "New Run" button clears localStorage and resets.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { TableBoard }      from './components/TableBoard.js';
import { PubScreen }       from './components/PubScreen.js';
import { GameOverScreen }  from './components/GameOverScreen.js';
import { useGameStore }    from './store/useGameStore.js';
import type { StoredCrewSlots } from './store/useGameStore.js';

// ---------------------------------------------------------------------------
// Marker Celebration Modal
// Shown when status first becomes 'TRANSITION'. The player must click through
// to continue — this prevents the immediate snap to the Pub that was confusing QA.
// ---------------------------------------------------------------------------

interface MarkerCelebrationProps {
  onEnterPub: () => void;
}

const MarkerCelebration: React.FC<MarkerCelebrationProps> = ({ onEnterPub }) => (
  <div
    className="
      relative w-full max-w-lg mx-auto min-h-screen
      flex flex-col items-center justify-center gap-8
      bg-black border-x-4 border-amber-800/60
    "
    style={{
      background: 'radial-gradient(ellipse at 50% 40%, #2a1500 0%, #0d0700 60%, #000 100%)',
    }}
  >
    {/* Glow bar */}
    <div
      className="absolute top-0 left-0 right-0 h-1"
      style={{
        background: 'linear-gradient(90deg, transparent, #c47d0a 30%, #f5c842 50%, #c47d0a 70%, transparent)',
      }}
    />

    <div className="flex flex-col items-center gap-4 px-8 text-center">
      <div className="font-pixel text-[8px] text-amber-400/70 tracking-widest">
        ✦ MARKER CLEARED ✦
      </div>

      <h1
        className="font-pixel text-[20px] tracking-wide"
        style={{
          color: '#f5c842',
          textShadow: '0 0 30px #c47d0a, 0 0 80px #7a4500, 0 0 120px #3d2200',
        }}
      >
        NICE ROLL!
      </h1>

      <p className="font-mono text-[10px] text-amber-300/50 max-w-xs leading-relaxed">
        You&apos;ve hit the marker target. A new shooter and 5 fresh lives await.
        Head to the pub to hire your next crew member.
      </p>
    </div>

    <button
      type="button"
      onClick={onEnterPub}
      className="
        px-10 py-3 rounded
        font-pixel text-[9px] tracking-widest
        border-2 border-amber-500
        text-amber-100
        transition-all duration-150 active:scale-95
      "
      style={{
        background: 'linear-gradient(180deg, #7a4500 0%, #3d2200 100%)',
        boxShadow: '0 0 20px 4px rgba(196,125,10,0.3)',
      }}
    >
      ▶ VISIT THE PUB
    </button>

    {/* Glow bar bottom */}
    <div
      className="absolute bottom-0 left-0 right-0 h-1"
      style={{
        background: 'linear-gradient(90deg, transparent, #c47d0a 30%, #f5c842 50%, #c47d0a 70%, transparent)',
      }}
    />
  </div>
);

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
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const App: React.FC = () => {
  const connectToRun = useGameStore((s) => s.connectToRun);
  const disconnect   = useGameStore((s) => s.disconnect);
  const runStatus    = useGameStore((s) => s.status);

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Gate the pub transition behind a celebration modal.
  // `pubReady` starts false each time the status becomes TRANSITION.
  // The player must click through MarkerCelebration to set it true,
  // which then unmounts the celebration and mounts PubScreen.
  const [pubReady, setPubReady] = useState(false);
  const prevStatus = useRef(runStatus);
  useEffect(() => {
    if (prevStatus.current !== 'TRANSITION' && runStatus === 'TRANSITION') {
      setPubReady(false);
    }
    prevStatus.current = runStatus;
  }, [runStatus]);

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
        const check = await fetch(`/api/v1/runs/${runId}`, {
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
          });
          setLoading(false);
          return;
        }
      }

      // No cached run (or stale) — hit the bootstrap endpoint.
      const res = await fetch('/api/v1/dev/bootstrap', { method: 'POST' });
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
      <main className="min-h-screen flex flex-col items-center justify-center bg-black gap-4">
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
      <main className="min-h-screen flex flex-col items-center justify-center bg-black gap-6 px-8">
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
    <main className="min-h-screen flex items-start justify-center bg-black">
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

      {runStatus === 'GAME_OVER'
        ? <GameOverScreen onPlayAgain={() => void bootstrap(true)} />
        : runStatus === 'TRANSITION' && !pubReady
          ? <MarkerCelebration onEnterPub={() => setPubReady(true)} />
          : runStatus === 'TRANSITION'
            ? <PubScreen />
            : <TableBoard />
      }
    </main>
  );
};
