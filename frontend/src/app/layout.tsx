import type { Metadata } from "next";
import { Anton, Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

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

export const metadata: Metadata = {
  title: "MediSight",
  description: "Diabetes risk prediction with explainable machine learning — every score shows its reasons.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", archivo.variable, anton.variable, jetbrainsMono.variable)}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
