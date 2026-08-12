import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "latent.",
  description: "A minimal, text-based role-playing game.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
