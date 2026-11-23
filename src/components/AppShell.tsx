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
  const badge =
    mode === "real" ? "Unpublished" : mode === "demo" ? "Demo · local only" : "Blocked";

  return (
    <div className="min-h-full bg-background text-foreground">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <ModeBanner mode={mode} missing={missing} />
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-6xl items-center gap-3 px-4 py-3 lg:grid-cols-[1fr_auto_1fr]">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 justify-self-start text-sm font-semibold text-gray-900"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white">
              CI
            </span>
            <span className="whitespace-nowrap">Campaign Intake</span>
          </Link>
          <nav
            aria-label="Primary"
            className="flex justify-self-center rounded-full bg-gray-100 p-1"
          >
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center justify-self-end gap-3 text-sm">
            <span className="whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-medium text-gray-700">
              {badge}
            </span>
            <Link className="whitespace-nowrap text-gray-500 hover:text-gray-800" href="/legal/privacy">
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
