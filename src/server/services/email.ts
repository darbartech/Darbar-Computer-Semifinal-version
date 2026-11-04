import "server-only";

export type EmailMessage = {
  to: string;
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
        to: [message.to],
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

function adminUrl(path: string): string {
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

  const link = adminUrl(`/techdarbar/leads/${lead.id}`);
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

  const link = adminUrl(`/techdarbar/messages/${message.id}`);
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
