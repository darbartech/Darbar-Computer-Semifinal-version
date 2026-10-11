import "server-only";
import { unstable_cache } from "next/cache";

/**
 * The only file that knows which caching API we use (docs/06 §5).
 *
 * Next 16 deprecates `unstable_cache` in favour of the `use cache` directive,
 * but that directive requires opting into Cache Components
 * (`experimental.cacheComponents`), which also changes how every route opts in
 * or out of caching. Keeping the call behind this one helper means the eventual
 * migration is a single-file change instead of a rewrite of every DAL read.
 *
 * `revalidate: 3600` is only a safety net — admin writes call `invalidate(...)`
 * (docs/06 §7), so the cache is refreshed on save rather than waiting for the
 * timer. Widgets that must feel live (the dashboard) pass a shorter window,
 * because their whole job is to show something that changed minutes ago
 * (docs/05 §5: "cache each widget 1–5 minutes").
 *
 * The `never[]` constraint keeps the wrapped function's own signature: without
 * it, TypeScript infers the argument tuple from the constraint first and every
 * parameter would be contextually typed as `unknown`.
 */
export function cached<F extends (...args: never[]) => Promise<unknown>>(
  tags: readonly string[],
  fn: F,
  revalidateSeconds = 3600
): F {
  return unstable_cache(
    fn as unknown as (...args: unknown[]) => Promise<unknown>,
    [...tags],
    { tags: [...tags], revalidate: revalidateSeconds }
  ) as unknown as F;
}
