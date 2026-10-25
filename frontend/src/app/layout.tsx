import type { Metadata } from "next";
import { Anton, Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { MotionProvider } from "@/components/providers/MotionProvider";

const archivo = Archivo({ subsets: ['latin'], variable: '--font-sans' });
const anton = Anton({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-mono',
});

const description =
  "Diabetes risk prediction with explainable machine learning — every score shows its reasons.";

export const metadata: Metadata = {
  // Canonical base for sitemap/OG resolution; NEXT_PUBLIC_SITE_URL is the
  // same variable auth redirects use. Unset locally, which Next tolerates.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined,
  title: "MediSight",
  description,
  openGraph: {
    type: "website",
    siteName: "MediSight",
    title: "MediSight",
    description,
    images: ["/logo.png"],
  },
  twitter: {
    card: "summary",
    title: "MediSight",
    description,
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", archivo.variable, anton.variable, jetbrainsMono.variable)}>
      <body className="antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
