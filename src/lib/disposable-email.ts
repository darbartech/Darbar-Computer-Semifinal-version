/**
 * Disposable (throwaway) email domains.
 *
 * Public forms at this institute feed the admissions pipeline: an enquiry whose
 * contact address dies in ten minutes cannot be followed up, and a mailbox that
 * self-destructs is how a single person opens unlimited student accounts. The list
 * below is the set of providers whose entire product is a temporary inbox, so the
 * public write paths can reject them up front (docs 01 §S9).
 *
 * Deliberately narrow:
 *  - exact domain match only, so `gmail.com` and a company's own domain are never
 *    caught by a substring;
 *  - it is NOT applied to sign-in or password reset. Someone who registered with
 *    one of these addresses before must still be able to reach their account — a
 *    block there converts a spam filter into a lock-out.
 *
 * Client-safe: no server imports, because the browser-side form schemas use it too.
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "1secmail.com",
  "1secmail.net",
  "1secmail.org",
  "20minutemail.com",
  "dispostable.com",
  "emailondeck.com",
  "fakeemail.com",
  "fakeinbox.com",
  "generator.email",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.de",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "grr.la",
  "harakirimail.com",
  "inktoy.com",
  "instantemailaddress.com",
  "jetable.org",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mailsac.com",
  "mail.tm",
  "moakt.com",
  "mohmal.com",
  "mohmal.me",
  "sharklasers.com",
  "spam4.me",
  "spamgourmet.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempinbox.com",
  "tempmail.com",
  "tempmailo.com",
  "tempr.email",
  "throwaway.email",
  "throwawaymail.com",
  "trash-mail.com",
  "trashmail.com",
  "trashmail.de",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

/** The domain part of an address, lower-cased; `null` when there isn't one. */
export function emailDomain(value: string): string | null {
  const compact = value.trim().toLowerCase();
  const at = compact.lastIndexOf("@");
  if (at <= 0 || at === compact.length - 1) return null;
  // A trailing dot is how a fully-qualified domain is written; it is not part of it.
  return compact.slice(at + 1).replace(/\.$/, "");
}

export function isDisposableEmailDomain(domain: string | null): boolean {
  return domain !== null && DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

export function isDisposableEmail(value: string): boolean {
  return isDisposableEmailDomain(emailDomain(value));
}

/**
 * Worded as a request, not an accusation: a person who mistyped their own domain
 * has to be able to work out why the form refused them.
 */
export const DISPOSABLE_EMAIL_MESSAGE =
  "Please give us an email address you will still have next month — temporary inboxes are not accepted.";
