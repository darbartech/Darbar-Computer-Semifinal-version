/**
 * The guard `prisma/seed-test.ts` runs behind (docs/SECURITY-CLEANUP.md).
 *
 * The e2e fixtures are indistinguishable from real staff and real enquiries: one
 * account per role, all sharing a password that is published in this repository,
 * plus leads that read like admissions. One accidental run against the production
 * database would put the counter out of business and the ledger out of trust, so
 * two independent keys must turn: not production, and an explicit opt-in.
 *
 * The opt-in is `ALLOW_E2E_SEED=1`, or the same flag as an argument
 * (`--allow-e2e-seed`) because an npm script cannot set an environment variable in
 * a way that works in both cmd.exe and a POSIX shell. Both spellings mean the same
 * promise: the database behind `DATABASE_URL` is a throwaway.
 *
 * Lives in its own module because the seed script connects and writes the moment it
 * is imported, which makes the check untestable from inside it.
 */

export const ALLOW_E2E_SEED = "ALLOW_E2E_SEED";
export const ALLOW_E2E_SEED_FLAG = "--allow-e2e-seed";

/** `null` when the fixture seed may run; otherwise the reason it may not. */
export function e2eSeedProblem(
  env: Record<string, string | undefined> = process.env,
  argv: readonly string[] = process.argv.slice(2)
): string | null {
  if (env.NODE_ENV === "production") {
    return "Refusing to seed e2e fixtures in production.";
  }
  const optedIn = env[ALLOW_E2E_SEED] === "1" || argv.includes(ALLOW_E2E_SEED_FLAG);
  if (!optedIn) {
    return `Refusing to seed e2e fixtures: these accounts share a published password and look like real staff. Confirm the target database is a throwaway with ${ALLOW_E2E_SEED}=1 (or ${ALLOW_E2E_SEED_FLAG}).`;
  }
  return null;
}

/** Throws the one sentence a person needs to fix the invocation. */
export function assertE2eSeedAllowed(
  env: Record<string, string | undefined> = process.env,
  argv: readonly string[] = process.argv.slice(2)
): void {
  const problem = e2eSeedProblem(env, argv);
  if (problem) throw new Error(problem);
}
