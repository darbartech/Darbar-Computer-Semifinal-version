import { describe, expect, it } from "vitest";

/**
 * Fix guide §11 — a production deployment that writes uploads to its own disk
 * loses them at the next deploy while the database keeps serving their URLs.
 * The boot check is the place that has to say so, before the first upload.
 */

const { validateServerEnv } = await import("@/lib/env");

const production: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@localhost:5433/darbar",
  AUTH_SECRET: "a-production-secret-of-thirty-two-characters",
  NEXT_PUBLIC_SITE_URL: "https://darbar.example",
};

function messages(env: NodeJS.ProcessEnv) {
  const { errors, warnings } = validateServerEnv(env);
  return { errors: errors.join("\n"), warnings: warnings.join("\n") };
}

describe("MEDIA_STORAGE_PROVIDER", () => {
  it("stops a production boot that stores uploads on local disk", () => {
    const { errors } = messages({ ...production, MEDIA_STORAGE_PROVIDER: "local" });
    expect(errors).toContain("MEDIA_STORAGE_PROVIDER=local is not allowed in production");
  });

  it("reads the value case- and space-insensitively", () => {
    const { errors } = messages({ ...production, MEDIA_STORAGE_PROVIDER: "  LOCAL " });
    expect(errors).toContain("not allowed in production");
  });

  it("says nothing about an explicit cloud provider", () => {
    const { errors } = messages({ ...production, MEDIA_STORAGE_PROVIDER: "cloudinary" });
    expect(errors).toBe("");
  });

  it("does not police the development disk", () => {
    const { errors, warnings } = messages({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user:pass@localhost:5433/darbar",
      MEDIA_STORAGE_PROVIDER: "local",
    });
    expect(errors).toBe("");
    expect(warnings).not.toContain("MEDIA_STORAGE_PROVIDER");
  });
});

describe("the rest of the production boot check", () => {
  it("still refuses a placeholder secret", () => {
    const { errors } = messages({ ...production, AUTH_SECRET: "change-me" });
    expect(errors).toContain("AUTH_SECRET");
  });

  it("passes a correctly configured production environment", () => {
    expect(messages(production).errors).toBe("");
  });
});
