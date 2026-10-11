import { NextResponse } from "next/server";
import { getStudentProfileByUserId } from "@/server/dal/students";
import { getStudentSession } from "@/server/student-session";

/**
 * Current student identity for the site header chip. Returns null for
 * visitors and staff, so the header can stay present on cached pages and
 * resolve login state in the browser. Exposes only display name and photo.
 */
export async function GET() {
  const session = await getStudentSession();
  const user = session?.user as { id: string; role?: string } | undefined;
  if (!user || user.role !== "STUDENT") {
    return NextResponse.json({ student: null });
  }

  const profile = await getStudentProfileByUserId(user.id);
  if (!profile) return NextResponse.json({ student: null });

  return NextResponse.json({
    student: { name: profile.name, photoUrl: profile.photoUrl },
  });
}
