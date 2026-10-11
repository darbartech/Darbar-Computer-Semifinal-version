import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertAllowedMimeType,
  assertWithinSizeLimit,
  createSignedUpload,
  getStorageConfig,
  signParams,
  StorageNotConfiguredError,
  UploadValidationError,
  verifyUploadedAsset,
  type StorageConfig,
} from "../src/server/services/storage";
import { MEDIA_MAX_BYTES, MEDIA_UPLOAD_FOLDER } from "../src/server/constants";

/**
 * docs/08 §1 "Uploads": signed uploads only, server enforces allowed MIME
 * (image/jpeg|png|webp|avif) and max size (5 MB), folder allow-list, and alt
 * text required. This file covers the enforcement points.
 */

process.env.CLOUDINARY_CLOUD_NAME = "darbar-test";
process.env.CLOUDINARY_API_KEY = "1234567890";
process.env.CLOUDINARY_API_SECRET = "test-secret";

const cloudinary: StorageConfig = {
  provider: "cloudinary",
  cloudName: "darbar-test",
  apiKey: "1234567890",
  apiSecret: "test-secret",
};

const validResult = {
  public_id: `${MEDIA_UPLOAD_FOLDER}/hero-photo`,
  secure_url: `https://res.cloudinary.com/darbar-test/image/upload/v1/${MEDIA_UPLOAD_FOLDER}/hero-photo.jpg`,
  bytes: 512_000,
  width: 1600,
  height: 900,
  format: "jpg",
  resource_type: "image",
};

describe("MIME allow-list", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/avif"])(
    "accepts %s",
    (mime) => {
      expect(() => assertAllowedMimeType(mime)).not.toThrow();
    }
  );

  it.each([
    "image/svg+xml", // script risk — docs/08 §1 explicitly excludes SVG
    "image/gif",
    "application/pdf",
    "text/html",
    "video/mp4",
    "",
  ])("rejects %s", (mime) => {
    expect(() => assertAllowedMimeType(mime)).toThrow(UploadValidationError);
  });

  it("is case sensitive, so a spoofed MIME cannot slip through", () => {
    expect(() => assertAllowedMimeType("IMAGE/JPEG")).toThrow(
      UploadValidationError
    );
  });
});

describe("size limit", () => {
  it("accepts a file at the limit", () => {
    expect(() => assertWithinSizeLimit(MEDIA_MAX_BYTES)).not.toThrow();
  });

  it("rejects a file over the limit", () => {
    expect(() => assertWithinSizeLimit(MEDIA_MAX_BYTES + 1)).toThrow(
      /too large/i
    );
  });

  it("rejects an empty or non-numeric size", () => {
    expect(() => assertWithinSizeLimit(0)).toThrow(UploadValidationError);
    expect(() => assertWithinSizeLimit(-1)).toThrow(UploadValidationError);
    expect(() => assertWithinSizeLimit(Number.NaN)).toThrow(
      UploadValidationError
    );
  });
});

describe("signParams", () => {
  it("is order independent", () => {
    expect(signParams({ b: "2", a: "1" }, "secret")).toBe(
      signParams({ a: "1", b: "2" }, "secret")
    );
  });

  it("changes when any signed parameter changes", () => {
    const base = { timestamp: 1, folder: MEDIA_UPLOAD_FOLDER };
    expect(signParams(base, "secret")).not.toBe(
      signParams({ ...base, folder: "somewhere-else" }, "secret")
    );
  });

  it("changes when the secret changes", () => {
    const params = { timestamp: 1 };
    expect(signParams(params, "secret-a")).not.toBe(
      signParams(params, "secret-b")
    );
  });
});

describe("createSignedUpload", () => {
  it("signs the enforced folder so the client cannot redirect the upload", () => {
    const signed = createSignedUpload({
      mimeType: "image/png",
      sizeBytes: 1000,
    });

    expect(signed.fields.folder).toBe(MEDIA_UPLOAD_FOLDER);
    expect(signed.fields.api_key).toBe("1234567890");
    expect(typeof signed.fields.signature).toBe("string");
    expect(signed.uploadUrl).toContain("darbar-test");
    // No SVG can be smuggled in through allowed_formats.
    expect(String(signed.fields.allowed_formats)).not.toContain("svg");
  });

  it("refuses to sign an unacceptable file, before it reaches storage", () => {
    expect(() =>
      createSignedUpload({ mimeType: "image/svg+xml", sizeBytes: 1000 })
    ).toThrow(UploadValidationError);
    expect(() =>
      createSignedUpload({ mimeType: "image/png", sizeBytes: MEDIA_MAX_BYTES + 1 })
    ).toThrow(UploadValidationError);
  });

  it("reports missing configuration instead of signing with undefined", () => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    // Local disk is a development convenience; force Cloudinary so this
    // assertion does not depend on NODE_ENV.
    process.env.MEDIA_STORAGE_PROVIDER = "cloudinary";
    delete process.env.CLOUDINARY_CLOUD_NAME;
    try {
      expect(() =>
        createSignedUpload({ mimeType: "image/png", sizeBytes: 10 })
      ).toThrow(StorageNotConfiguredError);
    } finally {
      delete process.env.MEDIA_STORAGE_PROVIDER;
      process.env.CLOUDINARY_CLOUD_NAME = cloudName;
    }
  });
});

