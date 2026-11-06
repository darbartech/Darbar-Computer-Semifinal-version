-- Re-audit N5: `FULL` became a derived value (seatsTaken >= seatsTotal) and staff
-- can no longer write it, but rows a previous build set by hand stayed `FULL`
-- forever. `JOINABLE_BATCH_STATUSES` is UPCOMING|OPEN|RUNNING, so such a batch
-- vanished from the approval picker and from the public "seats left" line even
-- after students dropped out.
--
-- A batch has no end date, so its start date is the only clock: a course that has
-- begun is RUNNING, one that has not is OPEN. Seats are untouched — full is now
-- read from the counters, so a genuinely full batch still shows as full.
UPDATE "Batch"
SET status = CASE
      WHEN "startDate" <= current_date THEN 'RUNNING'::"BatchStatus"
      ELSE 'OPEN'::"BatchStatus"
    END,
    "updatedAt" = now()
WHERE status = 'FULL';
