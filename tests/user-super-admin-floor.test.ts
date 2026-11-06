import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix guide §11 — the "one active super administrator must remain" rule and the
 * session revocation that has to follow an email change.
 *
 * Both are about ordering inside one transaction: the count that justifies the
 * write has to be taken on locked rows, and a rename has to drop the old
 * sessions before the transaction ends. The fake client below records every
 * statement in the order the DAL issued it.
 */

type FakeUser = { id: string; role: string; isActive: boolean; email?: string };

const state = vi.hoisted(() => ({
  order: [] as string[],
  rawQueries: [] as string[],
  lockedRows: [] as { id: string }[],
  updates: [] as unknown[],
  deletes: 0,
  revoked: [] as string[],
  user: null as unknown,
}));

vi.mock("@/server/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        user: {
          findUnique: async () => state.user,
          update: async ({ where, data }: { where: { id: string }; data: unknown }) => {
            state.order.push(`update:${where.id}`);
            state.updates.push(data);
            return { id: where.id };
          },
          delete: async ({ where }: { where: { id: string } }) => {
            state.order.push(`delete:${where.id}`);
            state.deletes += 1;
            return { id: where.id };
          },
        },
        session: {
          deleteMany: async ({ where }: { where: { userId: string } }) => {
            state.order.push(`revoke:${where.userId}`);
            state.revoked.push(where.userId);
            return { count: 1 };
          },
        },
        $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = String.raw({ raw: strings });
          state.order.push("lock");
          state.rawQueries.push(sql.replace(/\s+/g, " ").trim());
          return Promise.resolve(state.lockedRows);
        },
      }),
  },
}));

const {
  deleteUserGuarded,
  LAST_SUPER_ADMIN_MESSAGE,
  setUserActiveGuarded,
  updateUserGuarded,
} = await import("@/server/dal/users");

const superSeat = (id: string, overrides: Partial<FakeUser> = {}): FakeUser => ({
  id,
  role: "SUPER_ADMIN",
  isActive: true,
  email: `${id}@darbar.test`,
  ...overrides,
});

const edit = {
  name: "Renamed",
  email: "second@darbar.test",
  role: "ADMIN" as const,
  isActive: true,
};

beforeEach(() => {
  state.order = [];
  state.rawQueries = [];
  state.lockedRows = [{ id: "u-1" }];
  state.updates = [];
  state.deletes = 0;
  state.revoked = [];
  state.user = superSeat("u-1");
});

describe("the last-super-admin floor", () => {
  it("refuses to demote the only active super administrator", async () => {
    state.lockedRows = [{ id: "u-1" }];
    const result = await updateUserGuarded("u-1", edit);
    expect(result).toEqual({ ok: false, reason: "last-super-admin" });
    expect(state.updates).toHaveLength(0);
    expect(LAST_SUPER_ADMIN_MESSAGE).toBe(
      "At least one active super administrator must remain"
    );
  });

  it("locks the active super-admin rows before it decides", async () => {
    state.user = superSeat("u-1");
    await updateUserGuarded("u-1", edit);
    expect(state.order[0]).toBe("lock");
    expect(state.rawQueries[0]).toContain("FOR UPDATE");
    expect(state.rawQueries[0]).toContain("'SUPER_ADMIN'");
    expect(state.rawQueries[0]).toContain('"isActive" = true');
  });

  it("allows the same demotion while a second super administrator remains", async () => {
    state.lockedRows = [{ id: "u-1" }, { id: "u-2" }];
    await expect(updateUserGuarded("u-1", edit)).resolves.toEqual({ ok: true });
    expect(state.updates).toHaveLength(1);
  });

  it("does not lock rows for a change that cannot empty the seat", async () => {
    state.user = { id: "u-9", role: "EDITOR", isActive: true, email: "e@darbar.test" };
    await expect(
      updateUserGuarded("u-9", { ...edit, role: "INSTRUCTOR" })
    ).resolves.toEqual({ ok: true });
    expect(state.rawQueries).toHaveLength(0);
  });

  it("treats a deactivation the same as a demotion", async () => {
    state.lockedRows = [{ id: "u-1" }];
    const result = await setUserActiveGuarded("u-1", false);
    expect(result).toEqual({ ok: false, reason: "last-super-admin" });
    expect(state.updates).toHaveLength(0);
    expect(state.revoked).toHaveLength(0);
  });

  it("refuses to delete the last active super administrator", async () => {
    state.lockedRows = [{ id: "u-1" }];
    await expect(deleteUserGuarded("u-1")).resolves.toEqual({
      ok: false,
      reason: "last-super-admin",
    });
    expect(state.deletes).toBe(0);
  });

  it("lets an already inactive super administrator be deleted", async () => {
    state.user = superSeat("u-1", { isActive: false });
    await expect(deleteUserGuarded("u-1")).resolves.toEqual({ ok: true });
    expect(state.deletes).toBe(1);
    // Nobody to lock: the seat was already empty.
    expect(state.rawQueries).toHaveLength(0);
  });
});

describe("session revocation", () => {
  it("drops every session when the address changes", async () => {
    state.user = { id: "u-1", role: "ACCOUNTANT", isActive: true, email: "old@darbar.test" };
    await expect(updateUserGuarded("u-1", edit)).resolves.toEqual({ ok: true });
    expect(state.revoked).toEqual(["u-1"]);
    // One transaction: write and revoke, in that order, with no await between.
    expect(state.order).toEqual(["update:u-1", "revoke:u-1"]);
  });

  it("keeps the sessions of an account that was only renamed", async () => {
    state.user = { id: "u-5", role: "ACCOUNTANT", isActive: true, email: "a@darbar.test" };
    await expect(
      updateUserGuarded("u-5", { ...edit, email: "a@darbar.test" })
    ).resolves.toEqual({ ok: true });
    expect(state.revoked).toHaveLength(0);
  });

  it("drops the sessions of a deactivated account", async () => {
    state.lockedRows = [{ id: "u-1" }, { id: "u-2" }];
    state.user = { id: "u-7", role: "RECEPTION", isActive: true, email: "r@darbar.test" };
    await expect(setUserActiveGuarded("u-7", false)).resolves.toEqual({ ok: true });
    expect(state.order).toEqual(["update:u-7", "revoke:u-7"]);
  });

  it("re-activating an account sends nobody out", async () => {
    state.user = { id: "u-7", role: "RECEPTION", isActive: false, email: "r@darbar.test" };
    await expect(setUserActiveGuarded("u-7", true)).resolves.toEqual({ ok: true });
    expect(state.revoked).toHaveLength(0);
  });
});
