"use server";
import "server-only";
import { z } from "zod";
import { after } from "next/server";
import { contactSchema } from "@/lib/validators/contact";
import { inquirySchema } from "@/lib/validators/lead";
import { reviewSchema } from "@/lib/validators/testimonials";
import { createContactMessage } from "@/server/dal/contact";
import { createLeadFromInquiry, findPublishedCourseBySlug } from "@/server/dal/leads";
import { createPublicReview } from "@/server/dal/testimonials";
import { getSiteSettings } from "@/server/dal/settings";
import { LEAD_TAGS, MESSAGE_TAGS, invalidate } from "@/server/revalidate";
import {
  notifyNewContactMessage,
  notifyNewLead,
  sendInquiryAutoReply,
} from "@/server/services/email";
import {
  allowByIp,
  getClientIp,
  getClientIpHash,
  getReferrerUrl,
} from "@/server/services/rate-limit";
import { verifyTurnstile } from "@/server/services/turnstile";

export type PublicFormResult<T = unknown> =
  | { ok: true; data: T; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
/**
 * Wording for a refused public form (reaudit N2).
 *
 * The counters below are keyed by address, and one address in Kathmandu is one
 * building: the lab, the front desk and every phone on the Wi-Fi share it. A flat
 * "too many requests" reads like the student did something wrong, so the message
 * names the actual escape route — the front desk, whose IP goes in
 * `RATE_LIMIT_TRUSTED_IPS` and whose submissions skip the counter entirely.
 */
const RATE_LIMITED =
  "Too many submissions from this connection. If you are at the campus, the front desk can send it for you — otherwise, please try again in an hour.";
const VERIFICATION_FAILED = "Please complete the anti-spam check and try again.";

/**
 * docs/04 §2.1 asked for five per hour; that number assumed one visitor per IP
 * (reaudit N2). Turnstile and the honeypot are what stop a bot, so the IP
 * counters only have to stop a script that ignores them, and a budget that a
 * single admission-day queue can exhaust is a budget that locks the institute out
 * of its own website. The same is true of `allowByIp`: a campus address in
 * `RATE_LIMIT_TRUSTED_IPS` does not spend a slot at all.
 */
const FORM_RATE_LIMIT = { max: 40, windowMinutes: 60 } as const;
const REVIEW_RATE_LIMIT = { max: 10, windowMinutes: 60 } as const;

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors;
}

/**
 * Public admission inquiry (docs/04 §2.1, docs/06 §8).
 *
 * Order of operations matters: validate → honeypot → rate limit → Turnstile →
 * insert → notify (docs 01 §S9). A bot that fills the honeypot gets a fake success
 * so it cannot learn that the endpoint exists, and the cheap DB check runs before
 * the outbound call to Cloudflare, so a flood costs us nothing.
 */
