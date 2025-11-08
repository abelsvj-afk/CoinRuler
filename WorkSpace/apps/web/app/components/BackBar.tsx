"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";
import Link from "next/link";

/**
 * BackBar: Reusable navigation component for subpages
 * Provides back button (router history) + home link
 */
export function BackBar({ title }: { title?: string }) {
  const router = useRouter();

  return (
    <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg glass hover:bg-white/10 transition-colors group"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4 text-[#FFB800] group-hover:scale-110 transition-transform" />
          <span className="text-sm font-medium">Back</span>
        </button>
        
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg glass hover:bg-white/10 transition-colors group"
          aria-label="Go to home"
        >
          <Home className="w-4 h-4 text-[#FFB800] group-hover:scale-110 transition-transform" />
          <span className="text-sm font-medium">Home</span>
        </Link>
      </div>
      
      {title && (
        <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-[#FFB800] bg-clip-text text-transparent">
          {title}
        </h1>
      )}
    </div>
  );
}
