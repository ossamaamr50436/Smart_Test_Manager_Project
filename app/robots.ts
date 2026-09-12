import type { MetadataRoute } from "next";

const SITE_URL = "https://smart-test-manager-project.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/audit-log"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}