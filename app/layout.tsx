import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beat the S&P 500 in 10 Trades",
  description:
    "A simple stock-picking challenge landing page built for Milestone 1.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
