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
	"base_cost_cents" integer NOT NULL,
	"visual_id" text NOT NULL,
	"description" text,
	"is_starter_roster" boolean DEFAULT false NOT NULL
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
	"bets" jsonb DEFAULT '{"passLine":0,"odds":0,"hardways":{"hard4":0,"hard6":0,"hard8":0,"hard10":0}}'::jsonb NOT NULL,
	"crew_slots" jsonb DEFAULT '[null,null,null,null,null]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rewards_finalised" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"unlocked_crew_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"comp_perk_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"lifetime_earnings_cents" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runs_user_id_idx" ON "runs" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runs_active_idx" ON "runs" ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_idx" ON "users" ("username");