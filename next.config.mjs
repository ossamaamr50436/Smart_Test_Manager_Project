/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Support Arabic / RTL fonts and downloaded images from Google Drive
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "drive.google.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "fonts.googleapis.com",
      },
    ],
  },
  // Server actions are enabled by default in Next.js 14
  experimental: {
    serverActions: true,
  },
  async headers() {
    return [
      {
        // Basic security headers
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
