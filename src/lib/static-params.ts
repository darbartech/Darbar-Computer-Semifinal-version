/**
 * `generateStaticParams()` runs during the build, before any page is served, and
 * a database that is not reachable at that moment is a normal thing in a fresh
 * container, a CI job without a service, or a first deploy where the migration
 * has not been seeded yet. Next treats a throw here as a build failure, so every
 * prerender list in `src/app/(public)/**` is wrapped: an empty list means the
 * routes are simply generated on the first request that needs them
 * (`dynamicParams` defaults to true), which is the same outcome as a page that
 * was never in the list at all.
 *
 * The failure is logged, never thrown, because the reason matters to whoever ran
 * the build (a missing `DATABASE_URL` looks like a broken page otherwise) and
 * nothing about it is user data.
 */
export async function safeStaticParams(
  route: string,
  read: () => Promise<{ slug: string }[]>
): Promise<{ slug: string }[]> {
  try {
    // Projected down to the param key: the same DAL read also serves the
    // sitemap, where `updatedAt` is the point of it, and Next wants objects
    // whose keys are exactly the route's dynamic segments.
    return (await read()).map(({ slug }) => ({ slug }));
  } catch (error) {
    console.warn(
      `[generateStaticParams] ${route} skipped; pages will generate on request`,
      error instanceof Error ? error.message : "unknown"
    );
    return [];
  }
}
