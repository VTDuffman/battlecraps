import React, { useState, useEffect } from 'react';
import { getFloorTheme }              from '../lib/floorThemes.js';
import { LeaderboardEntry }           from './LeaderboardEntry.js';
import { GAUNTLET }                   from '@battlecraps/shared';
import type {
  GlobalLeaderboardResponse,
  PersonalLeaderboardResponse,
} from '@battlecraps/shared';

interface LeaderboardScreenProps {
  onBack: () => void;
}

type Tab = 'global' | 'personal';

const theme = getFloorTheme(GAUNTLET.length - 1);

const API_BASE = (import.meta as { env: Record<string, string> }).env['VITE_API_URL'] ?? '';

function SectionHeader({ label }: { label: string }) {
  return (
    <p
      className="font-pixel text-[7px] tracking-[0.4em] mb-3"
      style={{ color: `${theme.accentPrimary}60` }}
    >
      {label}
    </p>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p
      className="font-mono text-center text-[9px] py-8"
      style={{ color: `${theme.accentPrimary}30` }}
    >
      {label}
    </p>
  );
}

export function LeaderboardScreen({ onBack }: LeaderboardScreenProps) {
  const [tab,          setTab]          = useState<Tab>('global');
  const [globalData,   setGlobalData]   = useState<GlobalLeaderboardResponse | null>(null);
  const [personalData, setPersonalData] = useState<PersonalLeaderboardResponse | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        if (tab === 'global') {
          const res = await fetch(`${API_BASE}/api/v1/leaderboard?view=global`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json() as GlobalLeaderboardResponse;
          if (!cancelled) setGlobalData(data);
        } else {
          const token = await window.Clerk?.session?.getToken();
          const res = await fetch(`${API_BASE}/api/v1/leaderboard?view=personal`, {
            headers: { Authorization: `Bearer ${token ?? ''}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json() as PersonalLeaderboardResponse;
          if (!cancelled) setPersonalData(data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load leaderboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchData();
    return () => { cancelled = true; };
  }, [tab]);

  return (
    <div
      className="relative w-full max-w-lg mx-auto min-h-[100dvh] flex flex-col"
      style={{ background: theme.feltPrimary, borderColor: theme.borderHigh }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 p-4 border-b"
        style={{ borderColor: `${theme.accentDim}30` }}
      >
        <button
          type="button"
          onClick={onBack}
          className="font-pixel text-[8px]"
          style={{ color: theme.accentPrimary }}
        >
          ← BACK
        </button>
        <h2
          className="vegas-marquee-text font-pixel text-[10px] tracking-widest flex-1 text-center"
          style={{ color: theme.accentBright }}
        >
          HIGH ROLLER'S CLUB
        </h2>
      </div>

      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: `${theme.accentDim}30` }}>
        {(['global', 'personal'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="flex-1 py-2 font-pixel text-[8px] tracking-widest transition-colors"
            style={{
              color:        tab === t ? theme.accentBright : `${theme.accentPrimary}50`,
              borderBottom: tab === t ? `2px solid ${theme.accentPrimary}` : '2px solid transparent',
              background:   'transparent',
            }}
          >
            {t === 'global' ? 'GLOBAL' : 'MY RUNS'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <p
            className="font-mono text-center text-[9px]"
            style={{ color: `${theme.accentPrimary}50` }}
          >
            Loading...
          </p>
        )}
        {error && (
          <p className="font-mono text-center text-[9px] text-red-400">{error}</p>
        )}

        {tab === 'global' && globalData && !loading && (
          <>
            <SectionHeader label="THE HALL OF FAME" />
            {globalData.winners.length === 0
              ? <EmptyState label="No victors yet. Be the first." />
              : globalData.winners.map((entry, i) => (
                  <LeaderboardEntry key={entry.id} entry={entry} rank={i + 1} />
                ))
            }

            <div className="mt-6 mb-2">
              <SectionHeader label="GONE BUT NOT FORGOTTEN" />
            </div>
            {globalData.nonWinners.length === 0
              ? <EmptyState label="No fallen runners yet." />
              : globalData.nonWinners.map((entry, i) => (
                  <LeaderboardEntry key={entry.id} entry={entry} rank={i + 1} showMarker />
                ))
            }
          </>
        )}

        {tab === 'personal' && personalData && !loading && (
          <>
            <SectionHeader label="YOUR RUN HISTORY" />
            {personalData.entries.length === 0
              ? <EmptyState label="No runs recorded yet. Start rolling." />
              : personalData.entries.map((entry, i) => (
                  <LeaderboardEntry key={entry.id} entry={entry} rank={i + 1} showMarker />
                ))
            }
          </>
        )}
      </div>
    </div>
  );
}
