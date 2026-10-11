import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { themeInitScript } from "@/lib/theme-script";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "SecLearn",
  description: "Beginner cybersecurity learning with AI chat, lessons, and review quizzes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${dmSans.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
