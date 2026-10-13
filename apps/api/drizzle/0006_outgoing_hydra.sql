-- Escrow/transmission buffer to BIGINT, matching the other money columns.
-- Also applied idempotently at API startup (server.ts) before listen().
ALTER TABLE "runs" ALTER COLUMN "pending_additive_cents" SET DATA TYPE bigint;
