// =============================================================================
// BATTLECRAPS — ROOT APP
// apps/web/src/App.tsx
//
// Auth flow:
//   1. Clerk manages the Google OAuth session via <ClerkProvider> in main.tsx.
//   2. Unauthenticated visitors see a <SignIn /> screen.
//   3. Authenticated users see TitleLobbyScreen — choose Continue or New Run.
//   4. On lobby action, POST /auth/provision ensures a DB user record exists.
//   5. Run state is loaded from localStorage (bc_run_id) or a fresh run is
//      created via POST /api/v1/runs.
//   6. connectToRun() initialises the game.
//
// The only bypass for TitleLobbyScreen is onPlayAgain() from Game Over /
// Victory, which calls bootstrap(true) directly without re-showing the lobby.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { SignIn, useUser, useAuth }    from '@clerk/react';
import { TableBoard }                  from './components/TableBoard.js';
import { useGameStore }                from './store/useGameStore.js';
import { TransitionOrchestrator }      from './transitions/TransitionOrchestrator.js';
import { TitleLobbyScreen }            from './components/TitleLobbyScreen.js';
import { UnlockNotification }          from './components/UnlockNotification.js';
import { KnowledgeGate }              from './components/tutorial/KnowledgeGate.js';
import { TutorialOverlay }            from './components/tutorial/TutorialOverlay.js';
import type { StoredCrewSlots }        from './store/useGameStore.js';
import type { Bets }                   from '@battlecraps/shared';

// ---------------------------------------------------------------------------
// API base URL
// ---------------------------------------------------------------------------

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '';

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

const LS_RUN_ID = 'bc_run_id';

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

interface RunStateData {
  bankroll:           number;
  shooters:           number;
  hype:               number;
  phase:              'COME_OUT' | 'POINT_ACTIVE';
  status:             string;
  point:              number | null;
  crewSlots:          StoredCrewSlots;
  currentMarkerIndex: number;
  bets?:              Bets;
  maxBankrollCents?:  number;
  tutorialCompleted?: boolean;
}

interface CreateRunResponse {
  runId: string;
  run:   RunStateData & { tutorialCompleted?: boolean };
}

// ---------------------------------------------------------------------------
// Inner component — only rendered when Clerk confirms the user is signed in
// ---------------------------------------------------------------------------

