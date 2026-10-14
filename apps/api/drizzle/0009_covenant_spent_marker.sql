-- FB-036: The Covenant ("The Order Protects") — the marker where its once-per-marker
-- Seven-Out save was used (NULL = never). Also applied idempotently at API startup (server.ts).
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "covenant_spent_marker" integer;
