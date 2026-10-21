import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shift Ghost",
    short_name: "Shift Ghost",
    description: "A voice-first shift handoff that turns spoken closeouts into prioritized opening briefs.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1017",
    theme_color: "#0b1017",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
