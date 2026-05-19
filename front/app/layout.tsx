import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces, DM_Mono } from "next/font/google";
import "./globals.css";
import { AppNavbar } from "@/components/layout/app-navbar";
import { ReactQueryProvider } from "@/components/layout/providers/react-query-provider";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { InsdcModalProvider } from "@/components/layout/providers/insdc-modal-provider"
import { Toaster } from "sonner";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["300", "400", "500"],
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Annotrieve - Eukaryotic Genome Annotations",
  description: "Explore annotated genomes from NCBI and Ensembl",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full overflow-hidden">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const stored = localStorage.getItem('ui-store');
                  if (stored) {
                    const parsed = JSON.parse(stored);
                    const theme = parsed?.state?.theme || 'dark';
                    document.documentElement.classList.remove('light', 'dark');
                    document.documentElement.classList.add(theme);
                  } else {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
        <meta name="google-site-verification" content="WlV38EDOLs3XwYrtqyIJTYe-TAwaimfc1emCbx7RG_A" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${dmMono.variable} antialiased h-full overflow-hidden`}
      >
        <ThemeProvider>
          <ReactQueryProvider>
              <InsdcModalProvider />
              <div className="min-h-screen flex flex-col h-full">
                <AppNavbar />
                <main id="main-content" className="flex-1 overflow-y-auto">
                  {children}
                </main>
              </div>
          </ReactQueryProvider>
        </ThemeProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
