import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix guide §10 — the duplicate-address notice is the only channel that can tell
 * a person what to do next, so it is tested as a template: the two links, the
 * escaped site name, and the promise that it says nothing about the account
 * beyond "it exists".
 */

const sent: Array<Record<string, unknown>> = [];

vi.stubGlobal(
  "fetch",
  vi.fn(async (_url: unknown, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ id: "mail-1" }) };
  })
);

const { sendAccountExistsEmail } = await import("@/server/services/email");

const envKeys = ["RESEND_API_KEY", "MAIL_FROM", "NEXT_PUBLIC_SITE_URL"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of envKeys) {
    saved[key] = process.env[key];
  }
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.MAIL_FROM = "DarbarTech <no-reply@darbar.test>";
  process.env.NEXT_PUBLIC_SITE_URL = "https://darbar.example/";
  sent.length = 0;
});

afterEach(() => {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("sendAccountExistsEmail", () => {
  it("goes to the address that was tried, with both next steps linked", async () => {
    const result = await sendAccountExistsEmail({ to: "someone@example.test" });
    expect(result).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.to).toEqual(["someone@example.test"]);
    const html = String(mail.html);
    expect(html).toContain(`href="https://darbar.example/student/login"`);
    expect(html).toContain(`href="https://darbar.example/student/forgot-password"`);
    expect(String(mail.text)).toContain("https://darbar.example/student/login");
  });

  it("says nothing that identifies the account", async () => {
    await sendAccountExistsEmail({ to: "someone@example.test" });
    const mail = sent[0];
    const body = `${mail.html} ${mail.text}`;
    // No recipient name is even available to this flow, and nothing is invented.
    expect(body).not.toContain("someone@example.test");
    expect(body).not.toMatch(/SUPER_ADMIN|INSTRUCTOR|phone|password was changed/i);
    expect(String(mail.subject)).toBe("Your DarbarTech account already exists");
  });

  it("escapes the site name in the link text", async () => {
    await sendAccountExistsEmail({
      to: "someone@example.test",
      siteName: '<script>alert("x")</script>',
    });
    const html = String(sent[0].html);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes a site URL that carries markup", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://darbar.example/<x>";
    await sendAccountExistsEmail({ to: "someone@example.test" });
    expect(String(sent[0].html)).not.toContain("/<x>/student");
  });

  it("reports the missing provider instead of throwing", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendAccountExistsEmail({ to: "someone@example.test" })).resolves.toEqual({
      sent: false,
      reason: "email-not-configured",
    });
    expect(sent).toHaveLength(0);
  });
});
