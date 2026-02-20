import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { validateEnv } from "@/lib/config/env";
import { AuthenticatedAssistant } from "@/components/assistant";
import "./globals.css";

// Validate environment variables at startup
validateEnv();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Eventus AML Hub",
  description: "AML compliance hub for UK law firms",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
        <AuthenticatedAssistant />
      </body>
    </html>
  );
}
