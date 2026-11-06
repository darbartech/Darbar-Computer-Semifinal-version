import "server-only";
import {
  STUDENT_LOGIN_PATH,
  STUDENT_PASSWORD_FORGOT_PATH,
} from "@/server/constants";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

export type EmailResult = { sent: true } | { sent: false; reason: string };

function getConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

/**
 * Sends one transactional email through the Resend REST API.
 *
 * Uses `fetch` directly so the project does not gain an email SDK dependency
 * for two messages. Returns a result instead of throwing: docs/04 §2.3
 * requires a failed notification to never fail the form submission.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const config = getConfig();
  if (!config) return { sent: false, reason: "email-not-configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      // Log the status only — never the body, which would contain the
      // recipient's phone number or email address (docs/08 §1).
      return { sent: false, reason: `resend-http-${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "unknown",
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function notifyTarget(): string | null {
  return process.env.LEAD_NOTIFY_TO?.trim() || null;
}

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

export type LeadNotification = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  courseTitle: string | null;
  preferredBatch: string;
  isDuplicate: boolean;
};

/**
 * New-lead notification to admissions staff (docs/04 §2.3). Called after the
 * response has been sent, so a slow or failing provider never delays the
 * visitor.
 */
export async function notifyNewLead(
  lead: LeadNotification
): Promise<EmailResult> {
  const to = notifyTarget();
  if (!to) return { sent: false, reason: "lead-notify-not-configured" };

  const link = siteUrl(`/techdarbar/leads/${lead.id}`);
  const duplicateNote = lead.isDuplicate
    ? "<p><strong>Note:</strong> this phone number already enquired within the last 7 days.</p>"
    : "";

  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5">
  <h2>New admission inquiry</h2>
  ${duplicateNote}
  <table cellpadding="4" cellspacing="0">
    <tr><td><strong>Name</strong></td><td>${escapeHtml(lead.fullName)}</td></tr>
    <tr><td><strong>Phone</strong></td><td>${escapeHtml(lead.phone)}</td></tr>
    <tr><td><strong>Email</strong></td><td>${escapeHtml(lead.email ?? "—")}</td></tr>
    <tr><td><strong>Course</strong></td><td>${escapeHtml(lead.courseTitle ?? "Undecided")}</td></tr>
    <tr><td><strong>Preferred batch</strong></td><td>${escapeHtml(lead.preferredBatch)}</td></tr>
  </table>
  <p><a href="${escapeHtml(link)}">Open in admin</a></p>
</div>`;

  const text = [
    "New admission inquiry",
    lead.isDuplicate
      ? "Note: this phone number already enquired within the last 7 days."
      : "",
    `Name: ${lead.fullName}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email ?? "-"}`,
    `Course: ${lead.courseTitle ?? "Undecided"}`,
    `Preferred batch: ${lead.preferredBatch}`,
    `Open in admin: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendEmail({ to, subject: `New inquiry — ${lead.fullName}`, html, text });
}

export type ContactNotification = {
  id: string;
  name: string;
  email: string;
  subject: string;
};

/** New contact-form message for staff. */
export async function notifyNewContactMessage(
  message: ContactNotification
): Promise<EmailResult> {
  const to = notifyTarget();
  if (!to) return { sent: false, reason: "lead-notify-not-configured" };

  const link = siteUrl(`/techdarbar/messages/${message.id}`);
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5">
  <h2>New website message</h2>
  <p><strong>${escapeHtml(message.subject)}</strong></p>
  <p>From: ${escapeHtml(message.name)} &lt;${escapeHtml(message.email)}&gt;</p>
  <p><a href="${escapeHtml(link)}">Open in admin</a></p>
</div>`;
  const text = [
    "New website message",
    `Subject: ${message.subject}`,
    `From: ${message.name} <${message.email}>`,
    `Open in admin: ${link}`,
  ].join("\n");

  return sendEmail({ to, subject: `Website message — ${message.subject}`, html, text });
}

/**
 * Optional auto-reply to the enquirer (docs/04 §2.3, marked optional there).
 * Only sent when they left an email address.
 */
export async function sendInquiryAutoReply(
  to: string,
  fullName: string,
  siteName: string
): Promise<EmailResult> {
  return sendEmail({
    to,
    subject: `We received your inquiry — ${siteName}`,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">
  <p>Hello ${escapeHtml(fullName)},</p>
  <p>Thank you for contacting ${escapeHtml(siteName)}. We have received your inquiry and a counselor will call or email you within 1 business day.</p>
  <p>— ${escapeHtml(siteName)}</p>
</div>`,
    text: `Hello ${fullName},\n\nThank you for contacting ${siteName}. We have received your inquiry and a counselor will call or email you within 1 business day.\n\n— ${siteName}`,
  });
}

