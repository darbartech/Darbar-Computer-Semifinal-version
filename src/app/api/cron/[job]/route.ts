import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileSeatCounts } from "@/server/dal/batches";
import { pruneAuditNoise } from "@/server/dal/audit";
import { runDataRetention } from "@/server/dal/retention";
import { audit } from "@/server/services/audit";
import { reportError } from "@/server/services/monitoring";
import { purgeStaleBuckets } from "@/server/services/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/[job] — the scheduler's door (doc 07 §2, reaudit N3).
 *
 * Two things in this build had to happen on a schedule, and neither happened at
 * all until now: rate-limit buckets are written per key per window and never
 * cleaned (the limiter's own comment promises "swept by the nightly job"), and
 * `Batch.seatsTaken` is a counter the transactional paths maintain, so anything
 * that bypasses them stays wrong until someone looks.
 *
 * Nothing here is user-supplied, so the route is secret-guarded rather than
 * session-guarded: `Authorization: Bearer $CRON_SECRET`, compared in constant
 * time, and it fails closed when the secret is not configured.
 *
 * A third thing now happens on a schedule: the audit table is pruned of the
 * sign-in and upload-signature noise that only ever grows (fix guide §8). The
 * whitelist of prunable actions lives in `@/server/dal/audit` — financial and
 * security events are kept, for years, on purpose.
 *
 * A fourth, on its own weekly line: `retention`, which forgets the personal
 * details of enquiries and contact messages once the window in Settings has
 * passed (task 9, docs 08 §1). Separate because it is the only job here that
 * destroys data rather than tidying counters.
 *
 * Crontab on the server (docs 09 §3):
 *   CRON_TZ=Asia/Kathmandu
 *   0 8 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *               https://yoursite/api/cron/daily
 *   0 4 * * 1 curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *               https://yoursite/api/cron/retention
 */

/** Buckets older than this can no longer be inside any window in force. */
const BUCKET_HISTORY_DAYS = 2;

/** What a job reports back: counts, and the one flag that says there is more work. */
type CronJob = (request: Request) => Promise<Record<string, number | boolean>>;

const JOBS: Record<string, CronJob> = {
  /**
   * `daily` — the janitor. All three halves are idempotent and safe to run
   * twice, so a retried cron call or a manual run costs nothing.
   */
  daily: async () => {
    const [bucketsDeleted, seats, auditPruned] = await Promise.all([
      purgeStaleBuckets(BUCKET_HISTORY_DAYS),
      reconcileSeatCounts(),
      pruneAuditNoise(),
    ]);
    return {
      bucketsDeleted,
      seatsCorrected: seats.corrected,
      auditPruned,
    };
  },

  /**
   * `retention` — the privacy sweep (task 9, docs/08 §1): anonymise the
   * enquiries whose window has closed and drop the contact messages whose own
   * window has. The windows are Settings, not constants, and the audit row this
   * run writes carries counts only — who was purged is precisely the data the
   * job exists to forget.
   *
   * It is a separate job rather than part of `daily` because it is the one thing
   * here that destroys personal data: it deserves its own crontab line, its own
   * `curl` in an incident and its own audit entry. It is also bounded per run,
   * so `remaining` tells the operator that the first sweep after years of
   * nothing needs another call tomorrow.
   */
  retention: async () => {
    const result = await runDataRetention();
    return {
      leadsAnonymised: result.anonymised,
      leadNotesCleared: result.notesCleared,
      messagesDeleted: result.deleted,
      remaining: result.remaining,
    };
  },
};

/**
 * Equal length first, then `timingSafeEqual` — which throws on a length mismatch.
 * An unset secret authorises nothing: a deployment that forgot to configure it
 * gets 401 rather than an open endpoint.
 */
function authorized(request: Request): boolean {
  const want = process.env.CRON_SECRET ?? "";
  if (!want) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ job: string }> }
): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    console.error("[cron] CRON_SECRET is not configured; refusing every run");
    return new NextResponse(null, { status: 401 });
  }
  if (!authorized(request)) return new NextResponse(null, { status: 401 });

  const { job } = await params;
  const run = JOBS[job];
  if (!run) return new NextResponse(null, { status: 404 });

  try {
    const result = await run(request);
    // Counts only, never row contents: the audit trail says the janitor ran and
    // how much it swept.
    await audit({
      actor: { id: null, email: "cron" },
      action: "cron.run",
      entity: "System",
      summary: `Scheduled job "${job}" finished`,
      meta: result,
    });
    return NextResponse.json({ ok: true, job, ...result });
  } catch (error) {
    console.error(`[cron:${job}]`, error instanceof Error ? error.message : "unknown");
    // A cron failure has no visitor to fail in front of: if nobody reports it,
    // the janitor simply stopped running and the first to notice is the table
    // that grew forever.
    reportError(error, `cron:${job}`);
    return new NextResponse(null, { status: 500 });
  }
}
