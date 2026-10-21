import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: { absolute: "Shift Ghost — Voice-to-Shift Handoff Demo" },
  alternates: { canonical: "https://shift-ghost.vercel.app" },
  authors: [{ name: "Daniel Kinsner", url: "https://danielkinsner.com" }],
  creator: "Daniel Kinsner",
  keywords: ["shift handoff", "restaurant operations", "voice workflow", "operational intelligence", "interactive product demo"],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://shift-ghost.vercel.app",
    siteName: "Shift Ghost",
    title: "Shift Ghost — Voice-to-Shift Handoff",
    description: "Two minutes of talk at close becomes a brief the morning crew can act on.",
    images: [{ url: "https://shift-ghost.vercel.app/api/og", width: 1200, height: 630, alt: "Shift Ghost voice-to-shift handoff product demo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shift Ghost — Voice-to-Shift Handoff",
    description: "Two minutes of talk at close becomes a brief the morning crew can act on.",
    images: ["https://shift-ghost.vercel.app/api/og"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

const productSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Shift Ghost",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://shift-ghost.vercel.app",
  description: "A voice-first shift handoff that turns a spoken closeout into a prioritized, evidence-linked opening brief.",
  creator: {
    "@type": "Person",
    name: "Daniel Kinsner",
    url: "https://danielkinsner.com",
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema).replace(/</g, "\\u003c") }} />
      <Landing />
    </>
  );
}