/**
 * Repeated failed sign-ins on one account (docs 01 §S5). The account is never
 * locked, because that would let an attacker on another IP lock out the real
 * owner — instead the account owner and every SUPER_ADMIN are told.
 */
export async function notifyFailedSigninBurst(input: {
  ownerEmail: string;
  adminEmails: string[];
}): Promise<EmailResult> {
  const recipients = Array.from(
    new Set([input.ownerEmail, ...input.adminEmails].map((e) => e.trim()).filter(Boolean))
  );
  if (recipients.length === 0) return { sent: false, reason: "no-recipients" };

  const account = escapeHtml(input.ownerEmail);
  return sendEmail({
    to: recipients,
    subject: "Several failed sign-in attempts on your DarbarTech account",
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">
  <p>Someone has failed to sign in to <strong>${account}</strong> too many times in the last hour.</p>
  <p>If this was you, nothing needs to be done. If it was not, change your password and check that two-factor authentication is enabled.</p>
  <p>The account has not been locked and no password has been changed.</p>
</div>`,
    text: `Someone has failed to sign in to ${input.ownerEmail} too many times in the last hour.\n\nIf this was you, nothing needs to be done. If it was not, change your password and check that two-factor authentication is enabled.\n\nThe account has not been locked and no password has been changed.`,
  });
}

/**
 * A void removes money from a ledger that has already been counted, so the
 * accounts owner hears about it without having to look (fix guide §11). The
 * audit row is the record; this is the alert.
 *
 * The staff member who pressed Void is not on the list — they just watched it
 * happen. In a single-super-admin institute that means no mail is sent, which is
 * the honest outcome rather than mailing someone about their own click.
 */
export async function notifyAdminVoid(input: {
  to: string[];
  what: string;
  amountNpr: number | null;
  reason: string;
  byEmail: string;
  at: Date;
  id: string;
}): Promise<EmailResult> {
  const recipients = Array.from(
    new Set(
      input.to
        .map((address) => address.trim())
        .filter((address) => address && address !== input.byEmail)
    )
  );
  if (recipients.length === 0) return { sent: false, reason: "no-recipients" };

  const link = siteUrl(`/techdarbar/fees/${input.id}`);
  const amount =
    input.amountNpr === null ? "—" : `NPR ${input.amountNpr.toLocaleString("en-IN")}`;

  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5">
  <h2>${escapeHtml(input.what)} was voided</h2>
  <table cellpadding="4" cellspacing="0">
    <tr><td><strong>Amount</strong></td><td>${escapeHtml(amount)}</td></tr>
    <tr><td><strong>Reason</strong></td><td>${escapeHtml(input.reason)}</td></tr>
    <tr><td><strong>By</strong></td><td>${escapeHtml(input.byEmail)}</td></tr>
    <tr><td><strong>When</strong></td><td>${escapeHtml(input.at.toISOString())}</td></tr>
  </table>
  <p>The audit log carries the same entry. Nothing was deleted: the document stays in the books marked as void.</p>
  <p><a href="${escapeHtml(link)}">Open in admin</a></p>
</div>`;

  const text = [
    `${input.what} was voided`,
    "",
    `Amount: ${amount}`,
    `Reason: ${input.reason}`,
    `By: ${input.byEmail}`,
    `When: ${input.at.toISOString()}`,
    "",
    "The audit log carries the same entry. Nothing was deleted: the document stays in the books marked as void.",
    `Open in admin: ${link}`,
  ].join("\n");

  return sendEmail({
    to: recipients,
    subject: `Voided — ${input.what}`,
    html,
    text,
  });
}

/**
 * Password-reset email (docs 01 §S4). The link is Better Auth's
 * `/api/auth/reset-password/<token>` redirect, which validates the token and then
 * forwards to the portal's own reset page. It is valid for 30 minutes and single
 * use, and the message deliberately does not say whether the address has an
 * account — the action sends it either way.
 */
export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  url: string;
  siteName?: string;
}): Promise<EmailResult> {
  const siteName = input.siteName?.trim() || "DarbarTech";
  const url = escapeHtml(input.url);
  return sendEmail({
    to: input.to,
    subject: `Reset your password — ${siteName}`,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">
  <p>Hello ${escapeHtml(input.name)},</p>
  <p>We received a request to reset your ${escapeHtml(siteName)} password.</p>
  <p><a href="${url}">Choose a new password</a> — this link works once and expires in 30 minutes.</p>
  <p>If you did not request it, you can ignore this email. Your password stays as it is.</p>
  <p>— ${escapeHtml(siteName)}</p>
</div>`,
    text: `Hello ${input.name},\n\nWe received a request to reset your ${siteName} password.\n\nChoose a new password: ${input.url}\n\nThis link works once and expires in 30 minutes.\n\nIf you did not request it, you can ignore this email. Your password stays as it is.\n\n— ${siteName}`,
  });
}

/**
 * Student email-verification message (docs 01 §S3). Better Auth hands us a
 * signed link pointing at `/api/auth/verify-email`; the portal itself refuses to
 * open until it is followed, so the email has to explain that plainly.
 */
export async function sendStudentVerificationEmail(input: {
  to: string;
  name: string;
  url: string;
  siteName?: string;
}): Promise<EmailResult> {
  const siteName = input.siteName?.trim() || "DarbarTech";
  const url = escapeHtml(input.url);
  return sendEmail({
    to: input.to,
    subject: `Verify your email — ${siteName}`,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">
  <p>Hello ${escapeHtml(input.name)},</p>
  <p>Confirm your email address to open your ${escapeHtml(siteName)} student portal.</p>
  <p><a href="${url}">Verify my email</a> — this link expires in 1 hour.</p>
  <p>If you did not create an account, you can ignore this email.</p>
  <p>— ${escapeHtml(siteName)}</p>
</div>`,
    text: `Hello ${input.name},\n\nConfirm your email address to open your ${siteName} student portal.\n\nVerify my email: ${input.url}\n\nThis link expires in 1 hour.\n\nIf you did not create an account, you can ignore this email.\n\n— ${siteName}`,
  });
}

