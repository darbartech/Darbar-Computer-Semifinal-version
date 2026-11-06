import { redirect } from "next/navigation";
import { getSession } from "@/server/session";
import { can } from "@/server/permissions";
import type { Role } from "@/generated/prisma/client";

/**
 * Staff auth-page shell: `login`, `forgot-password` and `reset-password`.
 *
 * An authenticated, active staff member never sees these pages — they are sent
 * to the dashboard. `isActive` is part of the test on purpose: a deactivated
 * account's session is still readable, and `techdarbar/(protected)/layout.tsx`
 * sends such an account here, so bouncing it onward without that check would
 * loop login <-> dashboard. A signed-in student must stay, because
 * `can(role, "dashboard.view")` is exactly the test the login form uses.
 *
 * This lives on the route group rather than `src/app/techdarbar/layout.tsx`
 * because the root layout also wraps the dashboard and every protected page;
 * redirecting there bounced `/techdarbar` to itself.
 */
export default async function AdminAuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const user = session?.user as { role?: Role; isActive?: boolean } | undefined;
  if (user?.isActive && user.role && can(user.role, "dashboard.view")) {
    redirect("/techdarbar");
  }

  return <>{children}</>;
}