describe("verifyUploadedAsset", () => {
  it("accepts a well-formed upload", () => {
    const verified = verifyUploadedAsset(validResult, cloudinary);
    expect(verified).toMatchObject({
      publicId: validResult.public_id,
      url: validResult.secure_url,
      mimeType: "image/jpeg",
      bytes: 512_000,
      width: 1600,
      height: 900,
      folder: MEDIA_UPLOAD_FOLDER,
    });
  });

  it("rejects an asset outside the allowed folder", () => {
    expect(() =>
      verifyUploadedAsset(
        { ...validResult, public_id: "someone-else/evil" },
        cloudinary
      )
    ).toThrow(/outside the allowed folder/i);
  });

  it("rejects a URL on an unexpected host", () => {
    expect(() =>
      verifyUploadedAsset(
        { ...validResult, secure_url: "https://evil.example.com/x.jpg" },
        cloudinary
      )
    ).toThrow(/unexpected delivery host/i);
  });

  it("rejects a plain-http URL", () => {
    expect(() =>
      verifyUploadedAsset(
        { ...validResult, secure_url: validResult.secure_url.replace("https:", "http:") },
        cloudinary
      )
    ).toThrow(/unexpected delivery host/i);
  });

  it("rejects a URL pointing at a different cloud", () => {
    expect(() =>
      verifyUploadedAsset(
        {
          ...validResult,
          secure_url:
            "https://res.cloudinary.com/someone-else/image/upload/v1/x/hero-photo.jpg",
        },
        cloudinary
      )
    ).toThrow(/unexpected cloud name/i);
  });

  it("rejects a format that is not on the allow-list", () => {
    expect(() =>
      verifyUploadedAsset({ ...validResult, format: "svg" }, cloudinary)
    ).toThrow(UploadValidationError);
    expect(() =>
      verifyUploadedAsset({ ...validResult, format: "gif" }, cloudinary)
    ).toThrow(UploadValidationError);
  });

  it("rejects a non-image resource type", () => {
    expect(() =>
      verifyUploadedAsset(
        { ...validResult, resource_type: "raw" },
        cloudinary
      )
    ).toThrow(/only image uploads/i);
  });

  it("rejects a file that reports more bytes than the limit", () => {
    expect(() =>
      verifyUploadedAsset(
        { ...validResult, bytes: MEDIA_MAX_BYTES + 1 },
        cloudinary
      )
    ).toThrow(/too large/i);
  });

  it("rejects an empty or malformed response", () => {
    expect(() =>
      verifyUploadedAsset(
        { ...validResult, public_id: "" },
        cloudinary
      )
    ).toThrow(/asset id/i);
    expect(() =>
      verifyUploadedAsset({ ...validResult, secure_url: "" }, cloudinary)
    ).toThrow(/URL/i);
    expect(() =>
      verifyUploadedAsset({ ...validResult, bytes: 0 }, cloudinary)
    ).toThrow(/empty file/i);
  });
});

/**
 * The development provider: uploads land in `public/uploads` and the browser
 * relays the same Cloudinary-shaped payload, so the verification rules must
 * hold just as strictly — only the expected host changes.
 */
describe("local storage provider", () => {
  const publicId = `${MEDIA_UPLOAD_FOLDER}/hero-photo.jpg`;
  const localResult = {
    public_id: publicId,
    secure_url: `http://localhost:3000/uploads/${publicId}`,
    bytes: 512_000,
    format: "jpg",
    resource_type: "image",
  };

  beforeEach(() => {
    process.env.MEDIA_STORAGE_PROVIDER = "local";
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  });

  afterEach(() => {
    delete process.env.MEDIA_STORAGE_PROVIDER;
    process.env.CLOUDINARY_CLOUD_NAME = "darbar-test";
    process.env.CLOUDINARY_API_KEY = "1234567890";
    process.env.CLOUDINARY_API_SECRET = "test-secret";
  });

  it("is selected when no Cloudinary credentials are set", () => {
    expect(getStorageConfig()).toMatchObject({ provider: "local" });
  });

  it("signs nothing and points the browser at the local route", () => {
    const signed = createSignedUpload({
      mimeType: "image/png",
      sizeBytes: 1000,
    });

    expect(signed.uploadUrl).toBe("/api/upload/local");
    expect(signed.fields).toEqual({});
    expect(signed.limits.maxBytes).toBe(MEDIA_MAX_BYTES);
  });

  it("still refuses an unacceptable file before it is written", () => {
    expect(() =>
      createSignedUpload({ mimeType: "image/svg+xml", sizeBytes: 10 })
    ).toThrow(UploadValidationError);
    expect(() =>
      createSignedUpload({ mimeType: "image/png", sizeBytes: MEDIA_MAX_BYTES + 1 })
    ).toThrow(UploadValidationError);
  });

  it("accepts a same-origin upload under the uploads directory", () => {
    const verified = verifyUploadedAsset(localResult, getStorageConfig()!);
    expect(verified).toMatchObject({
      publicId,
      url: localResult.secure_url,
      mimeType: "image/jpeg",
      folder: MEDIA_UPLOAD_FOLDER,
    });
    expect(verified.width).toBeNull();
  });

  it("rejects a URL served from another origin", () => {
    expect(() =>
      verifyUploadedAsset(
        { ...localResult, secure_url: "https://evil.example.com/uploads/x.jpg" },
        getStorageConfig()!
      )
    ).toThrow(/unexpected delivery host/i);
  });

  it("rejects a path outside the uploads directory", () => {
    expect(() =>
      verifyUploadedAsset(
        { ...localResult, secure_url: `http://localhost:3000/secret/${publicId}` },
        getStorageConfig()!
      )
    ).toThrow(/unexpected delivery path/i);
  });

  it("rejects an asset outside the allowed folder", () => {
    expect(() =>
      verifyUploadedAsset(
        { ...localResult, public_id: "elsewhere/hero-photo.jpg" },
        getStorageConfig()!
      )
    ).toThrow(/outside the allowed folder/i);
  });
});