/**
 * "This address already has an account" notice (fix guide §10).
 *
 * The register form answers every submission with the same message, so this mail
 * is the only thing that reaches the person — and the reason the form is allowed
 * to stay silent about whether an address is taken. Nothing about the account is
 * revealed: no name, no role, no statement that a password exists for it.
 */
export async function sendAccountExistsEmail(input: {
  to: string;
  siteName?: string;
}): Promise<EmailResult> {
  const siteName = input.siteName?.trim() || "DarbarTech";
  const signIn = escapeHtml(siteUrl(STUDENT_LOGIN_PATH));
  const reset = escapeHtml(siteUrl(STUDENT_PASSWORD_FORGOT_PATH));
  return sendEmail({
    to: input.to,
    subject: `Your ${siteName} account already exists`,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">
  <p>Hello,</p>
  <p>Someone used this email address on the ${escapeHtml(siteName)} student sign-up form. An account for it already exists, so nothing new was created.</p>
  <p><a href="${signIn}">Sign in to your portal</a> · <a href="${reset}">Forgot your password?</a></p>
  <p>If that was not you, you can ignore this email. Your account was not signed into and your password has not changed.</p>
  <p>— ${escapeHtml(siteName)}</p>
</div>`,
    text: `Hello,\n\nSomeone used this email address on the ${siteName} student sign-up form. An account for it already exists, so nothing new was created.\n\nSign in to your portal: ${siteUrl(STUDENT_LOGIN_PATH)}\nForgot your password? ${siteUrl(STUDENT_PASSWORD_FORGOT_PATH)}\n\nIf that was not you, you can ignore this email. Your account was not signed into and your password has not changed.\n\n— ${siteName}`,
  });
}
