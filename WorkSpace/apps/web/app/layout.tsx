import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastContainer } from './components/Toast';
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { LogoutButton } from "./components/LogoutButton";
import { WelcomeModal } from "./components/WelcomeModal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CoinRuler - Crypto Trading Dashboard",
  description: "Owner-only autonomous crypto trading platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}> 
        <SessionProvider session={session}>
          <ToastContainer />
          {session && (
            <header className="w-full border-b border-white/10 bg-white/5 backdrop-blur-md">
              <nav className="max-w-5xl mx-auto p-4 flex gap-4 text-sm items-center">
                <a href="/" className="font-semibold text-[#FFB800]">CoinRuler</a>
                <a href="/dashboard" className="text-white/80 hover:text-white">Dashboard</a>
                <a href="/portfolio" className="text-white/80 hover:text-white">Portfolio</a>
                <a href="/approvals" className="text-white/80 hover:text-white">Approvals</a>
                <a href="/alerts" className="text-white/80 hover:text-white">Alerts</a>
                <a href="/rotation" className="text-white/80 hover:text-white">Rotation</a>
                <a href="/commands" className="text-white/80 hover:text-white">Commands</a>
                <a href="/chat" className="text-white/80 hover:text-white">Chat</a>
                <div className="ml-auto">
                  <LogoutButton />
                </div>
              </nav>
            </header>
          )}
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
          {session && (
            <WelcomeModal />
          )}
        </SessionProvider>
      </body>
    </html>
  );
}
