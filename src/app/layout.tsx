import type { Metadata } from "next";
import "./globals.css";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  ? (process.env.NEXT_PUBLIC_APP_URL.startsWith('http') ? process.env.NEXT_PUBLIC_APP_URL : `https://${process.env.NEXT_PUBLIC_APP_URL}`)
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://wedding-project-web.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "Francisco & Alicia — We are getting married",
  description: "Join us on September 18, 2026 in Freiburg to celebrate our special day!",
  openGraph: {
    title: "Francisco & Alicia — We are getting married",
    description: "Join us on September 18, 2026 in Freiburg to celebrate our special day!",
    type: "website",
    images: [
      {
        url: "/og-image.jpg",
        width: 1024,
        height: 863,
        alt: "Francisco & Alicia — We are getting married",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Francisco & Alicia — We are getting married",
    description: "Join us on September 18, 2026 in Freiburg to celebrate our special day!",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
