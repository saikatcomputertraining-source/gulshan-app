import type { Metadata } from "next";
import "./globals.css";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from "../lib/seo";
import { SiteFooter } from "./site-shell";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_NAME, description: DEFAULT_DESCRIPTION, url: SITE_URL, locale: "en_BD" },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: DEFAULT_DESCRIPTION }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-BD"><body>{children}<SiteFooter /></body></html>;
}
