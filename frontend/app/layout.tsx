import type { Metadata } from "next";
import { Inter, Manrope, Space_Grotesk } from "next/font/google";

import "./globals.css";
import QueryProvider from "@/components/QueryProvider";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "KyrgPulse — аренда квартир в Бишкеке",
    template: "%s · KyrgPulse",
  },
  description:
    "Поиск долгосрочной аренды квартир в Бишкеке: актуальные объявления lalafo.kg, фильтры по цене и зонам города, карта, аналитика цен.",
  openGraph: {
    siteName: "KyrgPulse",
    locale: "ru_RU",
    type: "website",
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KyrgPulse",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#7c3aed",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${manrope.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        <meta name="theme-color" content="#7c3aed" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
