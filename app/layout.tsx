import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAFE-UT Crisis Intervention Training Platform (MVP)",
  description: "AI-assisted crisis intervention training and simulation platform for counselors."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
