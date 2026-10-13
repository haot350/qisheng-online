import {staticAssetUrl} from '@/lib/static-assets';
import type { Metadata } from "next";
import "./globals.css";
import './upgrade.css';
import {SITE_ORIGIN} from './site-config';
import SiteTelemetry from './site-telemetry';

const shareImage = new URL(staticAssetUrl("/images/campus-overview.jpg"), SITE_ORIGIN).href;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  alternates: {canonical: '/'},
  title: "齐盛 · 数字校园",
  description: "走近齐盛校园，探索建筑与庭院，了解一座数字校园的制作故事。",
  openGraph: {
    url: SITE_ORIGIN,
    title: "齐盛 · 数字校园",
    description: "换个角度，回到校园。自由探索校园模型，发现不同光线下的熟悉风景。",
    type: "website",
    locale: "zh_CN",
    images: [{url: shareImage, width: 1280, height: 900, alt: '齐盛校园数字模型全景'}],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased"><SiteTelemetry/>{children}</body>
    </html>
  );
}
