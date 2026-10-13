-- Saved Pub draft (generated once per Pub visit; refreshing can no longer re-roll it).
-- Also applied idempotently at API startup (server.ts) before listen().
ALTER TABLE "runs" ADD COLUMN "pub_draft" jsonb;
