import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Tischrechnung – Restaurantrechnung fair aufteilen",
  description:
    "Eine Rechnung, viele Leute: Jeder schreibt, was er hatte, die KI liest den Kassenzettel und rechnet aus, wer wie viel zahlt.",
  applicationName: "Tischrechnung",
  appleWebApp: { capable: true, title: "Tischrechnung", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf9f6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
