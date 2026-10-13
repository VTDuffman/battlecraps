-- Records the INTEGER -> BIGINT promotion already applied to production on
-- 2026-05-23 (migrate-bigint-bankroll.ts, commit 1714b78, never merged). No-op
-- there; brings schema.ts, fresh databases and the test DB in line.
ALTER TABLE "leaderboard_entries" ALTER COLUMN "final_bankroll_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ALTER COLUMN "highest_roll_amplified_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ALTER COLUMN "peak_bankroll_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "bankroll_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "highest_roll_amplified_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "peak_bankroll_cents" SET DATA TYPE bigint;
