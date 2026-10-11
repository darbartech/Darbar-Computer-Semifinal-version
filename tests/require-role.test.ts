import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../src/generated/prisma/client";

/**
 * The guard that actually protects Server Actions.
 *
 * `PERMISSIONS`/`can()` decide what the matrix says; `requireRole()` is what
 * every Server Action and DAL write calls as its first line. docs/02 §4 and
 * docs/08 §1 are explicit that protecting only the page or `proxy.ts` is not
 * enough, because Server Actions are reachable as public POST endpoints. So the
 * test below exercises `requireRole` itself rather than re-asserting the table.
 */

/** Mutable stand-in for the authenticated session. */
const sessionState = vi.hoisted(() => ({
  user: null as null | { role: string; isActive: boolean; email: string },
}));

vi.mock("../src/server/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        sessionState.user ? { user: sessionState.user } : null,
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

/** Mirrors what `next/navigation`'s `redirect()` throws in a Server Action. */
const NEXT_REDIRECT_DIGEST = "NEXT_REDIRECT;replace;/admin/login;303;";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    const error = new Error(`NEXT_REDIRECT to ${path}`);
    (error as { digest?: string }).digest =
      `${NEXT_REDIRECT_DIGEST.split(";")[0]};${NEXT_REDIRECT_DIGEST.split(";")[1]};${path};303;`;
    throw error;
  },
}));

import { requireRole, requireUser, requirePermission } from "../src/server/session";
import { PERMISSIONS } from "../src/server/permissions";

/** Roles allowed to touch staff accounts, site settings and audit history. */
const ADMIN_ONLY_PERMISSIONS = [
  "user.manage",
  "audit.view",
  "settings.write",
  "lead.export",
  "lead.delete",
  "course.archive",
  "media.delete",
] as const;

const ADMIN_ONLY_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN"];
const NON_ADMIN_ROLES: Role[] = ["EDITOR", "COUNSELOR"];

function signInAs(role: Role, isActive = true) {
  sessionState.user = {
    role,
    isActive,
    email: `${role.toLowerCase()}@example.com`,
  };
}

function signOut() {
  sessionState.user = null;
}

/** `requireRole` signals refusal with an Error tagged FORBIDDEN. */
function expectForbidden(promise: Promise<unknown>) {
  return expect(promise).rejects.toMatchObject({
    message: expect.stringContaining("FORBIDDEN"),
  });
}

beforeEach(() => {
  signOut();
});

describe("requireRole — non-admin roles cannot pass admin-only checks", () => {
  it.each(NON_ADMIN_ROLES)(
    "%s is rejected by requireRole for an admin-only role list",
    async (role) => {
      signInAs(role);
      await expectForbidden(requireRole(["SUPER_ADMIN"]));
      await expectForbidden(requireRole(["SUPER_ADMIN", "ADMIN"]));
      // The role lists actually used by admin-only call sites.
      await expectForbidden(requireRole(["SUPER_ADMIN"])); // user.manage, lead.delete
      await expectForbidden(requireRole(["SUPER_ADMIN", "ADMIN"])); // settings.write, course.archive, media.delete
    }
  );

  it.each(NON_ADMIN_ROLES)(
    "%s is rejected by requirePermission for every admin-only permission",
    async (role) => {
      signInAs(role);
      for (const permission of ADMIN_ONLY_PERMISSIONS) {
        expect(
          (PERMISSIONS[permission] as readonly Role[]).includes(role),
          `sanity: ${permission} must not include ${role}`
        ).toBe(false);
        await expectForbidden(requirePermission(permission));
      }
    }
  );

  it("refuses an admin-only permission even when the session claims an admin role outside the list", async () => {
    // Guards against a future edit that widens a permission map without
    // tightening the guard.
    signInAs("EDITOR");
    await expect(requireRole(ADMIN_ONLY_ROLES)).rejects.toThrow(/FORBIDDEN/);
  });

  it.each(ADMIN_ONLY_ROLES)("%s passes requireRole for an admin-only role list", async (role) => {
    signInAs(role);
    await expect(requireRole(ADMIN_ONLY_ROLES)).resolves.toMatchObject({ role });
  });

  it("passes the permissions that matrix grants the role", async () => {
    signInAs("ADMIN");
    for (const permission of ["user.manage", "lead.delete"] as const) {
      // ADMIN is not in these, so this is the negative control for the map.
      await expectForbidden(requirePermission(permission));
    }
    await expect(requirePermission("settings.write")).resolves.toMatchObject({
      role: "ADMIN",
    });
  });
});

describe("requireUser", () => {
  it("redirects when there is no session", async () => {
    signOut();
    await expect(requireUser()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });

  it("redirects for a deactivated user even with a valid session", async () => {
    // docs/08 §1: a deactivated user is rejected on every request.
    signInAs("SUPER_ADMIN", false);
    await expect(requireUser()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });

  it("returns the active user", async () => {
    signInAs("SUPER_ADMIN");
    await expect(requireUser()).resolves.toMatchObject({
      role: "SUPER_ADMIN",
      isActive: true,
    });
  });

  it("propagates the redirect instead of reporting FORBIDDEN", async () => {
    // An anonymous caller must be sent to the login page, not told they lack
    // a permission — otherwise the action returns a misleading error.
    signOut();
    await expect(requireRole(["SUPER_ADMIN"])).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });
});