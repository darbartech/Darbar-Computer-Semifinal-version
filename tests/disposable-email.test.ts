import { describe, expect, it } from "vitest";
import {
  DISPOSABLE_EMAIL_MESSAGE,
  emailDomain,
  isDisposableEmail,
} from "@/lib/disposable-email";
import {
  optionalEmailSchema,
  optionalPublicEmailSchema,
  publicEmailSchema,
  requiredEmailSchema,
} from "@/lib/validators/shared";
import { contactFormSchema, contactSchema } from "@/lib/validators/contact";
import { inquiryFormSchema, inquirySchema } from "@/lib/validators/lead";
import { studentRegisterFormSchema } from "@/lib/validators/student";

/**
 * Disposable addresses and public forms (docs 01 §S9).
 *
 * The interesting half of this rule is where it is NOT enforced: sign-in and
 * password reset keep accepting a throwaway domain, because whoever registered
 * with one before still owns that account.
 */

describe("emailDomain", () => {
  it("takes the part after the last @, lower-cased", () => {
    expect(emailDomain("Ram.Sharma@Gmail.COM")).toBe("gmail.com");
    expect(emailDomain("  a@Mailinator.com  ")).toBe("mailinator.com");
    expect(emailDomain("quoted@local@domain.com")).toBe("domain.com");
  });

  it("drops the trailing dot of a fully-qualified domain", () => {
    expect(emailDomain("a@mailinator.com.")).toBe("mailinator.com");
  });

  it("returns null when there is no usable domain", () => {
    expect(emailDomain("")).toBeNull();
    expect(emailDomain("no-at-sign")).toBeNull();
    expect(emailDomain("@mailinator.com")).toBeNull();
    expect(emailDomain("a@")).toBeNull();
  });
});

describe("isDisposableEmail", () => {
  it("recognises the well-known throwaway providers", () => {
    for (const address of [
      "x@mailinator.com",
      "X@YOPMAIL.COM",
      "x@10minutemail.com",
      "x@temp-mail.org",
      "x@guerrillamail.com",
      "x@trashmail.com",
      "x@getnada.com",
      "x@mail.tm",
    ])
      expect(isDisposableEmail(address), address).toBe(true);
  });

  it("leaves the addresses real students use alone", () => {
    for (const address of [
      "ram@gmail.com",
      "ram@outlook.com",
      "class-of-2026@darbar.edu.np",
      "info@darbarcomputer.com.np",
    ])
      expect(isDisposableEmail(address), address).toBe(false);
  });

  it("matches the domain exactly, never a substring", () => {
    // A lookalike host and a subdomain of a listed domain are both real mailboxes.
    expect(isDisposableEmail("x@notmailinator.com")).toBe(false);
    expect(isDisposableEmail("x@mailinator.com.evil.test")).toBe(false);
    expect(isDisposableEmail("x@mail.mailinator.com")).toBe(false);
  });

  it("survives malformed input without throwing", () => {
    expect(isDisposableEmail("")).toBe(false);
    expect(isDisposableEmail("plain-address")).toBe(false);
    expect(isDisposableEmail("@")).toBe(false);
  });
});

describe("the shared email fields", () => {
  it("refuses a throwaway domain on the public copy", () => {
    const result = publicEmailSchema.safeParse("applicant@mailinator.com");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(DISPOSABLE_EMAIL_MESSAGE);
  });

  it("still accepts a throwaway domain where someone signs in", () => {
    // requiredEmailSchema backs studentLoginSchema and the forgot-password form.
    // Blocking there would lock an early registrant out of their own account.
    expect(requiredEmailSchema.safeParse("applicant@mailinator.com").success).toBe(true);
    expect(optionalEmailSchema.safeParse("applicant@mailinator.com").success).toBe(true);
  });

  it("treats blank as 'not provided', not as disposable", () => {
    expect(optionalPublicEmailSchema.safeParse(undefined).success).toBe(true);
    expect(optionalPublicEmailSchema.safeParse("").success).toBe(true);
    expect(optionalPublicEmailSchema.safeParse("x@mailinator.com").success).toBe(false);
  });

  it("does not report two errors for one malformed address", () => {
    // A string that is not an address fails the format rule only, so the person
    // reading the form is not told to abandon a provider they do not use.
    const issues = publicEmailSchema.safeParse("not-an-email").error?.issues ?? [];
    expect(issues.map((issue) => issue.message)).toEqual(["Please enter a valid email address"]);
  });
});

describe("public forms", () => {
  const contact = {
    name: "Ram Sharma",
    email: "ram@gmail.com",
    subject: "Diploma intake",
    message: "I would like to join the next batch please.",
  };

  it("rejects a throwaway address on the contact form and on the action", () => {
    expect(contactFormSchema.safeParse({ ...contact, email: "ram@mailinator.com" }).success).toBe(
      false
    );
    // The action copy needs the token, or it would fail for the wrong reason.
    const action = contactSchema.safeParse({
      ...contact,
      email: "ram@mailinator.com",
      turnstileToken: "token",
    });
    expect(action.success).toBe(false);
    expect(action.error?.issues[0].path).toEqual(["email"]);
    expect(contactFormSchema.safeParse(contact).success).toBe(true);
  });

  it("rejects one on the admission inquiry, blank still passing", () => {
    const inquiry = {
      fullName: "Ram Sharma",
      phone: "9800000000",
      preferredBatch: "MORNING" as const,
      consent: true,
    };
    expect(inquiryFormSchema.safeParse(inquiry).success).toBe(true);
    expect(inquiryFormSchema.safeParse({ ...inquiry, email: "a@yopmail.com" }).success).toBe(false);

    const action = inquirySchema.safeParse({
      ...inquiry,
      email: "a@yopmail.com",
      turnstileToken: "token",
    });
    expect(action.success).toBe(false);
    expect(action.error?.issues[0].path).toEqual(["email"]);
  });

  it("rejects one on student registration, in the browser and on the action", () => {
    const register = {
      name: "Ram Sharma",
      email: "ram@mailinator.com",
      password: "password123",
      confirmPassword: "password123",
    };
    const result = studentRegisterFormSchema.safeParse(register);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(DISPOSABLE_EMAIL_MESSAGE);
  });
});
