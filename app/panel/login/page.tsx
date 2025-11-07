"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function PanelLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) return;

    setIsSubmitting(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        console.error(signInError);
        setError(signInError.message || "Gagal login. Periksa email & password.");
        return;
      }

      // TODO: nanti bisa cek role (ADMIN/CS) di profile.
      router.push("/panel/dashboard");
    } catch (err) {
      console.error(err);
      setError("Terjadi kesalahan tak terduga.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-slate-900/80 border border-slate-700 rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
            Panel
          </p>
          <h1 className="text-2xl font-semibold">Login Admin / CS</h1>
          <p className="text-sm text-slate-400">
            Masuk menggunakan email &amp; password Panel.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="panel-email">
              Email
            </label>
            <input
              id="panel-email"
              type="email"
              autoComplete="email"
              className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-panelAccent/80 focus:border-panelAccent/80"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="panel-password">
              Password
            </label>
            <input
              id="panel-password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-panelAccent/80 focus:border-panelAccent/80"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !email || !password}
            className="w-full rounded-xl bg-panelAccent px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {isSubmitting ? "Menghubungkan..." : "Masuk ke Panel"}
          </button>
        </form>

        <div className="text-xs text-slate-500 text-center space-y-1">
          <p>
            Ini login khusus <span className="text-slate-300">Admin / CS</span>.
          </p>
          <p>
            Ingin masuk sebagai member?{" "}
            <Link
              href="/member/login"
              className="text-panelAccent hover:underline"
            >
              Buka Member Site
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
