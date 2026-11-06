-- Drop the gateway scaffolding that never got a caller (docs 05 §6).
--
-- `PaymentIntent` and its two enums were created with the fees tables in
-- prisma/migrations/20261105060000_fees_payments/migration.sql, on the assumption
-- that eSewa/Khalti checkout would arrive in the same phase. It did not: no action
-- inserted an intent, no callback read one, no page listed them, and
-- `Payment.intentId` was always NULL because nothing ever had an id to put in it.
-- A table that no code touches is not a head start, it is a second place a payment
-- can be recorded — so the schema stops describing a route that cannot be walked,
-- and the gateway phase re-adds these objects in its own migration.
--
-- Safe on a database that already has data:
--   1. refuses to run at all while the intent table holds rows (a real gateway
--      handoff is evidence this was built somewhere, and it must be exported or
--      reconciled by a human rather than dropped by a migration);
--   2. touches only intent-owned objects. `Payment.invoiceId`, `receiptNo`,
--      `reference`, `idempotencyKey` and the ledger guards from docs 05 §1 are
--      untouched, so no receipt, invoice or day book changes;
--   3. every statement is conditional, so re-running on a database where the
--      objects are already gone is a no-op instead of an error.

-- 1. Refuse to delete a gateway handoff that someone might still be paying for.
DO $$
DECLARE
  pending text;
  total   bigint;
BEGIN
  IF to_regclass('"PaymentIntent"') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM "PaymentIntent"' INTO total;
  IF total = 0 THEN
    RETURN;
  END IF;

  SELECT string_agg(line, E'\n       ')
    INTO pending
    FROM (
      SELECT format('%s  %s  %s  amount=%s  invoice=%s',
                    "id", "provider", "status", "amount", "invoiceId") AS line
        FROM "PaymentIntent"
       ORDER BY "createdAt"
       LIMIT 20
    ) intents;

  RAISE EXCEPTION
    'Cannot drop PaymentIntent: it holds % row(s). First 20:
       %',
    total, pending
    USING HINT = 'These are gateway records. Export and reconcile them (a COMPLETED intent with no Payment is money taken and never credited), then run this migration again.';
END
$$;

-- 2. Take the link off Payment. The unique index and the foreign key both hang on
--    the column, so they go with it; naming them first keeps the intent readable if
--    this ever has to be replayed by hand.
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_intentId_fkey";
DROP INDEX IF EXISTS "Payment_intentId_key";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "intentId";

-- 3. The table itself, with its primary key, unique `txnUuid` and `invoiceId` index.
DROP TABLE IF EXISTS "PaymentIntent";

-- 4. The two types were used by that table's columns and by nothing else.
--    `PaymentMethod` keeps its own ESEWA/KHALTI values: those spell how a receipt
--    was paid, which is a fact the counter already records today.
DROP TYPE IF EXISTS "PaymentProvider";
DROP TYPE IF EXISTS "IntentStatus";
