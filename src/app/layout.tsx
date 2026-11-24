import type { Metadata, Viewport } from "next";
import { Barlow, Bona_Nova, Inter, Livvic, Saira } from "next/font/google";
import "./globals.css";

// Noto Sans Arabic is served from /public/fonts (see globals.css), not next/font/google:
// Google Fonts sends Vercel's build machines a response for it that next/font cannot read, which failed the build.

const bonaNova = Bona_Nova({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-bona-nova",
  display: "swap",
});

const saira = Saira({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-saira",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const livvic = Livvic({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-livvic",
  display: "swap",
});

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Designscape",
  description: "Interactive complex tours",
  icons: { icon: "/branding/designscape-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bonaNova.variable} ${saira.variable} ${inter.variable} ${livvic.variable} ${barlow.variable}`}>
      <head>
        {/* same as next/font did: start downloading the Arabic and Latin files right away */}
        <link rel="preload" href="/fonts/noto-sans-arabic-arabic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/noto-sans-arabic-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
