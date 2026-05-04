import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
