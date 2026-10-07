import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { LearningTimeTracker } from "./components/learning-time-tracker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(forwardedHost) ? forwardedHost : "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol === "http" || host.startsWith("localhost") ? "http" : "https";
  const imageUrl = `${protocol}://${host}/og.png`;
  const title = "AI-IELTS · 雅思机考训练";
  const description = "账号化的 IELTS 机考训练系统，让学习记录、个人设置和 AI 反馈跟随你的账号。";
  return {
    title: { default: title, template: "%s · AI-IELTS" },
    description,
    openGraph: { title, description, type: "website", images: [{ url: imageUrl, width: 1672, height: 941, alt: "AI-IELTS 账号化雅思训练" }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LearningTimeTracker />
        {children}
      </body>
    </html>
  );
}
