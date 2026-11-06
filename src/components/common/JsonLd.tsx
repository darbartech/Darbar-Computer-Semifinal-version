import { serializeJsonLd } from "@/lib/seo";

/**
 * Structured data for one page (docs/08 §"Input & output").
 *
 * This is the only place an inline `<script>` is written, which is what makes the
 * `dangerouslySetInnerHTML` review rule checkable: the payload is
 * `serializeJsonLd` of a typed object, never markup from the database.
 *
 * It needs no Content-Security-Policy nonce, on either policy (src/lib/csp.ts):
 * `type="application/ld+json"` is a data block the browser never executes, so
 * `script-src` is never consulted for it — checked in Chrome against a nonce-only
 * policy, where the block renders clean while an un-nonce'd classic script on the
 * same page is blocked. That is also what lets the pages using it stay
 * prerendered: reading the nonce would mean reading request headers, and
 * `headers()` opts a route out of static rendering entirely.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
