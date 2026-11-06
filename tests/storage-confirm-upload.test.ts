import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmAssetOnProvider,
  UploadValidationError,
  type VerifiedUpload,
  type StorageConfig,
} from "../src/server/services/storage";
import { MEDIA_MAX_BYTES, MEDIA_UPLOAD_FOLDER } from "../src/server/constants";

/**
 * docs/08 §1 "Uploads" + fix guide §11 "Cloudinary size limit".
 *
 * `verifyUploadedAsset` can only judge the byte count and format the browser
 * relayed. These tests pin the second step: the numbers written to the `Media`
 * row come from Cloudinary's own record of the asset, and anything that cannot
 * be confirmed is a rejection.
 */

const cloudinary: StorageConfig = {
  provider: "cloudinary",
  cloudName: "darbar-test",
  apiKey: "1234567890",
  apiSecret: "test-secret",
};

const local: StorageConfig = {
  provider: "local",
  cloudName: null,
  apiKey: null,
  apiSecret: null,
};

/** What the browser claimed, already passed through `verifyUploadedAsset`. */
const claimed: VerifiedUpload = {
  publicId: `${MEDIA_UPLOAD_FOLDER}/notice-2026`,
  url: `https://res.cloudinary.com/darbar-test/image/upload/v1/${MEDIA_UPLOAD_FOLDER}/notice-2026.jpg`,
  bytes: 512_000,
  width: 1600,
  height: 900,
  mimeType: "image/jpeg",
  folder: MEDIA_UPLOAD_FOLDER,
};

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function provider(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  fetchMock.mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
}

describe("confirmAssetOnProvider", () => {
  it("writes the provider's size and type, not the relayed ones", async () => {
    provider({ bytes: 4_900_000, format: "png", width: 800, height: 600 });

    const confirmed = await confirmAssetOnProvider(claimed, cloudinary);

    expect(confirmed).toMatchObject({
      bytes: 4_900_000,
      mimeType: "image/png",
      width: 800,
      height: 600,
      publicId: claimed.publicId,
      url: claimed.url,
      folder: claimed.folder,
    });
  });

  it("asks for exactly this asset with the API credentials", async () => {
    provider({ bytes: 1_000, format: "jpg" });

    await confirmAssetOnProvider(claimed, cloudinary);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.cloudinary.com/v1_1/darbar-test/resources/image/upload/${MEDIA_UPLOAD_FOLDER}/notice-2026`
    );
    expect(init.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("1234567890:test-secret").toString("base64")}`,
    });
    expect(init.cache).toBe("no-store");
  });

  it("rejects an asset that is really larger than the cap", async () => {
    provider({ bytes: MEDIA_MAX_BYTES + 1, format: "jpg" });

    await expect(confirmAssetOnProvider(claimed, cloudinary)).rejects.toThrow(
      UploadValidationError
    );
    await expect(confirmAssetOnProvider(claimed, cloudinary)).rejects.toThrow(/too large/i);
  });

  it("rejects an asset the provider holds in a format we do not accept", async () => {
    provider({ bytes: 20_000, format: "svg" });

    await expect(confirmAssetOnProvider(claimed, cloudinary)).rejects.toThrow(
      /Unsupported file type/i
    );
  });

  it.each([
    ["a non-2xx answer", () => provider({}, { ok: false, status: 404 })],
    ["a body that is not JSON", () => { fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } } as never); }],
    ["a body with no byte count", () => provider({ format: "jpg" })],
    ["an unreachable provider", () => { fetchMock.mockRejectedValue(new Error("ETIMEDOUT")); }],
  ])("fails closed on %s", async (_label, arrange) => {
    arrange();

    await expect(confirmAssetOnProvider(claimed, cloudinary)).rejects.toThrow(
      /could not be verified/i
    );
  });

  it("refuses without credentials rather than skipping the check", async () => {
    const unconfigured: StorageConfig = {
      provider: "cloudinary",
      cloudName: "darbar-test",
      apiKey: null,
      apiSecret: null,
    };

    await expect(confirmAssetOnProvider(claimed, unconfigured)).rejects.toThrow(
      /could not be verified/i
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves local uploads alone — this server wrote those bytes itself", async () => {
    await expect(confirmAssetOnProvider(claimed, local)).resolves.toBe(claimed);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the claimed dimensions when the provider reports none", async () => {
    provider({ bytes: 64_000, format: "webp" });

    const confirmed = await confirmAssetOnProvider(claimed, cloudinary);

    expect(confirmed).toMatchObject({
      width: 1600,
      height: 900,
      mimeType: "image/webp",
      bytes: 64_000,
    });
  });
});
