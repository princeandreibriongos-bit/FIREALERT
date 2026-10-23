import type { Metadata } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import Atmosphere from "./components/Atmosphere";
import SiteHeader from "./components/SiteHeader";
import "./globals.css";

const instrument = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FireAlert",
  description: "Firefighter wearable telemetry dashboard",
};

const themeBootScript = `
(() => {
  try {
    const saved = localStorage.getItem('firealert-theme');
    const theme = saved === 'light' || saved === 'dark' ? saved : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Atmosphere />
        <div className="shell">
          <SiteHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