const AuthenticatedApp: React.FC = () => {
  const { user }     = useUser();
  const { getToken } = useAuth();
  const connectToRun = useGameStore((s) => s.connectToRun);
  const disconnect   = useGameStore((s) => s.disconnect);
  const setGetToken  = useGameStore((s) => s.setGetToken);

  // Inject the Clerk getToken function into the store on mount so all fetch
  // actions can get fresh JWTs without depending on React context.
  useEffect(() => {
    setGetToken(getToken);
    return () => setGetToken(null);
  }, [getToken, setGetToken]);

  const [showTitleLobby,       setShowTitleLobby]       = useState(true);
  const [loading,              setLoading]              = useState(false);
  const [error,                setError]                = useState<string | null>(null);
  // Default true — existing users who bootstrap before the flag is read are
  // treated as tutorial-complete so they never see the gate unexpectedly.
  // Overridden to false when the API returns tutorialCompleted: false.
  const [tutorialCompleted,    setTutorialCompleted]    = useState(true);
  // Gate is shown when !tutorialCompleted && !tutorialGateDismissed.
  // Dismissed once the player makes a choice (full / bc-only / skip).
  const [tutorialGateDismissed, setTutorialGateDismissed] = useState(false);
  // T-004: path selected in the gate, consumed by TutorialOverlay.
  const [tutorialPath,         setTutorialPath]         = useState<'FULL' | 'BC_ONLY' | null>(null);
  // T-004: true while the TutorialOverlay is rendering beats.
  const [tutorialActive,       setTutorialActive]       = useState(false);

  const bootstrap = React.useCallback(async (forceNew = false) => {
    if (!user) return;

    setLoading(true);
    setError(null);

    if (forceNew) {
      localStorage.removeItem(LS_RUN_ID);
    }

    try {
      // ── 1. Ensure our DB has a user record for this Clerk identity ────────
      const displayName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.username ||
        user.primaryEmailAddress?.emailAddress?.split('@')[0] ||
        'Player';

      const token = await getToken();
      const provRes = await fetch(`${API_BASE}/api/v1/auth/provision`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          email:       user.primaryEmailAddress?.emailAddress ?? '',
          displayName,
        }),
      });

      if (!provRes.ok) {
        throw new Error(`Provision failed: ${provRes.status} ${provRes.statusText}`);
      }

      const provData = (await provRes.json()) as { userId: string; tutorialCompleted?: boolean };
      if (provData.tutorialCompleted === false) {
        setTutorialCompleted(false);
      }

      // ── 2. Try to restore cached run ─────────────────────────────────────
      const runId = localStorage.getItem(LS_RUN_ID);

      if (runId) {
        const freshToken = await getToken();
        const check = await fetch(`${API_BASE}/api/v1/runs/${runId}`, {
          headers: { 'Authorization': `Bearer ${freshToken ?? ''}` },
        });

        if (check.ok) {
          const data = (await check.json()) as RunStateData;
          if (data.tutorialCompleted === false) {
            setTutorialCompleted(false);
          }
          connectToRun(runId, {
            bankroll:           data.bankroll,
            shooters:           data.shooters,
            hype:               data.hype,
            phase:              data.phase,
            status:             data.status as never,
            point:              data.point,
            crewSlots:          data.crewSlots,
            currentMarkerIndex: data.currentMarkerIndex,
            ...(data.bets && { bets: data.bets }),
            ...(data.maxBankrollCents !== undefined && { maxBankrollCents: data.maxBankrollCents }),
          });
          setLoading(false);
          return;
        }
      }

      // ── 3. No cached run — create a new one ──────────────────────────────
      const freshToken = await getToken();
      const res = await fetch(`${API_BASE}/api/v1/runs`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${freshToken ?? ''}`,
        },
        body: '{}',
      });
      if (!res.ok) {
        throw new Error(`Create run failed: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as CreateRunResponse;
      localStorage.setItem(LS_RUN_ID, data.runId);

      if (data.run.tutorialCompleted === false) {
        setTutorialCompleted(false);
      }

      connectToRun(data.runId, {
        bankroll:           data.run.bankroll,
        shooters:           data.run.shooters,
        hype:               data.run.hype,
        phase:              data.run.phase,
        status:             data.run.status as never,
        point:              data.run.point,
        crewSlots:          data.run.crewSlots,
        currentMarkerIndex: data.run.currentMarkerIndex,
        ...(data.run.bets && { bets: data.run.bets }),
        ...(data.run.maxBankrollCents !== undefined && { maxBankrollCents: data.run.maxBankrollCents }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[bootstrap]', err);
    } finally {
      setLoading(false);
    }
  }, [user, connectToRun, getToken]);

  // Fire-and-forget — marks tutorial complete in DB on skip or beat completion.
  const markTutorialComplete = React.useCallback(async () => {
    try {
      const token = await getToken();
      void fetch(`${API_BASE}/api/v1/auth/tutorial-complete`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token ?? ''}` },
      });
    } catch {
      // Non-critical — tutorial flag is cosmetic, failure is safe to ignore.
    }
  }, [getToken]);

  // ── Tutorial completion handlers (hoisted above early returns per Rules of Hooks) ──
  const handleTutorialComplete = useCallback(() => {
    void markTutorialComplete();
    setTutorialActive(false);
    setTutorialCompleted(true);
  }, [markTutorialComplete]);

  const handleTutorialSkip = useCallback(() => {
    void markTutorialComplete();
    setTutorialActive(false);
    setTutorialCompleted(true);
  }, [markTutorialComplete]);

  // ── Knowledge Gate handlers ──────────────────────────────────────────────
  const handleGateFull = () => {
    setTutorialPath('FULL');
    setTutorialActive(true);
    setTutorialGateDismissed(true);
  };

  const handleGateBCOnly = () => {
    setTutorialPath('BC_ONLY');
    setTutorialActive(true);
    setTutorialGateDismissed(true);
  };

  const handleGateSkip = () => {
    void markTutorialComplete();
    setTutorialCompleted(true);
    setTutorialGateDismissed(true);
  };

  useEffect(() => {
    // Clean up legacy localStorage key from Phase 2/3.
    localStorage.removeItem('bc_run_user_id');

    return () => disconnect();
  // disconnect is stable — safe to omit from deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lobby action handlers ────────────────────────────────────────────────
  const handleContinue = () => {
    setShowTitleLobby(false);
    void bootstrap();
  };

  const handleNewRun = () => {
    setShowTitleLobby(false);
    void bootstrap(true);
  };

  // ── Title lobby — shown at session start before any run is loaded ───────
  if (showTitleLobby) {
    return (
      <main className="h-[100dvh] overflow-hidden flex items-start justify-center bg-black">
        <TitleLobbyScreen
          hasActiveRun={localStorage.getItem(LS_RUN_ID) !== null}
          onContinue={handleContinue}
          onNewRun={handleNewRun}
        />
      </main>
    );
  }

  // ── Loading screen ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-black gap-4">
        <div className="font-pixel text-[10px] text-gold animate-pulse">
          LOADING TABLE…
        </div>
        <div className="font-pixel text-[7px] text-white/30">
          Connecting to server
        </div>
      </main>
    );
  }

  // ── Error screen ────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-black gap-6 px-8">
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

// ── Tutorial Knowledge Gate ──────────────────────────────────────────────
  // Shown once for new players before the TransitionOrchestrator fires TITLE.
  if (!tutorialCompleted && !tutorialGateDismissed) {
    return (
      <main className="h-[100dvh] overflow-hidden flex items-start justify-center bg-black">
        <div className="relative w-full max-w-lg h-[100dvh]">
          <TableBoard />
          <KnowledgeGate
            onFull={handleGateFull}
            onBCOnly={handleGateBCOnly}
            onSkip={handleGateSkip}
          />
        </div>
      </main>
    );
  }

  // ── Tutorial Overlay ─────────────────────────────────────────────────────
  if (tutorialActive && tutorialPath) {
    return (
      <main className="h-[100dvh] overflow-hidden flex items-start justify-center bg-black">
        <div className="relative w-full max-w-lg h-[100dvh]">
          <TutorialOverlay
            path={tutorialPath}
            onComplete={handleTutorialComplete}
            onSkip={handleTutorialSkip}
          >
            <TableBoard />
          </TutorialOverlay>
        </div>
      </main>
    );
  }

  // ── Game screens ────────────────────────────────────────────────────────
  return (
    <main className="h-[100dvh] overflow-hidden flex items-start justify-center bg-black">
      <TransitionOrchestrator onPlayAgain={() => void bootstrap(true)}>
        <TableBoard />
      </TransitionOrchestrator>
      <UnlockNotification />
    </main>
  );
};

// ---------------------------------------------------------------------------
// Root component — shows sign-in screen for unauthenticated visitors
// ---------------------------------------------------------------------------

export const App: React.FC = () => {
  const { isSignedIn, isLoaded } = useUser();

  // Clerk is still loading its session state — show nothing briefly.
  if (!isLoaded) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-black">
        <div className="font-pixel text-[10px] text-gold animate-pulse">
          LOADING…
        </div>
      </main>
    );
  }

  // Not signed in — render Clerk's pre-built sign-in UI.
  if (!isSignedIn) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-black gap-6">
        <div className="font-pixel text-[12px] text-gold tracking-widest">
          BATTLE CRAPS
        </div>
        <SignIn />
      </main>
    );
  }

  return <AuthenticatedApp />;
};
