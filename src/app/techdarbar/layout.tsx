/**
 * Staff-side shell.
 *
 * One job: `dynamic`, because `src/proxy.ts` serves the nonce-based
 * Content-Security-Policy to every `/techdarbar` path, and a nonce can only be
 * attached while a document is being rendered. A prerendered page would ship
 * Next's own bootstrap script without one and the browser would refuse to run
 * it, so the whole subtree — the login and password pages included, which no
 * session guard makes dynamic on their own — has to render per request.
 * (Re-audit #1 moved this off the root layout, where it was silently applying
 * to the public site as well.)
 *
 * The "authenticated staff never see the login form" guard used to live here,
 * but this layout also wraps the dashboard and every protected page, so a
 * redirect to `/techdarbar` bounced `/techdarbar` to itself. It now sits on the
 * `(auth)` route group, which wraps only the login and password pages.
 */
export const dynamic = "force-dynamic";

export default function AdminRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
