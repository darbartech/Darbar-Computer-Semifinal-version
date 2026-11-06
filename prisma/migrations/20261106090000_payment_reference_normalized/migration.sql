-- Payment references are stored normalised: trimmed, inner whitespace collapsed to
-- one space, upper case. `normalizePaymentReference()` in
-- src/lib/validators/fees.ts applies the rule to every new receipt, so "TXN1",
-- "txn1" and " txn1 " arrive at the database as one string — which is the only way
-- the partial unique index below recognises them as the one slip the clerk means.
--
-- The rule is worthless unless the rows that predate it follow it too: a stored
-- "txn1" beside a new "TXN1" is exactly the double receipt the index was written to
-- prevent, so this migration rewrites them in place and then rebuilds the index with
-- the predicate it already had.

-- 1. Refuse to run on a ledger where one slip already backs two live receipts.
--    Choosing which of them to keep would invent an accounting fact nobody on the
--    counter can see, so the migration stops and names the pairs instead.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(line, E'\n       ')
    INTO offenders
    FROM (
      SELECT format(
               '%s / %s -> %s',
               "method",
               "ref",
               string_agg("receiptNo", ', ' ORDER BY "receiptNo")
             ) AS line
        FROM (
          SELECT "method",
                 upper(btrim(regexp_replace("reference", '[[:space:]]+', ' ', 'g'))) AS "ref",
                 "receiptNo"
            FROM "Payment"
           WHERE "reference" IS NOT NULL
             AND "status" = 'RECEIVED'
             AND "method" <> 'CASH'
        ) live
       GROUP BY "method", "ref"
      HAVING count(*) > 1
    ) dupes;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot normalise payment references: these (method, reference) pairs back more than one live receipt:
       %',
      offenders
      USING HINT = 'Void all but one receipt in each pair, or give them distinct references, then run the migration again.';
  END IF;
END
$$;

-- 2. Take the index off for the rewrite. Step 4 puts it back inside the same
--    transaction, so no other session ever sees the constraint missing, and a row
--    written concurrently makes this migration fail and roll back rather than
--    leaving a silent duplicate behind.
DROP INDEX "Payment_method_reference_active_key";

-- 3. Normalise every reference, VOIDED rows and cash included: a voided receipt
--    still shows in the day book and on the trail, and two spellings of it would be
--    two different-looking pieces of paper. Rows that already comply are untouched.
--    The space class is written out as [[:space:]] rather than \s: \s is a backslash
--    escape whose meaning depends on how the string literal reaches the parser, and
--    read as a plain "s" it would rewrite "cash" into "ca h".
--    The collapse runs *before* btrim, as normalizePaymentReference() does it:
--    trimming first would turn a trailing tab into a trailing space and store a
--    value the application's own rule never produces.
UPDATE "Payment"
   SET "reference" = upper(btrim(regexp_replace("reference", '[[:space:]]+', ' ', 'g')))
 WHERE "reference" IS NOT NULL
   AND "reference" <> upper(btrim(regexp_replace("reference", '[[:space:]]+', ' ', 'g')));

-- 4. The same partial unique index as
--    prisma/migrations/20261105110000_payment_reference_unique/migration.sql: one
--    live receipt per (method, reference). VOIDED receipts stay outside it, so
--    voiding still frees a slip for the corrected receipt, and CASH stays outside it
--    because cash has no slip to match.
CREATE UNIQUE INDEX "Payment_method_reference_active_key"
ON "Payment" ("method", "reference")
WHERE "reference" IS NOT NULL
  AND "status" = 'RECEIVED'
  AND "method" <> 'CASH';
