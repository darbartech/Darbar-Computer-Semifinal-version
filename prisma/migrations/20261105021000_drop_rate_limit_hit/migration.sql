-- `allow()` now counts in `RateLimitBucket` (docs 01 §S8), so the append-only hit
-- table and its per-request delete are gone.
DROP TABLE "RateLimitHit";
