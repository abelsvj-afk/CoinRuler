"use client";
import { ConnectWallet } from '@coinbase/onchainkit/wallet';

// Minimal OnchainKit integration. Assumes NEXT_PUBLIC_ONCHAINKIT_PROJECT_ID set.
// Renders a connect button; provider setup is handled at app layout level.

export default function WalletConnect() {
  return (
    <ConnectWallet
      className="px-3 py-1 rounded bg-[#FFB800] text-black text-sm font-medium hover:bg-[#ffc933] transition"
      disconnectedLabel="Connect Wallet"
    />
  );
}
