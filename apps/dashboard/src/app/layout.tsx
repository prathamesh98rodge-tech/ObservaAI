import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Providers } from "./providers";
import { WebSocketProvider } from "@/components/WebSocketProvider";

export const metadata: Metadata = {
  title: "ObservaAI — AI Usage Monitor",
  description: "Unified observability and control platform for AI coding assistants",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex h-screen overflow-hidden bg-[#0a0a0f]">
        <Providers>
          <WebSocketProvider />
          <Sidebar />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
