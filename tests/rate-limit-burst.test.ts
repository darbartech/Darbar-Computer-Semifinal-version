import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix guide §12, item 7: a burst of N parallel requests must let exactly `max`
 * through.
 *
 * The counter is one `INSERT … ON CONFLICT DO UPDATE … RETURNING` statement, so
 * every racing request increments the same row and reads back its own position.
 * The shape this replaces was a `count` read followed by an insert — three
 * round trips, and every request in a burst saw the pre-burst number, so the
 * limit only started working after the burst. The stand-in below answers that
 * one statement; anything that goes back to read-then-write is not this SQL and
 * fails here on the shape alone.
 */

const store = vi.hoisted(() => ({
  buckets: new Map<string, number>(),
  emptyReturnOnce: false,
}));

vi.mock("@/server/db", () => ({
  db: {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (!sql.includes(`INSERT INTO "RateLimitBucket"`)) {
        throw new Error(`The rate limiter changed its SQL shape: ${sql}`);
      }
      const key = String(values[0]);
      const windowStart = values[1] as Date;
      const id = `${key}|${windowStart.toISOString()}`;
      if (store.emptyReturnOnce) {
        store.emptyReturnOnce = false;
        return [];
      }
      const count = (store.buckets.get(id) ?? 0) + 1;
      store.buckets.set(id, count);
      return [{ count }];
    },
  },
}));

const { allow } = await import("@/server/services/rate-limit");

/** Bucket ids the fake saw, so the window can be read off the counter key. */
const windowIds = () => [...store.buckets.keys()];

beforeEach(() => {
  store.buckets = new Map();
  store.emptyReturnOnce = false;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T05:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("allow()", () => {
  it("lets exactly max of a fifteen-request burst through, in order", async () => {
    const results = await Promise.all(
      Array.from({ length: 15 }, () => allow("signup:ip:1.2.3.4", { max: 5, windowMinutes: 10 }))
    );

    expect(results.filter(Boolean)).toHaveLength(5);
    expect(results.filter((allowed) => !allowed)).toHaveLength(10);
    // The first five pass and the rest are refused — no interleaving surprises.
    expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(results.slice(5)).toEqual(new Array(10).fill(false));
    expect(store.buckets.size).toBe(1);
  });

  it("gives every key its own budget", async () => {
    const first = await Promise.all(
      Array.from({ length: 3 }, () => allow("form:ip:a", { max: 2, windowMinutes: 1 }))
    );
    const second = await allow("form:ip:b", { max: 2, windowMinutes: 1 });

    expect(first.filter(Boolean)).toHaveLength(2);
    expect(second).toBe(true);
    expect(windowIds().map((id) => id.split("|")[0])).toEqual(["form:ip:a", "form:ip:b"]);
  });

  it("refuses at the limit and starts over in the next window", async () => {
    const limit = { max: 1, windowMinutes: 1 };
    expect(await allow("login:email:x@y.test", limit)).toBe(true);
    expect(await allow("login:email:x@y.test", limit)).toBe(false);

    // A fixed window, so the budget returns on the boundary, not on a sliding timer.
    vi.setSystemTime(new Date("2026-11-06T05:01:00.001Z"));
    expect(await allow("login:email:x@y.test", limit)).toBe(true);
    expect(windowIds()).toHaveLength(2);
  });

  it("refuses rather than opening the gate when the statement answers nothing", async () => {
    store.emptyReturnOnce = true;
    expect(await allow("form:ip:a", { max: 5, windowMinutes: 10 })).toBe(false);
    expect(await allow("form:ip:a", { max: 5, windowMinutes: 10 })).toBe(true);
  });

  it("reads a zero-minute window as one minute instead of dividing by zero", async () => {
    expect(await allow("form:ip:a", { max: 1, windowMinutes: 0 })).toBe(true);
    expect(await allow("form:ip:a", { max: 1, windowMinutes: 0 })).toBe(false);
    vi.setSystemTime(new Date("2026-11-06T05:01:00.000Z"));
    expect(await allow("form:ip:a", { max: 1, windowMinutes: 0 })).toBe(true);
  });
});
