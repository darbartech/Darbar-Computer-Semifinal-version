import { describe, expect, it } from "vitest";
import { ALLOW_E2E_SEED, ALLOW_E2E_SEED_FLAG, e2eSeedProblem } from "../prisma/seed-guard";

/**
 * Task 1 (docs/SECURITY-CLEANUP.md): the fixture seed writes staff accounts and
 * enquiries that look real, all sharing a password printed in this repository, so
 * it needs two independent keys — not production, and an explicit opt-in. Each
 * case below is one way someone tries to get past the guard by accident.
 */
describe("e2e seed guard", () => {
  it("refuses a plain invocation", () => {
    const problem = e2eSeedProblem({ NODE_ENV: "development" }, []);
    expect(problem).toContain(ALLOW_E2E_SEED);
  });

  it("refuses a half-set opt-in", () => {
    expect(e2eSeedProblem({ NODE_ENV: "development", [ALLOW_E2E_SEED]: "0" }, [])).not.toBeNull();
    expect(e2eSeedProblem({ NODE_ENV: "development", [ALLOW_E2E_SEED]: "true" }, [])).not.toBeNull();
    expect(e2eSeedProblem({ NODE_ENV: "development" }, ["--allow-e2e"])).not.toBeNull();
  });

  it("refuses production even when the opt-in is present", () => {
    const problem = e2eSeedProblem(
      { NODE_ENV: "production", [ALLOW_E2E_SEED]: "1" },
      [ALLOW_E2E_SEED_FLAG]
    );
    expect(problem).toContain("production");
  });

  it("refuses an environment with neither key set", () => {
    expect(e2eSeedProblem({}, [])).not.toBeNull();
  });

  it("passes on a non-production database with the env opt-in", () => {
    expect(e2eSeedProblem({ NODE_ENV: "test", [ALLOW_E2E_SEED]: "1" }, [])).toBeNull();
  });

  it("passes on the argument spelling, which is what npm run db:seed:test uses", () => {
    expect(e2eSeedProblem({ NODE_ENV: "development" }, [ALLOW_E2E_SEED_FLAG])).toBeNull();
  });
});