export async function submitInquiry(
  input: unknown
): Promise<PublicFormResult<null>> {
  try {
    const parsed = inquirySchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Please check the form and try again",
        fieldErrors: fieldErrors(parsed.error),
      };
    }
    const data = parsed.data;

    // Honeypot: pretend success, store nothing.
    if (data.website) return { ok: true, data: null, message: "Thank you." };

    const ipHash = await getClientIpHash();

    if (!(await allowByIp(`inquiry:${ipHash}`, FORM_RATE_LIMIT))) {
      return { ok: false, error: RATE_LIMITED };
    }

    const turnstile = await verifyTurnstile(data.turnstileToken, await getClientIp());
    if (!turnstile.success) {
      console.error("[submitInquiry] turnstile rejected", turnstile.errors.join(","));
      return { ok: false, error: VERIFICATION_FAILED };
    }

    const course = data.courseSlug
      ? await findPublishedCourseBySlug(data.courseSlug)
      : null;

    const { lead, isDuplicate } = await createLeadFromInquiry({
      fullName: data.fullName,
      phone: data.phone,
      email: data.email || null,
      courseId: course?.id ?? null,
      courseTitle: course?.title ?? null,
      preferredBatch: data.preferredBatch,
      message: data.message || null,
      utmSource: data.utmSource || null,
      utmMedium: data.utmMedium || null,
      utmCampaign: data.utmCampaign || null,
      referrerUrl: await getReferrerUrl(),
      consentAt: new Date(),
      ipHash,
    });

    // Notification happens after the response is sent: a slow or failing mail
    // provider must never fail the submission (docs/04 §2.3).
    after(async () => {
      const notified = await notifyNewLead({
        id: lead.id,
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email,
        courseTitle: lead.courseTitle,
        preferredBatch: lead.preferredBatch,
        isDuplicate,
      });
      if (!notified.sent) {
        console.error("[notifyNewLead] not sent", notified.reason);
      }
      if (lead.email) {
        const siteName = (await getSiteSettings()).general.name;
        const auto = await sendInquiryAutoReply(lead.email, lead.fullName, siteName);
        if (!auto.sent) console.error("[autoReply] not sent", auto.reason);
      }
    });

    invalidate(...LEAD_TAGS);

    return {
      ok: true,
      data: null,
      message: "Thanks! Our counselor will contact you within 1 business day.",
    };
  } catch (error) {
    // Log the message only — the payload contains phone and email (docs/08 §1).
    console.error(
      "[submitInquiry]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/** Public contact form (docs/04 §2.1). Same guard chain as `submitInquiry`. */
export async function submitContact(
  input: unknown
): Promise<PublicFormResult<null>> {
  try {
    const parsed = contactSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Please check the form and try again",
        fieldErrors: fieldErrors(parsed.error),
      };
    }
    const data = parsed.data;

    if (data.website) return { ok: true, data: null, message: "Thank you." };

    const ipHash = await getClientIpHash();

    if (!(await allowByIp(`contact:${ipHash}`, FORM_RATE_LIMIT))) {
      return { ok: false, error: RATE_LIMITED };
    }

    const turnstile = await verifyTurnstile(data.turnstileToken, await getClientIp());
    if (!turnstile.success) {
      console.error("[submitContact] turnstile rejected", turnstile.errors.join(","));
      return { ok: false, error: VERIFICATION_FAILED };
    }

    const row = await createContactMessage({
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      subject: data.subject,
      organization: data.organization || null,
      message: data.message,
      ipHash,
    });

    after(async () => {
      const notified = await notifyNewContactMessage({
        id: row.id,
        name: row.name,
        email: row.email,
        subject: row.subject,
      });
      if (!notified.sent) {
        console.error("[notifyNewContactMessage] not sent", notified.reason);
      }
    });

    invalidate(...MESSAGE_TAGS);

    return {
      ok: true,
      data: null,
      message: "Thanks for reaching out — we'll reply within 1 business day.",
    };
  } catch (error) {
    console.error(
      "[submitContact]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/**
 * Public "leave a review" form. Same guard chain as the other public forms.
 *
 * Submissions are stored as unpublished drafts — a staff member reviews and
 * publishes them in the admin panel, so nothing appears on the site without
 * approval. Because drafts are never read by the public cache, no invalidation
 * is needed here.
 */
export async function submitReview(
  input: unknown
): Promise<PublicFormResult<null>> {
  try {
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Please check the form and try again",
        fieldErrors: fieldErrors(parsed.error),
      };
    }
    const data = parsed.data;

    // Honeypot: pretend success, store nothing.
    if (data.website) return { ok: true, data: null, message: "Thank you." };

    const ipHash = await getClientIpHash();

    if (!(await allowByIp(`review:${ipHash}`, REVIEW_RATE_LIMIT))) {
      return { ok: false, error: RATE_LIMITED };
    }

    const turnstile = await verifyTurnstile(data.turnstileToken, await getClientIp());
    if (!turnstile.success) {
      console.error("[submitReview] turnstile rejected", turnstile.errors.join(","));
      return { ok: false, error: VERIFICATION_FAILED };
    }

    await createPublicReview({
      name: data.name,
      courseLabel: data.courseLabel || null,
      quote: data.quote,
      rating: data.rating,
    });

    return {
      ok: true,
      data: null,
      message: "Thanks for sharing your experience! Our team will review it before it goes live.",
    };
  } catch (error) {
    console.error(
      "[submitReview]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}
