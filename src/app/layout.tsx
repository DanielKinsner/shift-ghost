import type { Metadata, Viewport } from "next";
import { Archivo_Narrow, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/shell/Providers";
import { DemoDrawer } from "@/components/demo/DemoDrawer";

const display = Archivo_Narrow({ variable: "--font-archivo-narrow", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const sans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Shift Ghost", template: "%s · Shift Ghost" },
  description: "A voice-first shift handoff: a two-minute spoken closeout becomes tomorrow's prioritized opening brief, with evidence for every item.",
  applicationName: "Shift Ghost",
};

export const viewport: Viewport = {
  themeColor: "#0b1017",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} h-full`}>
      <body className="min-h-full">
        <a href="#main" className="sr-only z-[100] rounded bg-safety px-3 py-2 font-semibold text-night-950 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
          Skip to content
        </a>
        <Providers>
          {children}
          <DemoDrawer />
        </Providers>
      </body>
    </html>
  );
}
