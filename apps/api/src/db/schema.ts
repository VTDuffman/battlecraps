// =============================================================================
// BATTLECRAPS — DRIZZLE ORM SCHEMA
// apps/api/src/db/schema.ts
//
// Single source of truth for all database tables. Both `users` and `runs` live
// here so that foreign-key relationships are defined in one place.
//
// MONEY RULE: Every monetary column is stored as INTEGER CENTS. Never use a
// float or decimal column for bankroll or bet amounts. $1.00 = 100 cents.
//
// RUN STATE RULE: Game-engine objects (Bets, CrewMember) that contain functions
// cannot be serialised as-is. We persist a stripped "stored" shape to JSONB and
// reconstruct live objects on load via the crew registry.
// =============================================================================

import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  smallint,
  boolean,
  real,
  jsonb,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import type { Bets, RunStatus, GamePhase } from '@battlecraps/shared';

// ---------------------------------------------------------------------------
// ENUMS (Postgres-native for constraint + readability)
// ---------------------------------------------------------------------------

export const abilityCategoryEnum = pgEnum('ability_category', [
  'DICE', 'TABLE', 'PAYOUT', 'HYPE', 'WILDCARD',
]);

export const cooldownTypeEnum = pgEnum('cooldown_type', [
  'none', 'per_roll', 'per_shooter',
]);

export const runStatusEnum = pgEnum('run_status', [
  'IDLE_TABLE',
  'POINT_ACTIVE',
  'RESOLUTION',
  'TRANSITION',
  'GAME_OVER',
]);

export const gamePhaseEnum = pgEnum('game_phase', [
  'COME_OUT',
  'POINT_ACTIVE',
]);

// ---------------------------------------------------------------------------
// STORED CREW MEMBER — the serialisable subset we write to JSONB
//
// CrewMember.execute() is a function and cannot be serialised. We persist only
// the crew ID and current cooldown. On read, the API reconstructs the full
// CrewMember by looking up the crew ID in the crewRegistry.
// ---------------------------------------------------------------------------

export interface StoredCrewSlot {
  /** Matches CrewMember.id — used to look up the full implementation on load. */
  crewId: number;
  /** Current cooldown counter. 0 = ready; >0 = rolls/shooter remaining. */
  cooldownState: number;
}

/**
 * The value stored in runs.crew_slots JSONB column.
 * A null element means that slot is empty (no crew assigned).
 * Always exactly 5 elements matching the 5 physical slots.
 */
export type StoredCrewSlots = [
  StoredCrewSlot | null,
  StoredCrewSlot | null,
  StoredCrewSlot | null,
  StoredCrewSlot | null,
  StoredCrewSlot | null,
];

// ---------------------------------------------------------------------------
// USERS TABLE
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Unique login handle. Displayed in-game as the "player name". */
    username: text('username').notNull(),

    /** Used for auth. Never returned to the client. */
    email: text('email').notNull(),

    /** bcrypt hash. Never returned to the client. */
    passwordHash: text('password_hash').notNull(),

    /**
     * IDs of crew members this account has permanently unlocked.
     * The starter roster (ids 1–5) is implicitly available to everyone.
     * New unlocks are appended here after meta-progression purchases.
     */
    unlockedCrewIds: integer('unlocked_crew_ids').array().notNull().default(sql`'{}'::integer[]`),

    /**
     * IDs of permanent "Comp Perk" upgrades purchased with lifetime earnings.
     * e.g., "+1 starting shooter", "extra odds multiplier cap".
     */
    compPerkIds: integer('comp_perk_ids').array().notNull().default(sql`'{}'::integer[]`),

    /**
     * Cumulative winnings across ALL runs, in cents.
     * Used as the "comp points" currency for permanent upgrades.
     * bigint because this can grow large over many runs.
     */
    lifetimeEarningsCents: bigint('lifetime_earnings_cents', { mode: 'number' })
      .notNull()
      .default(0),

    /**
     * The highest bankroll this player has ever achieved, in cents, across
     * all runs. Updated after every roll when the new bankroll exceeds this
     * value. bigint to match lifetimeEarningsCents. Default 0 = never played.
     *
     * Migration: migrate-add-max-bankroll.ts
     */
    maxBankrollCents: bigint('max_bankroll_cents', { mode: 'number' })
      .notNull()
      .default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    usernameIdx: uniqueIndex('users_username_idx').on(t.username),
  }),
);

