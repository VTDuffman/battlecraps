-- FB-039: The Emissary's signal lag (crew effects in transit) + crew blackout counter.
-- Also applied idempotently at API startup (server.ts).
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "signal_transit" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "signal_dark_rolls" integer DEFAULT 0 NOT NULL;
