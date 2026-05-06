import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent the page from being framed by another origin (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Tell the browser not to MIME-sniff response bodies.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Strip the Referer header on cross-origin navigations.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down powerful browser APIs we don't use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // CSP: restrict where scripts/styles/connect/etc can come from. We leave
  // 'unsafe-inline' on style-src because Tailwind/Next emit inline styles;
  // and 'unsafe-inline'/'unsafe-eval' on script-src in dev only. The
  // connect-src list covers Supabase REST + Realtime + Storage.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      // Next.js still ships some inline bootstrap; allow it via 'unsafe-inline'.
      // No 'unsafe-eval'.
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.supabase.in wss://*.supabase.in",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      // Supabase email-link errors land back on the app with
      // ?error_code=otp_expired (PKCE flow). Bounce to /auth with a clean
      // recovered marker so the page can show a friendly message instead of
      // letting Supabase's default error UI through.
      {
        source: "/:path*",
        has: [{ type: "query", key: "error_code", value: "otp_expired" }],
        destination: "/auth?recovered=1",
        permanent: false,
      },
      {
        source: "/:path*",
        has: [{ type: "query", key: "error", value: "access_denied" }],
        destination: "/auth?recovered=1",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
