import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Job Info Finder",
  description: "AI-powered job hunting intelligence platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <AppShell>{children}</AppShell>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "hsl(222, 47%, 12%)",
              color: "rgba(255,255,255,0.9)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              fontSize: "14px",
            },
            success: {
              iconTheme: {
                primary: "#a78bfa",
                secondary: "hsl(222, 47%, 12%)",
              },
            },
          }}
        />
      </body>
    </html>
  );
}