// ---------------------------------------------------------------------------
// RUNS TABLE
// ---------------------------------------------------------------------------

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // ── State machine ──────────────────────────────────────────────────────

    status: runStatusEnum('status').notNull().default('IDLE_TABLE'),

    phase: gamePhaseEnum('phase').notNull().default('COME_OUT'),

    // ── Financials — ALL CENTS, ALL INTEGER ────────────────────────────────

    /**
     * Player's current bankroll for this run, in cents.
     * Starts at 25000 (= $250.00 per PRD Section 2).
     * Never goes below 0 — GAME_OVER is triggered first.
     */
    bankrollCents: integer('bankroll_cents').notNull().default(25000),

    // ── Shooter lives ──────────────────────────────────────────────────────

    /** Remaining shooter lives. Game over at 0. Starts at 5. */
    shooters: smallint('shooters').notNull().default(5),

    // ── Gauntlet progression ───────────────────────────────────────────────

    /** Index into the server-side MARKER_TARGETS array (0-based). */
    currentMarkerIndex: smallint('current_marker_index').notNull().default(0),

    /** Current gauntlet floor (1–3 for MVP). Boss fight every 3rd marker. */
    floor: smallint('floor').notNull().default(1),

    // ── Dice/craps state ───────────────────────────────────────────────────

    /**
     * The established point number (4, 5, 6, 8, 9, or 10).
     * NULL when in COME_OUT phase (no point set yet).
     */
    currentPoint: smallint('current_point'),

    /**
     * Global Hype multiplier. Stored as REAL (4-byte float).
     *
     * Precision note: the engine guards against IEEE-754 drift with
     * Math.round(hype * 10_000) / 10_000 before every payout. Storing
     * as REAL (not DOUBLE PRECISION) is intentional — it limits the
     * precision to ~7 significant digits, which is sufficient for a
     * multiplier that will never exceed ~10.0 in practice, and makes
     * the "already rounded to 4dp" value round-trip cleanly.
     */
    hype: real('hype').notNull().default(1.0),

    /**
     * Number of consecutive point hits by the current shooter.
     * Increments on every POINT_HIT; resets to 0 on SEVEN_OUT or TRANSITION.
     * Drives the base-game escalating hype tick (see getBaseHypeTick in shared).
     */
    consecutivePointHits: smallint('consecutive_point_hits').notNull().default(0),

    /**
     * Point hits scored so far within the current boss fight segment.
     * 0 when not in a boss fight, or at the start of one before any Point Hit.
     *
     * Increments ONLY on POINT_HIT (without clearing the marker) — all other
     * roll outcomes (NATURAL, CRAPS_OUT, POINT_SET, SEVEN_OUT, NO_RESOLUTION)
     * leave this counter unchanged. The min-bet therefore holds on Seven Out.
     * Resets to 0 on any marker clear (TRANSITION) or GAME_OVER.
     *
     * Drives getBossMinBet() which enforces the RISING_MIN_BETS rule for Sarge.
     */
    bossPointHits: smallint('boss_roll_count').notNull().default(0),

    // ── Active bets — JSONB, values in cents ──────────────────────────────

    /**
     * Current bet amounts for the active roll.
     * Typed as Bets from the shared package. All values are integer cents.
     * Validated server-side on every bet placement.
     *
     * Default: all zeroes. Player must bet before rolling.
     */
    bets: jsonb('bets')
      .$type<Bets>()
      .notNull()
      .default({
        passLine: 0,
        odds:     0,
        hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 },
      }),

    // ── Crew configuration — JSONB ─────────────────────────────────────────

    /**
     * The player's 5 crew slots in cascade order (left → right = index 0 → 4).
     * Each element is either a StoredCrewSlot or null (empty slot).
     *
     * This column is updated after every roll to persist cooldown state changes.
     * The full CrewMember objects (with execute() functions) are reconstructed
     * in memory from this data using the crewRegistry on each request.
     */
    crewSlots: jsonb('crew_slots')
      .$type<StoredCrewSlots>()
      .notNull()
      .default([null, null, null, null, null]),

    // ── Mechanic freeze — persisted across rolls ───────────────────────────

    /**
     * Active freeze set by The Mechanic ability. null when no freeze is in effect.
     * Set by POST /runs/:id/mechanic-freeze; decremented by the roll handler;
     * cleared on SEVEN_OUT or when rollsRemaining reaches 0.
     */
    mechanicFreeze: jsonb('mechanic_freeze')
      .$type<{ lockedValue: number; rollsRemaining: number } | null>(),

    // ── Meta ───────────────────────────────────────────────────────────────

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Bumped on every roll settlement. Enables optimistic concurrency:
     * if two requests race, the second will hit a stale-state mismatch.
     */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    /** True once the final GAME_OVER rewards have been written to users.lifetime_earnings_cents. */
    rewardsFinalised: boolean('rewards_finalised').notNull().default(false),
  },
  (t) => ({
    userIdIdx: index('runs_user_id_idx').on(t.userId),
    activeRunIdx: index('runs_active_idx')
      .on(t.userId, t.status)
      .where(sql`status != 'GAME_OVER'`),
  }),
);

