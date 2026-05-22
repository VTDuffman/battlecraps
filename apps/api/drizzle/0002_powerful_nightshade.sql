ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "comp_perk_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "highest_marker_reached" integer DEFAULT 0 NOT NULL;
