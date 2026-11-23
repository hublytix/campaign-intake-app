"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ModeBanner } from "./ModeBanner";
import type { AppMode } from "@/lib/types";

const NAV = [
  { href: "/setup", label: "Setup" },
  { href: "/intake", label: "Intake form" },
  { href: "/dashboard", label: "Dashboard" },
];

export function AppShell({
  mode,
  missing,
  children,
}: {
  mode: AppMode;
  missing: string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-full">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <ModeBanner mode={mode} missing={missing} />
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm text-white">
              CI
            </span>
            Campaign Intake
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                    active ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-medium text-gray-700">
              {mode === "real" ? "Unpublished" : mode === "demo" ? "Demo · local only" : "Blocked"}
            </span>
            <Link className="text-gray-500 hover:text-gray-800" href="/legal/privacy">
              Privacy
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
