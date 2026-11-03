import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import { BoardProvider } from "@/components/board-provider";
import { Shell } from "@/components/shell";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex",
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
