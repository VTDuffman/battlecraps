// =============================================================================
// BATTLECRAPS — CRAPS BASICS REFERENCE SECTION
// apps/web/src/components/tutorial/sections/CrapsBasicsSection.tsx
//
// Static illustrated reference cards for base craps mechanics.
// No interactivity — scannable reference only.
// =============================================================================

import React from 'react';

interface ReferenceCardProps {
  title:    string;
  icon:     string;
  children: React.ReactNode;
}

const ReferenceCard: React.FC<ReferenceCardProps> = ({ title, icon, children }) => (
  <div className="border border-white/10 rounded bg-white/[0.03] p-4 space-y-2">
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <span className="font-pixel text-[8px] text-amber-300 tracking-widest">{title}</span>
    </div>
    <div className="font-dense text-[9px] text-gray-200 leading-relaxed space-y-1">
      {children}
    </div>
  </div>
);

const Outcome: React.FC<{ label: string; color: string; children: React.ReactNode }> = ({
  label, color, children,
}) => (
  <div className="flex items-start gap-2">
    <span className={`font-pixel text-[7px] ${color} flex-none pt-0.5`}>{label}</span>
    <span>{children}</span>
  </div>
);

export const CrapsBasicsSection: React.FC = () => (
  <div className="space-y-3 pb-4">

    {/* Come-Out Roll */}
    <ReferenceCard title="COME-OUT ROLL" icon="🎲">
      <p className="font-dense text-gray-300 text-[8px] mb-2">
        The first roll of a new shooter's turn.
      </p>
      <Outcome label="WIN" color="text-green-400">
        7 or 11 — Natural. Pass Line wins immediately.
      </Outcome>
      <Outcome label="LOSE" color="text-red-400">
        2, 3, or 12 — Craps Out. Pass Line loses immediately.
      </Outcome>
      <Outcome label="POINT" color="text-amber-300">
        4, 5, 6, 8, 9, or 10 — The point is set. Shooter continues.
      </Outcome>
    </ReferenceCard>

    {/* Pass Line */}
    <ReferenceCard title="PASS LINE" icon="🎯">
      <p className="font-dense text-gray-300 text-[8px] mb-2">
        The core bet. You're wagering with the shooter.
      </p>
      <Outcome label="WIN" color="text-green-400">
        Point is hit before a 7. Pays even money (1:1).
      </Outcome>
      <Outcome label="LOSE" color="text-red-400">
        7 rolls before the point (Seven Out). Bet is lost.
      </Outcome>
      <p className="font-dense text-gray-400 text-[8px] mt-1">
        Place before each come-out. Take it down before the point is set.
      </p>
    </ReferenceCard>

    {/* Point & Puck */}
    <ReferenceCard title="THE POINT" icon="⬜">
      <p className="font-dense text-gray-300 text-[8px] mb-2">
        Set on any come-out roll of 4, 5, 6, 8, 9, or 10.
        The white puck on the board marks the active point.
      </p>
      <Outcome label="GOAL" color="text-amber-300">
        Roll the point number again before rolling a 7.
      </Outcome>
      <Outcome label="RESET" color="text-blue-300">
        Point hit → puck goes OFF → new come-out begins.
      </Outcome>
      <Outcome label="BUST" color="text-red-400">
        7 before point → Seven Out → shooter loses the dice.
      </Outcome>
    </ReferenceCard>

    {/* Odds Bet */}
    <ReferenceCard title="ODDS BET" icon="📐">
      <p className="font-dense text-gray-300 text-[8px] mb-2">
        The only bet in the casino with zero house edge.
        Backs your Pass Line at true mathematical odds.
      </p>
      <div className="grid grid-cols-3 gap-1 mt-1 text-center">
        {[
          { point: '4 / 10', pays: '2:1',  max: '3×' },
          { point: '5 / 9',  pays: '3:2',  max: '4×' },
          { point: '6 / 8',  pays: '6:5',  max: '5×' },
        ].map(({ point, pays, max }) => (
          <div key={point} className="border border-white/10 rounded p-1.5 bg-black/20">
            <div className="text-amber-300 text-[8px] font-pixel">{point}</div>
            <div className="text-green-400 text-[8px] font-pixel mt-0.5">{pays}</div>
            <div className="font-dense text-gray-500 text-[7px] mt-0.5">max {max}</div>
          </div>
        ))}
      </div>
      <p className="font-dense text-gray-400 text-[8px] mt-1">
        Place behind your Pass Line after the point is set.
      </p>
    </ReferenceCard>

    {/* Seven-Out */}
    <ReferenceCard title="SEVEN OUT" icon="💀">
      <p className="font-dense text-gray-300 text-[8px] mb-2">
        When a 7 rolls during the point phase before the point is hit.
      </p>
      <Outcome label="RESULT" color="text-red-400">
        Pass Line and Odds bets are both lost.
      </Outcome>
      <Outcome label="THEN" color="text-gray-300">
        Shooter is done. New shooter steps up. New come-out begins.
      </Outcome>
      <p className="font-dense text-gray-400 text-[8px] mt-1">
        In BattleCraps, each seven-out costs one Shooter life.
      </p>
    </ReferenceCard>

    {/* Hardways */}
    <ReferenceCard title="HARDWAYS" icon="🎰">
      <p className="font-dense text-gray-300 text-[8px] mb-2">
        Side bets that require both dice to show matching faces.
        "Hard" means the exact pair — not any other combination.
      </p>
      <div className="grid grid-cols-2 gap-1 mt-1">
        {[
          { bet: 'Hard 4',  example: '2 + 2', pays: '7:1',  soft: '1+3' },
          { bet: 'Hard 6',  example: '3 + 3', pays: '9:1',  soft: '1+5, 2+4' },
          { bet: 'Hard 8',  example: '4 + 4', pays: '9:1',  soft: '2+6, 3+5' },
          { bet: 'Hard 10', example: '5 + 5', pays: '7:1',  soft: '4+6' },
        ].map(({ bet, example, pays, soft }) => (
          <div key={bet} className="border border-white/10 rounded p-1.5 bg-black/20 space-y-0.5">
            <div className="font-pixel text-[7px] text-amber-300">{bet}</div>
            <div className="text-[8px]">
              <span className="text-green-400">{example}</span>
              <span className="text-gray-500"> → </span>
              <span className="text-green-400">{pays}</span>
            </div>
            <div className="font-dense text-[7px] text-gray-500">Soft: {soft}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-0.5">
        <Outcome label="WIN" color="text-green-400">Dice show the exact matching pair.</Outcome>
        <Outcome label="LOSE" color="text-red-400">A 7 rolls, or a "soft" hit (same total, different faces).</Outcome>
      </div>
    </ReferenceCard>

  </div>
);
