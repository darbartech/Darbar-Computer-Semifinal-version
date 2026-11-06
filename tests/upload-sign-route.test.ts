import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix guide §8 — minting an upload signature was unmetered and wrote an audit row
 * every time. Both are wrong for an endpoint that changes nothing: the file is
 * checked in by `registerMediaUpload`, which is the event worth keeping.
 *
 * Task 8 — the order. Parsing the body used to come first, so a caller with no
 * session and no permission could make the server read and validate an arbitrary
 * payload before being told no. `POST` now gates and throttles before it touches
 * the request, and the `json()` spies below are how that ordering is pinned: a
 * build passes either way, and a browser never shows the difference.
 */

const calls = vi.hoisted(() => ({
  allow: [] as { key: string; max: number; windowMinutes: number }[],
  sign: 0,
  audit: [] as unknown[],
  allowed: true,
  forbid: false,
}));

vi.mock("@/server/session", () => ({
  requirePermission: async () => {
    if (calls.forbid) throw new Error("FORBIDDEN");
    return { id: "user-1", email: "staff@example.test" };
  },
  isRedirectError: (error: unknown) =>
    error instanceof Error && error.message === "NEXT_REDIRECT",
}));

vi.mock("@/server/services/rate-limit", () => ({
  allow: async (key: string, options: { max: number; windowMinutes: number }) => {
    calls.allow.push({ key, ...options });
    return calls.allowed;
  },
}));

vi.mock("@/server/services/audit", () => ({
  audit: async (input: unknown) => {
    calls.audit.push(input);
  },
}));

vi.mock("@/server/services/storage", () => {
  class StorageNotConfiguredError extends Error {}
  class UploadValidationError extends Error {}
  return {
    StorageNotConfiguredError,
    UploadValidationError,
    createSignedUpload: () => {
      calls.sign += 1;
      return {
        uploadUrl: "https://api.cloudinary.com/v1_1/demo/image/upload",
        fields: { api_key: "k", timestamp: 1, signature: "s" },
        limits: {
          maxBytes: 5_242_880,
          allowedMimeTypes: ["image/png"],
          folder: "darbar",
        },
      };
    },
  };
});

const { POST } = await import("@/app/api/upload/sign/route");

function request(body: unknown = { mimeType: "image/png", sizeBytes: 24_000 }) {
  return new Request("http://localhost/api/upload/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A request whose body is a raw string, so `json()` throws. */
function malformed() {
  return new Request("http://localhost/api/upload/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "i am not json",
  });
}

beforeEach(() => {
  calls.allow = [];
  calls.sign = 0;
  calls.audit = [];
  calls.allowed = true;
  calls.forbid = false;
});

describe("POST /api/upload/sign", () => {
  it("signs, spends one slot on a per-user counter, and leaves no audit row", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      uploadUrl: "https://api.cloudinary.com/v1_1/demo/image/upload",
    });
    // Keyed by the account, not the address: the whole campus shares one IP.
    expect(calls.allow).toEqual([
      { key: "upload-sign:user-1", max: 60, windowMinutes: 10 },
    ]);
    expect(calls.audit).toEqual([]);
  });

  it("429s once the counter is full and mints no signature", async () => {
    calls.allowed = false;
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "Too many uploads. Try again later.",
    });
    expect(calls.sign).toBe(0);
    expect(calls.audit).toEqual([]);
  });

  it("checks the limit after the permission, so a refusal costs no slot", async () => {
    calls.forbid = true;
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(calls.allow).toHaveLength(0);
    expect(calls.sign).toBe(0);
  });

  it("reads the body only once the caller is allowed to ask", async () => {
    const req = request();
    const json = vi.spyOn(req, "json");
    expect((await POST(req)).status).toBe(200);
    expect(json).toHaveBeenCalledTimes(1);
  });

  it("refuses a caller without the permission without parsing what they sent", async () => {
    calls.forbid = true;
    const req = request();
    const json = vi.spyOn(req, "json");
    expect((await POST(req)).status).toBe(403);
    expect(json).not.toHaveBeenCalled();
  });

  it("refuses an over-quota caller without parsing what they sent", async () => {
    calls.allowed = false;
    const req = request();
    const json = vi.spyOn(req, "json");
    expect((await POST(req)).status).toBe(429);
    expect(json).not.toHaveBeenCalled();
  });

  it("still answers a permitted caller with 400s for a body that is not usable", async () => {
    const malformedResponse = await POST(malformed());
    expect(malformedResponse.status).toBe(400);
    expect(await malformedResponse.json()).toEqual({ error: "Invalid request body" });

    const wrongShape = await POST(request({ mimeType: "application/x-msdownload" }));
    expect(wrongShape.status).toBe(400);
    expect(await wrongShape.json()).toMatchObject({ error: "Please fix the highlighted fields" });
    // Neither of them minted a signature, and both spent a slot: the counter is
    // per account, so retries of a broken payload cannot go unmetered.
    expect(calls.sign).toBe(0);
    expect(calls.allow).toHaveLength(2);
  });
});
