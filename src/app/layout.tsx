import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ACCENT_BOOTSTRAP_SCRIPT } from "@/lib/appearance";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1917" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ),
  title: {
    default: "ProjectOS — In-house Jira Alternative",
    template: "%s · ProjectOS",
  },
  description:
    "ProjectOS is a self-hosted, multi-tenant project management portal — kanban boards, sprints, backlog planning, workflow automation, reports and email notifications. Your in-house alternative to Jira.",
  applicationName: "ProjectOS",
  keywords: [
    "project management",
    "jira alternative",
    "kanban",
    "scrum",
    "sprint planning",
    "self-hosted",
    "issue tracker",
  ],
  openGraph: {
    type: "website",
    siteName: "ProjectOS",
    title: "ProjectOS — In-house Jira Alternative",
    description:
      "Boards, backlogs, sprints, reports and email notifications — one self-hosted portal for your whole organization.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "ProjectOS logo" }],
  },
  appleWebApp: {
    capable: true,
    title: "ProjectOS",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOTSTRAP_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
