"use client";

import Link from "next/link";
import { Home } from "lucide-react";

/**
 * Persistent Home link for all subpages (Requirement 10)
 */
export function HomeLink() {
  return (
    <Link 
      href="/" 
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg glass hover:bg-white/10 transition-colors group"
    >
      <Home className="w-4 h-4 text-[#FFB800] group-hover:scale-110 transition-transform" />
      <span className="text-sm font-medium">Home</span>
    </Link>
  );
}

/**
 * Breadcrumb navigation component
 */
export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="flex items-center gap-2 text-sm text-white/60">
      <Link href="/" className="hover:text-white transition-colors">
        <Home className="w-4 h-4" />
      </Link>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span>/</span>
          {item.href ? (
            <Link href={item.href} className="hover:text-white transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-white">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
