import createMDX from "@next/mdx";

/*
 * Security headers (docs/08 §1 "Platform").
 *
 * There is no Content-Security-Policy here, even though half the site now ships
 * a nonce-free one (re-audit #1). The policy has exactly one owner, `src/proxy.ts`,
 * built in `src/lib/csp.ts`: a browser that receives two `Content-Security-Policy`
 * headers enforces the intersection of both, so a second copy of the public-page
 * policy here would silently break the nonce'd surfaces. Header order is also
 * not how a nonce could travel anyway — only the proxy sees the request.
 *
 * What stays below is request-independent, so it also covers the paths the proxy
 * matcher skips (`/api/*`, `/uploads`, static assets): sniffing, referrer,
 * framing, camera/microphone permissions and HSTS in production.
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
      // The stock hosts the seed data used to point at (Pexels, Unsplash,
      // website-files) are gone: those pictures live in `public/images/seed`,
      // and every pattern left here is a host the optimizer may still be asked
      // to fetch.
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
