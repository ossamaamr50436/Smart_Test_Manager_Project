/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  // يسمح التطبيق برفع شعار حتى 5MB وقالب شهادة حتى 10MB،
  // لكن حد server action الافتراضي 1MB كان يكسر أي ملف أكبر من ذلك في الواجهة
  serverActions: {
    bodySizeLimit: "12mb",
  },
  poweredByHeader: false,
  reactStrictMode: true,
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-avatar",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-popover",
      "date-fns",
      "recharts",
    ],
  },
  // Support Arabic / RTL fonts and images from UploadThing
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.ufs.sh",
        pathname: "/f/*",
      },
      {
        protocol: "https",
        hostname: "utfs.io",
        pathname: "/f/*",
      },
      {
        protocol: "https",
        hostname: "fonts.googleapis.com",
      },
    ],
  },
  // Server actions are enabled by default in Next.js 14
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
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), autoplay=(), display-capture=(), web-share=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "off",
          },
          {
            key: "X-Download-Options",
            value: "noopen",
          },
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
