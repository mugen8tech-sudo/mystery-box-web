"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Sidebar: sekarang cuma Members (kamu sudah hapus Dashboard)
const navItems = [
  { href: "/panel/members", label: "Members" },
  { href: "/panel/ledger", label: "Ledger" },
  { href: "/panel/history", label: "History" },
  { href: "/panel/boxes", label: "Boxes" }
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Untuk halaman login panel, JANGAN pakai sidebar
  if (pathname === "/panel/login") {
    return <>{children}</>;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/panel/login");
  }

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* SIDEBAR (desktop) */}
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-800 bg-slate-950/95 px-4 py-6">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
            MYSTERY BOX
          </div>
          <div className="mt-1 text-lg font-semibold">Panel</div>
        </div>

        <nav className="space-y-1 flex-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-slate-800 text-cyan-300"
                    : "text-slate-300 hover:bg-slate-800/60"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout di sidebar dihapus sesuai request */}
      </aside>

      {/* AREA KONTEN */}
      <div className="flex-1 flex flex-col">
        {/* Top bar (mobile) tetap ada tombol Logout supaya selalu ada jalan keluar */}
        <div className="md:hidden border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Panel</span>
          <button
            type="button"
            onClick={() => {
              void handleLogout();
            }}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800 transition"
          >
            Logout
          </button>
        </div>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
