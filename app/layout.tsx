import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Benchmark Battle",
  description:
    "A five-minute benchmark battle where players build a portfolio and try to beat the S&P 500.",
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
