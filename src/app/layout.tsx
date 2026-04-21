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
  title: "NoConclusion — 議題の賛否を共有",
  description:
    "Discord 通話向けに、議題ごとの賛否（0〜100）をリアルタイムで共有するだけの Web アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-zinc-50 text-zinc-900 antialiased [background-image:radial-gradient(ellipse_120%_80%_at_50%_-30%,rgb(224_242_254/0.9),transparent)] dark:bg-zinc-950 dark:text-zinc-100 dark:[background-image:radial-gradient(ellipse_100%_60%_at_50%_-20%,rgb(30_58_138/0.35),transparent)]">
        {children}
      </body>
    </html>
  );
}
