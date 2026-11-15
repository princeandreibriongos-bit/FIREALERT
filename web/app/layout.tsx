import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BoardProvider } from "@/components/board-provider";
import { Shell } from "@/components/shell";
import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "FIREALERT · New Makati Central Fire Station",
  description: "Firefighter wearable monitoring board for the New Makati Central Fire Station prototype",
  icons: { icon: "/logo.jpg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <BoardProvider>
          <Shell>{children}</Shell>
        </BoardProvider>
      </body>
    </html>
  );
}
