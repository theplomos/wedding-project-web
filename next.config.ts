import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: allow loading _next resources when the app is opened via 127.0.0.1
  // (needed because Spotify OAuth rejects `localhost` redirect URIs, so the
  // Spotify host-link flow must be driven from http://127.0.0.1:3000).
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://res.cloudinary.com https://i.scdn.co https://*.scdn.co https://*.spotifycdn.com",
      "media-src 'self' blob: https://res.cloudinary.com",
      "connect-src 'self' https://api.cloudinary.com https://api.spotify.com https://*.spotify.com",
      "frame-src 'self' https://open.spotify.com https://*.spotify.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspDirectives,
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
