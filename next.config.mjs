import createMDX from "@next/mdx";

/*
 * Security headers (docs/08 §1 "Platform").
 *
 * CSP is deliberately in REPORT-ONLY mode: the app ships inline JSON-LD and
 * Next.js injects inline bootstrap scripts, so enforcing on day one would break
 * the site. Collect reports, then flip `Content-Security-Policy-Report-Only`
 * to `Content-Security-Policy` and drop the `'unsafe-*'` entries that turn out
 * to be unnecessary.
 *
 * Report-only violations are collected by `POST /api/csp-report` (`report-uri`
 * below). Read those logs before flipping `Content-Security-Policy-Report-Only` to
 * `Content-Security-Policy` — note that `img-src` still only whitelists the four
 * hosts the media library knows about, so the "add media by URL" flow is the part
 * most likely to break on enforcement.
 */
const isProduction = process.env.NODE_ENV === "production";

/*
 * Local disk storage (src/server/services/storage.ts) is the provider whenever
 * MEDIA_STORAGE_PROVIDER=local, and the implicit default in development. Its
 * assets are served by this app from `<site-url>/uploads/...`, i.e. an absolute
 * URL on our own hostname. `next/image` cannot handle that:
 *
 *   1. the default loader rejects absolute sources whose hostname is missing
 *      from `images.remotePatterns`, and
 *   2. even with a pattern, `/_next/image` refuses to fetch because the host
 *      resolves to a private/loopback IP (SSRF guard, next/dist/server/
 *      image-optimizer.js `fetchExternalImage`).
 *
 * So when local disk is the provider we bypass the Image Optimization API
 * entirely: `unoptimized` renders a plain <img> with the original URL, which is
 * also one less hop back into ourselves for admin thumbnails. Cloudinary
 * production traffic keeps AVIF/WebP through `formats` and `remotePatterns`.
 */
const localStorageEnabled =
  process.env.MEDIA_STORAGE_PROVIDER === "local" ||
  (!process.env.MEDIA_STORAGE_PROVIDER && !isProduction);

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // Nothing on this site is meant to be embedded by another origin. `frame-src`
  // below is about what WE embed (Google Maps, Cloudflare Turnstile).
  "frame-ancestors 'none'",
  "img-src 'self' blob: data: https://res.cloudinary.com https://images.pexels.com https://images.unsplash.com https://cdn.prod.website-files.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // 'unsafe-eval' is only needed by the React refresh runtime in development.
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://challenges.cloudflare.com`,
  "connect-src 'self' https://challenges.cloudflare.com https://api.cloudinary.com",
  "frame-src 'self' https://www.google.com https://maps.google.com https://challenges.cloudflare.com",
  "media-src 'self' https://res.cloudinary.com",
  "manifest-src 'self'",
  // Same-origin collector (`src/app/api/csp-report/route.ts`). Without it a
  // report-only policy reports to nobody and the "collect, then enforce" plan
  // below has nothing to collect.
  "report-uri /api/csp-report",
  // No `upgrade-insecure-requests`: browsers ignore it in a report-only policy,
  // and HSTS below covers the upgrade in production.
]
  .join("; ");

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing on this site is meant to be framed by another origin, so deny it
  // everywhere — not just under /techdarbar. `frame-ancestors` in the CSP already
  // says this, but X-Frame-Options is the belt to that suspenders for clients
  // that ignore CSP.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    // Geolocation is only used by the campus map; camera/microphone/payment are
    // never needed. Turnstile runs in an iframe, which is frame-src, not a
    // permission.
    value: "camera=(), microphone=(), payment=(), usb=(), magnetometer=(), geolocation=(self)",
  },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

// The admin surface gets two more guards on top of the base set. Both keys are
// absent from `baseSecurityHeaders` on purpose: Next.js merges the matching header
// sets rather than replacing them, so repeating a key would send it twice.
//  - X-Robots-Tag: a redirect or an error page from this prefix may render without
//    the layout's `noindex` metadata, and robots.txt only stops the crawl, not the
//    indexing of an inbound link.
//  - Cross-Origin-Resource-Policy: a dashboard response must not be readable as a
//    subresource embedded in someone else's page.
const adminSecurityHeaders = [
  ...baseSecurityHeaders,
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  // `X-Powered-By: Next.js` tells a scanner which stack to attack and buys the
  // site nothing.
  poweredByHeader: false,
  // Turbopack blocks HMR/dev-asset requests whose Origin host is not the host
  // the server was started with. We start on `localhost` and often open the
  // site at the IPv4 literal, so allow that hostname (no scheme or port).
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      // `source` order matters: the more specific admin rule is listed after
      // the catch-all, and Next.js merges both sets, so /techdarbar gets everything.
      { source: "/techdarbar/:path*", headers: adminSecurityHeaders },
      ...(isProduction
        ? [
            {
              source: "/:path*",
              headers: [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ],
            },
          ]
        : []),
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    unoptimized: localStorageEnabled,
    remotePatterns: [
      // Media library storage host (docs/04 §1.5). Covers both the
      // `res.cloudinary.com/<cloud>/image/upload/...` upload form and
      // delivery/transformation URLs under `image/fetch`, `image/upload` and
      // `image/transform`.
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "cdn.prod.website-files.com",
      },
    ],
  },
  experimental: {
    // Opt into the security upgrade advisory flow for future patch releases.
    agentUpgrade: "security",
    mdxRs: true,
    // Profile pictures travel through a Server Action (`uploadOwnAvatarAction`,
    // `uploadStudentPhotoAction`), and action bodies are capped at 1 MB by
    // default — a 1-5 MB image was rejected before the action's own size check
    // could run. 6 MB covers MEDIA_MAX_BYTES (5 MB) plus multipart overhead.
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {},
});

export default withMDX(nextConfig);
