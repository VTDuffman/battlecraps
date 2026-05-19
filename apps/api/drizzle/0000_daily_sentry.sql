DO $$ BEGIN
 CREATE TYPE "public"."ability_category" AS ENUM('DICE', 'TABLE', 'PAYOUT', 'HYPE', 'WILDCARD');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."cooldown_type" AS ENUM('none', 'per_roll', 'per_shooter');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."game_phase" AS ENUM('COME_OUT', 'POINT_ACTIVE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."run_status" AS ENUM('IDLE_TABLE', 'POINT_ACTIVE', 'RESOLUTION', 'TRANSITION', 'GAME_OVER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crew_definitions" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ability_category" "ability_category" NOT NULL,
	"cooldown_type" "cooldown_type" NOT NULL,
	"visual_id" text NOT NULL,
	"description" text,
	"rarity" text DEFAULT 'Common' NOT NULL,
	"brief_description" text,
	"detailed_description" text,
	"unlock_description" text DEFAULT '' NOT NULL,
	"unlock_quote" text,
	"is_starter_roster" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"rating" integer,
	"comment" text NOT NULL,
	"context" jsonb,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leaderboard_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"final_bankroll_cents" integer NOT NULL,
	"highest_roll_amplified_cents" integer DEFAULT 0 NOT NULL,
	"highest_marker_index" smallint NOT NULL,
	"shooters_remaining" smallint NOT NULL,
	"crew_layout" jsonb NOT NULL,
	"did_win_run" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'IDLE_TABLE' NOT NULL,
	"phase" "game_phase" DEFAULT 'COME_OUT' NOT NULL,
	"bankroll_cents" integer DEFAULT 25000 NOT NULL,
	"shooters" smallint DEFAULT 5 NOT NULL,
	"current_marker_index" smallint DEFAULT 0 NOT NULL,
	"floor" smallint DEFAULT 1 NOT NULL,
	"current_point" smallint,
	"hype" real DEFAULT 1 NOT NULL,
	"consecutive_point_hits" smallint DEFAULT 0 NOT NULL,
	"boss_roll_count" smallint DEFAULT 0 NOT NULL,
	"bets" jsonb DEFAULT '{"passLine":0,"odds":0,"hardways":{"hard4":0,"hard6":0,"hard8":0,"hard10":0}}'::jsonb NOT NULL,
	"crew_slots" jsonb DEFAULT '[null,null,null,null,null]'::jsonb NOT NULL,
	"previous_roll_total" smallint,
	"shooter_roll_count" smallint DEFAULT 0 NOT NULL,
	"point_phase_blank_streak" smallint DEFAULT 0 NOT NULL,
	"per_run_unlock_counters" jsonb DEFAULT '{"naturalsThisRun":0,"hardwayWinBitsThisRun":0,"hardwayWinsThisRun":0,"consecutivePairedStreak":0,"sevenOutsThisRun":0,"repeatingDiceRef":0,"repeatingDiceStreak":0}'::jsonb NOT NULL,
	"guaranteed_pub_draft_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"crew_unlocked_this_run" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"mechanic_freeze" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rewards_finalised" boolean DEFAULT false NOT NULL,
	"highest_roll_amplified_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text NOT NULL,
	"password_hash" text,
	"clerk_id" text NOT NULL,
	"unlocked_crew_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"unacknowledged_unlock_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"unlock_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comp_perk_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"lifetime_earnings_cents" bigint DEFAULT 0 NOT NULL,
	"max_bankroll_cents" bigint DEFAULT 0 NOT NULL,
	"tutorial_completed" boolean DEFAULT false NOT NULL,
	"alias_chosen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback_submissions" ADD CONSTRAINT "feedback_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leaderboard_entries_run_id_idx" ON "leaderboard_entries" ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaderboard_entries_winners_idx" ON "leaderboard_entries" ("final_bankroll_cents","shooters_remaining");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaderboard_entries_nonwinners_idx" ON "leaderboard_entries" ("highest_marker_index","final_bankroll_cents");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaderboard_entries_user_bankroll_idx" ON "leaderboard_entries" ("user_id","final_bankroll_cents");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runs_user_id_idx" ON "runs" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runs_active_idx" ON "runs" ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_idx" ON "users" ("username");