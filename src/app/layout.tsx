import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://whats-app-integration-six.vercel.app"),
  title: {
    default: "Your AI order assistant on WhatsApp",
    template: "%s · WhatsApp Order Bot",
  },
  description:
    "Automate your home kitchen orders on WhatsApp. Never miss a customer. Open 24/7.",
  openGraph: {
    title: "Your AI order assistant on WhatsApp",
    description:
      "Automate your home kitchen orders on WhatsApp. Never miss a customer. Open 24/7.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
