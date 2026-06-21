import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import QueryProvider from "@/components/QueryProvider";
import "../globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "KyrgPulse",
  description: "Аренда квартир в Бишкеке",
  // Telegram Mini App must not be indexed
  robots: { index: false, follow: false },
};

export default function TmaLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <head>
        {/* Telegram WebApp SDK — must load synchronously before body */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body
        className="min-h-screen text-neutral-200"
        style={{
          background: "var(--tg-theme-bg-color, #0f172a)",
          color: "var(--tg-theme-text-color, #e2e8f0)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