// ---------------------------------------------------------------------------
// RELATIONS (Drizzle query API)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  runs: many(runs),
}));

export const runsRelations = relations(runs, ({ one }) => ({
  user: one(users, {
    fields:     [runs.userId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// CREW DEFINITIONS TABLE
// Static reference data for every crew member in the game.
// Seeded once by apps/api/src/db/seed.ts and rarely mutated thereafter.
// ---------------------------------------------------------------------------

export const crewDefinitions = pgTable('crew_definitions', {
  /** Stable numeric ID. Must match CrewMember.id in packages/shared. */
  id: integer('id').primaryKey(),

  /** Display name. e.g. '"Lefty" McGuffin'. */
  name: text('name').notNull(),

  /** Thematic category — maps to the AbilityCategory union in shared/types.ts. */
  abilityCategory: abilityCategoryEnum('ability_category').notNull(),

  /**
   * Governs how cooldown is managed. Stored for display / tooltips on the
   * Pub screen so clients know what kind of cooldown to show without
   * importing the engine.
   */
  cooldownType: cooldownTypeEnum('cooldown_type').notNull(),

  /** Recruitment cost in the "Seven-Proof Pub", in cents. */
  baseCostCents: integer('base_cost_cents').notNull(),

  /** Key for the 16-bit sprite sheet frame. e.g. 'lefty', 'nervous_intern'. */
  visualId: text('visual_id').notNull(),

  /**
   * One-line flavour description of the crew member's ability.
   * Shown on the Pub screen recruitment card.
   */
  description: text('description'),

  /**
   * True for the 15 MVP starter crew available from game launch.
   * Future DLC crew will have this as false until a content patch enables them.
   */
  isStarterRoster: boolean('is_starter_roster').notNull().default(false),
});

export type CrewDefinitionRow = typeof crewDefinitions.$inferSelect;
export type NewCrewDefinition  = typeof crewDefinitions.$inferInsert;

// ---------------------------------------------------------------------------
// INFERRED TYPES (handy for controller layer)
// ---------------------------------------------------------------------------

/** A fully hydrated row from the `users` table. */
export type UserRow = typeof users.$inferSelect;

/** A fully hydrated row from the `runs` table. */
export type RunRow = typeof runs.$inferSelect;

/** Shape for inserting a new run. */
export type NewRun = typeof runs.$inferInsert;

/** Shape for inserting a new user. */
export type NewUser = typeof users.$inferInsert;


