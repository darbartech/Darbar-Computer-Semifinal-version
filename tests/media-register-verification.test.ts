import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MEDIA_MAX_BYTES, MEDIA_UPLOAD_FOLDER } from "../src/server/constants";

/**
 * Fix guide §11 — "confirm `registerMediaUpload` rejects oversize or
 * wrong-format results".
 *
 * The upload response is relayed by the browser, so every number in it is
 * advisory. These tests run the real `verifyUploadedAsset` +
 * `confirmAssetOnProvider` against a stand-in Cloudinary and pin what the
 * library is allowed to learn from it: an asset is registered from the
 * provider's own record of its size and format, and an asset whose record
 * breaks the rules is destroyed instead of stored.
 */

process.env.CLOUDINARY_CLOUD_NAME = "darbar-test";
process.env.CLOUDINARY_API_KEY = "1234567890";
process.env.CLOUDINARY_API_SECRET = "test-secret";

const calls = vi.hoisted(() => ({
  created: [] as Array<Record<string, unknown>>,
  audited: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/headers", () => ({
  // `x-forwarded-host` is only used when `host` is missing; sending both proves
  // the action reads the real one.
  headers: async () =>
    new Headers({ host: "example.test", "x-forwarded-host": "localhost:3001" }),
}));

vi.mock("@/server/db", () => ({ db: {} }));

vi.mock("@/server/session", () => ({
  isRedirectError: () => false,
  requirePermission: async () => ({ id: "user-admin", email: "admin@example.com" }),
}));

vi.mock("@/server/services/audit", () => ({
  audit: async (input: unknown) => {
    calls.audited.push(input as Record<string, unknown>);
  },
}));

vi.mock("@/server/dal/media", () => ({
  createMedia: async (data: Record<string, unknown>) => {
    calls.created.push(data);
    return { id: "media-1", url: String(data.url), alt: String(data.alt) };
  },
  createExternalMedia: async () => {
    throw new Error("not used here");
  },
  deleteMediaRow: async () => null,
  getMediaUsage: async () => [],
  updateMediaAlt: async () => null,
}));

import { registerMediaUpload } from "../src/server/actions/media";

const publicId = `${MEDIA_UPLOAD_FOLDER}/notice-2026`;
const secureUrl = `https://res.cloudinary.com/darbar-test/image/upload/v1/${publicId}.jpg`;

/** What the browser relayed: a small JPEG. */
const claim = {
  publicId,
  secureUrl,
  bytes: 512_000,
  width: 1600,
  height: 900,
  format: "jpg",
  resourceType: "image",
  alt: "Notice board poster for the November batch",
};

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

/**
 * `truth` is what Cloudinary's Admin API says the asset is. `null` makes that
 * request fail the way an unreachable provider would.
 */
function cloudinarySays(truth: { bytes: number; format: string } | null) {
  globalThis.fetch = fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/resources/image/upload/")) {
      if (truth === null) throw new Error("ETIMEDOUT");
      return { ok: true, status: 200, json: async () => truth };
    }
    if (url.includes("/image/destroy")) {
      return { ok: true, status: 200, json: async () => ({ result: "ok" }) };
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

const destroyed = () =>
  fetchMock.mock.calls.some(([url]) => String(url).includes("/image/destroy"));
const askedProvider = () =>
  fetchMock.mock.calls.some(([url]) => String(url).includes("/resources/image/upload/"));

beforeEach(() => {
  calls.created.length = 0;
  calls.audited.length = 0;
  fetchMock.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("registerMediaUpload", () => {
  it("stores the provider's size and format, not the ones the browser reported", async () => {
    cloudinarySays({ bytes: 1_200_000, format: "png" });

    const result = await registerMediaUpload(claim);

    expect(result.ok).toBe(true);
    expect(askedProvider()).toBe(true);
    expect(calls.created).toHaveLength(1);
    expect(calls.created[0]).toMatchObject({
      bytes: 1_200_000,
      mimeType: "image/png",
      publicId,
      folder: MEDIA_UPLOAD_FOLDER,
    });
  });

  it("audits the confirmed bytes so the log cannot be quoted back at itself", async () => {
    cloudinarySays({ bytes: 1_200_000, format: "png" });

    await registerMediaUpload(claim);

    const success = calls.audited.find((entry) => entry.action === "media.upload");
    expect(success).toBeTruthy();
    expect(success?.meta).toMatchObject({ bytes: 1_200_000, mimeType: "image/png" });
  });

  it("rejects and destroys an asset that is really over the size cap", async () => {
    cloudinarySays({ bytes: MEDIA_MAX_BYTES + 1, format: "jpg" });

    const result = await registerMediaUpload(claim);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/i);
    expect(calls.created).toHaveLength(0);
    expect(destroyed()).toBe(true);
    expect(
      calls.audited.some((entry) => entry.action === "media.upload.rejected")
    ).toBe(true);
  });

  it("rejects and destroys an asset the provider holds as an unsupported format", async () => {
    cloudinarySays({ bytes: 4_000, format: "svg" });

    const result = await registerMediaUpload(claim);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unsupported file type/i);
    expect(calls.created).toHaveLength(0);
    expect(destroyed()).toBe(true);
  });

  it("refuses rather than trusting the claim when the provider cannot be reached", async () => {
    cloudinarySays(null);

    const result = await registerMediaUpload(claim);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/could not be verified/i);
    expect(calls.created).toHaveLength(0);
    expect(destroyed()).toBe(true);
  });

  it("still rejects a relayed size over the cap before asking the provider", async () => {
    cloudinarySays({ bytes: 1_000, format: "jpg" });

    const result = await registerMediaUpload({
      ...claim,
      bytes: MEDIA_MAX_BYTES + 500_000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/i);
    expect(askedProvider()).toBe(false);
    expect(calls.created).toHaveLength(0);
    expect(destroyed()).toBe(true);
  });

  it("never writes a row for an asset that landed outside the folder", async () => {
    cloudinarySays({ bytes: 1_000, format: "jpg" });

    const result = await registerMediaUpload({
      ...claim,
      publicId: `somewhere/else/${publicId}`,
    });

    expect(result.ok).toBe(false);
    expect(askedProvider()).toBe(false);
    expect(calls.created).toHaveLength(0);
  });
});
