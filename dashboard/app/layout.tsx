import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { Topbar } from "@/components/shell/topbar";
import { THEME_SCRIPT } from "@/components/shell/theme-script";

export const metadata: Metadata = {
  title: "Kallo admin",
  description: "Administration and analytics for Kallo",
};

// One typeface everywhere, variable so weights can sit at 450 and 550.
const dmSans = DM_Sans({ subsets: ["latin", "latin-ext"], axes: ["opsz"], variable: "--font-dm-sans" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
          <div className="flex min-h-dvh flex-col">
            <Topbar />
            <main className="min-w-0 flex-1 px-4 pb-10 lg:px-7">{children}</main>
          </div>
      </body>
    </html>
  );
}
