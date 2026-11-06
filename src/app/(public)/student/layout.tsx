/**
 * Student-side shell.
 *
 * Same single purpose as `src/app/techdarbar/layout.tsx`: `src/proxy.ts` gives
 * `/student` the nonce-based Content-Security-Policy, and a nonce only reaches
 * the framework's own scripts in a document that is rendered per request. The
 * portal pages get that anyway — `requireStudentProfile()` reads the session —
 * but the login, register and password pages do not, and a prerendered one of
 * those would ship an un-nonce'd bootstrap script and fail to hydrate.
 */
export const dynamic = "force-dynamic";

export default function StudentRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
