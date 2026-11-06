-- Fix guide §3: one bank slip or eSewa/Khalti transaction id may back only one
-- live receipt. Prisma cannot express a partial unique index, so the constraint
-- lives here.
--
-- VOIDED receipts are deliberately outside the index: voiding the first receipt
-- frees its reference for the corrected one, which is how a counter mistake is
-- fixed without rewriting the ledger. CASH has no slip to match, so it is excluded
-- too — otherwise two unrelated cash payments could not share an empty reference.
CREATE UNIQUE INDEX "Payment_method_reference_active_key"
ON "Payment" ("method", "reference")
WHERE "reference" IS NOT NULL
  AND "status" = 'RECEIVED'
  AND "method" <> 'CASH';
