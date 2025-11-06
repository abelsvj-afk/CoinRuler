"use client";
import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 transition-all"
    >
      Logout
    </button>
  );
}
