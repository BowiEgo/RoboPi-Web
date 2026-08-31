import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoboPi Web",
  description: "基于 pi-web 与 Cordis 插件系统的新 Agent 平台",
};

// 与 pi-web 一致：首帧前应用主题，避免闪白
const themeScript = `(function(){try{var t=localStorage.getItem("pi-theme");var dark=t==="dark"||((t==null||t===""||t==="auto")&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(dark)document.documentElement.classList.add("dark")}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
