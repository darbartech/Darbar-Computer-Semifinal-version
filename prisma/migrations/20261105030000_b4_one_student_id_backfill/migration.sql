-- B4 — one student ID (docs 02 §B4).
-- `StudentProfile.studentCode` is the only student identifier. Certificates
-- printed before this change carry either a self-minted `DT-STD-…` number or
-- nothing at all, so the link has to be rebuilt from what is on the paper.
--
-- Only a certificate that has not been printed yet may have its recipient ID
-- rewritten. An ISSUED / REISSUED / REVOKED / EXPIRED row is the record of a
-- document somebody is holding, so overwriting its ID number would leave the
-- verification page and any regenerated PDF disagreeing with the paper copy
-- (reaudit N4). Those rows gain the account link and keep what is printed.

-- 1. An unprinted certificate that already points at a portal account must show
--    that account's code, whatever staff typed into the recipient field.
UPDATE "Certificate" c
SET "recipientIdNumber" = s."studentCode"
FROM "StudentProfile" s
WHERE c."studentId" = s.id
  AND c.status IN ('DRAFT', 'PENDING_ISSUE')
  AND c."recipientIdNumber" IS DISTINCT FROM s."studentCode";

-- 2. A certificate whose recipient number *is* a portal code gets the link, so
--    the student can see and download it from their own dashboard. Reads the
--    code as written; `DT-STD-…` rows never match and stay staff-only records.
UPDATE "Certificate" c
SET "studentId" = s.id
FROM "StudentProfile" s
WHERE c."recipientIdNumber" = s."studentCode"
  AND c."studentId" IS NULL;

-- 3. Where a printed certificate is linked to an account whose code differs from
--    the number on the paper, say so on the row. Without this the disagreement
--    looks like a bug to whoever reads it next, and the printed value would be
--    the only copy of the truth. `metadata` is free-form JSON, so only an object
--    there can carry the key; anything else is left alone.
UPDATE "Certificate" c
SET metadata = jsonb_set(
      COALESCE(c.metadata, '{}'::jsonb),
      '{legacyRecipientId}',
      to_jsonb(c."recipientIdNumber"),
      true
    )
FROM "StudentProfile" s
WHERE c."studentId" = s.id
  AND c.status NOT IN ('DRAFT', 'PENDING_ISSUE')
  AND c."recipientIdNumber" IS DISTINCT FROM s."studentCode"
  AND c."recipientIdNumber" IS NOT NULL
  AND (c.metadata IS NULL OR jsonb_typeof(c.metadata) = 'object')
  AND (c.metadata -> 'legacyRecipientId') IS DISTINCT FROM to_jsonb(c."recipientIdNumber");
