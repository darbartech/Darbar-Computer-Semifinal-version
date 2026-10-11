import { NextResponse } from "next/server";
import { listVisibleNotices } from "@/server/dal/notices";

/**
 * Active notices for the visitor popup. Public and read-only — it returns
 * exactly what the popup would show, nothing else.
 *
 * Not cached at the route level (Route Handlers run per request), while the DAL
 * read behind it is cached under `NOTICE_TAGS`, so an editor publishing a notice
 * reaches visitors on their next page view rather than after the static marketing
 * pages revalidate.
 */
export async function GET() {
  const notices = await listVisibleNotices();
  return NextResponse.json({ notices });
}
