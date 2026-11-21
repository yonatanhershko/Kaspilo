"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import { useAdminAuth } from "@/auth/AdminAuth";
import { env } from "@/lib/env";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/approvals", label: "Pending approvals" },
  { href: "/users", label: "Users" },
  { href: "/analytics", label: "Analytics" },
] as const;

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 220 230" aria-hidden="true">
      <rect x="55" y="26" width="95" height="75" rx="11" fill="#7DB892" transform="rotate(-4 100 60)" />
      <rect x="48" y="40" width="105" height="75" rx="11" fill="#F6B88A" transform="rotate(2 100 75)" />
      <rect x="25" y="80" width="170" height="132" rx="20" fill="#3A8A66" />
      <path d="M25 100 a20 20 0 0 1 20 -20 H175 a20 20 0 0 1 20 20 V112 H25 Z" fill="#4C9A76" />
      <path d="M130 130 H182 a15 15 0 0 1 15 15 v26 a15 15 0 0 1 -15 15 H130 a28 28 0 0 1 -28 -28 a28 28 0 0 1 28 -28 Z" fill="#245C47" />
      <circle cx="160" cy="158" r="13" fill="#F2C14E" />
    </svg>
  );
}

export function AdminShell({
  pendingCount,
  children,
}: {
  pendingCount: number | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { state, signOut } = useAdminAuth();
  const profile = state.status === "ready" ? state.profile : null;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <header className="flex items-center justify-between bg-text px-4 py-3 text-background md:hidden">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-xl font-bold">Kaspilo</span>
        </div>
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="admin-sidebar"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-primary/40"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </header>
      <aside
        id="admin-sidebar"
        className={`${menuOpen ? "flex" : "hidden"} w-full shrink-0 flex-col justify-between gap-6 bg-text p-5 pt-2 text-background md:flex md:w-64 md:pt-5`}
      >
        <div>
          <div className="mb-8 hidden items-center gap-3 px-2 md:flex">
            <Logo />
            <span className="text-2xl font-bold">Kaspilo</span>
          </div>
          <nav className="space-y-1" aria-label="Main">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                    active ? "bg-primary text-on-primary" : "hover:bg-primary/40"
                  }`}
                >
                  {item.label}
                  {item.href === "/approvals" && !!pendingCount && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="space-y-3 px-2">
          <div>
            <p className="text-sm font-medium">{profile?.full_name || "Admin"}</p>
            <p className="truncate text-xs opacity-70">{profile?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-end px-4 pt-4 md:px-8 md:pt-6">
          <span
            className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
              env.appEnv === "production"
                ? "border-success text-success"
                : "border-accent text-on-accent"
            }`}
          >
            {env.appEnv === "production" ? "Production" : "Development"}
          </span>
        </div>
        <main className="flex-1 px-4 pb-10 md:px-8">{children}</main>
      </div>
    </div>
  );
}
