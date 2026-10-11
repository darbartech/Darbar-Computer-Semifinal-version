/**
 * Printed duration text for the certificate's duration sentence, e.g. "4 Months".
 * Mirror of the value derived at PDF time so the admin form can preview the same
 * fallback the server will use for a linked course.
 */
export function durationFromWeeks(weeks: number | null | undefined): string | null {
  if (!weeks || weeks <= 0) return null;
  if (weeks % 4 === 0) {
    const months = weeks / 4;
    return `${months} ${months === 1 ? "Month" : "Months"}`;
  }
  return `${weeks} ${weeks === 1 ? "Week" : "Weeks"}`;
}