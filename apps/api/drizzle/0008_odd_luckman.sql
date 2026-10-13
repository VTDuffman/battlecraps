-- FB-032: the Foreman's running Cut toward his Payoff.
-- Also applied idempotently at API startup (server.ts) before listen().
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "boss_progress_cents" bigint DEFAULT 0 NOT NULL;
