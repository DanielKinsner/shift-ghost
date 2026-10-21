import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://shift-ghost.vercel.app",
      lastModified: new Date("2026-10-20T00:00:00.000Z"),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
