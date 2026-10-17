-- FB-040: The Architect's Convergence — room order (shuffled at fight entry) + room counters.
-- Also applied idempotently at API startup (server.ts).
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "convergence_rooms" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "convergence_state" jsonb;
