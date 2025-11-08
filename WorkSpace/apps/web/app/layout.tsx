import type { Metadata } from "next";
import "./globals.css";
import { ToastContainer } from './components/Toast';
import { SSEClient } from './components/SSEClient';
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { LogoutButton } from "./components/LogoutButton";
import { WelcomeModal } from "./components/WelcomeModal";
// OnchainKit wallet connect (client component)
import WalletConnect from './components/WalletConnect';


export const metadata: Metadata = {
  title: "CoinRuler - Crypto Trading Dashboard",
  description: "Owner-only autonomous crypto trading platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let session = null as any;
  try {
    session = await auth();
  } catch (e) {
    // If NEXTAUTH_SECRET is missing or auth fails, render without a session
    session = null;
  }
  
  return (
    <html lang="en">
  <body className={`antialiased`}> 
        <SessionProvider session={session}>
          <ToastContainer />
          <header className="w-full border-b border-white/10 bg-black/40 backdrop-blur-md sticky top-0 z-40">
            <nav className="max-w-5xl mx-auto p-4 flex gap-4 text-sm items-center">
              <a href="/" className="font-semibold text-[#FFB800]">CoinRuler</a>
              <a href="/dashboard" className="text-contrast-med hover:text-contrast-high">Dashboard</a>
              <a href="/activity" className="text-contrast-high font-medium">Activity</a>
              <a href="/portfolio" className="text-contrast-med hover:text-contrast-high">Portfolio</a>
              <a href="/analysis" className="text-contrast-med hover:text-contrast-high">Analysis</a>
              <a href="/approvals" className="text-contrast-med hover:text-contrast-high">Approvals</a>
              <a href="/alerts" className="text-contrast-med hover:text-contrast-high">Alerts</a>
              <a href="/commands" className="text-contrast-med hover:text-contrast-high">Commands</a>
              <a href="/chat" className="text-contrast-med hover:text-contrast-high">Chat</a>
              <div className="ml-auto flex items-center gap-3">
                {session && <WalletConnect />}
                {session && <LogoutButton />}
              </div>
            </nav>
          </header>
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
          {session && (
            <WelcomeModal />
          )}
          {session && <SSEClient />}
        </SessionProvider>
      </body>
    </html>
  );
}
