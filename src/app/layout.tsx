import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

const grotesk = localFont({
  src: "../assets/fonts/FamiljenGrotesk-Variable.woff2",
  variable: "--font-grotesk",
  weight: "400 700",
  display: "swap",
});

const mono = localFont({
  src: [
    { path: "../assets/fonts/DMMono-400.woff2", weight: "400" },
    { path: "../assets/fonts/DMMono-500.woff2", weight: "500" },
  ],
  variable: "--font-mono-dm",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "QBIT9", template: "%s · QBIT9" },
  description: "Join the bank queue from your phone, get alerted when it is nearly your turn, and book visits in advance.",
  applicationName: "QBIT9",
  appleWebApp: { capable: true, title: "QBIT9", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#F8F1EC",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
