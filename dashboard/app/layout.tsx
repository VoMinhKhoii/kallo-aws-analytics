import type { Metadata } from "next";
import "./globals.css";
import { RangeProvider } from "@/components/range-context";
import { AppSidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export const metadata: Metadata = {
  title: "Kallo analytics",
  description: "Analytics plane for the Kallo AI nutrition pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <RangeProvider>
          <div className="flex min-h-dvh">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <main className="min-w-0 flex-1 px-5 pb-10 lg:px-8">{children}</main>
            </div>
          </div>
        </RangeProvider>
      </body>
    </html>
  );
}
