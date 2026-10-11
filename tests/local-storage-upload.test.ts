import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  destroyAsset,
  getStorageConfig,
  verifyUploadedAsset,
  writeLocalUpload,
  type CloudinaryUploadResult,
} from "../src/server/services/storage";
import { MEDIA_UPLOAD_FOLDER } from "../src/server/constants";

const ORIGIN = "http://localhost:3000";

describe("local upload round trip", () => {
  beforeAll(() => {
    process.env.MEDIA_STORAGE_PROVIDER = "local";
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    process.env.NEXT_PUBLIC_SITE_URL = ORIGIN;
  });

  it("writes a file, verifies the relayed payload, then deletes it", async () => {
    const config = getStorageConfig();
    expect(config?.provider).toBe("local");

    const written = await writeLocalUpload(
      {
        // Smallest valid PNG header bytes; content is irrelevant here.
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        mimeType: "image/png",
        width: 1600,
        height: 900,
      },
      ORIGIN
    );

    expect(written.public_id.startsWith(`${MEDIA_UPLOAD_FOLDER}/`)).toBe(true);
    expect(written.secure_url).toBe(`${ORIGIN}/uploads/${written.public_id}`);
    expect(written.format).toBe("png");
    expect(written.bytes).toBe(8);

    const onDisk = path.join(
      process.cwd(),
      "public",
      "uploads",
      written.public_id
    );
    await expect(readFile(onDisk)).resolves.toHaveLength(8);

    const verified = verifyUploadedAsset(written, config!);
    expect(verified).toMatchObject({
      publicId: written.public_id,
      url: written.secure_url,
      mimeType: "image/png",
      width: 1600,
      height: 900,
      folder: MEDIA_UPLOAD_FOLDER,
    });

    await destroyAsset(written.public_id);
    await expect(access(onDisk)).rejects.toThrow();
  });

  it("refuses a traversal public id on delete", async () => {
    await expect(destroyAsset("../../../package.json")).resolves.toBeUndefined();
    // `access` resolves with undefined when the file is still there.
    await expect(
      access(path.join(process.cwd(), "package.json"))
    ).resolves.toBeUndefined();
  });

  it("accepts the LAN origin the admin actually browsed from", () => {
    const config = getStorageConfig()!;
    const result = {
      public_id: `${MEDIA_UPLOAD_FOLDER}/probe.jpg`,
      secure_url: `http://192.168.1.2:3000/uploads/${MEDIA_UPLOAD_FOLDER}/probe.jpg`,
      bytes: 2048,
      format: "jpg",
      resource_type: "image",
    } as CloudinaryUploadResult;

    expect(() =>
      verifyUploadedAsset(result, config, {
        requestOrigin: "http://192.168.1.2:3000",
      })
    ).not.toThrow();
    // Without the request origin it is an off-site delivery.
    expect(() => verifyUploadedAsset(result, config)).toThrow(
      /unexpected delivery host/
    );
    // Another host is still refused.
    expect(() =>
      verifyUploadedAsset(result, config, {
        requestOrigin: "http://evil.example.com",
      })
    ).toThrow(/unexpected delivery host/);
  });
});

afterAll(() => {
  delete process.env.MEDIA_STORAGE_PROVIDER;
});