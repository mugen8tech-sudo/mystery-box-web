"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const MEMBER_EMAIL_DOMAIN = "member.local"; // pastikan sama dengan yang kamu pakai saat buat user di Supabase

export default function MemberLoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username || !password) return;

    setIsSubmitting(true);

    try {
      const email = `${username}@${MEMBER_EMAIL_DOMAIN}`.toLowerCase();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        console.error(signInError);
        setError(signInError.message || "Gagal login. Periksa username & password.");
        return;
      }

      router.push("/member");
    } catch (err) {
      console.error(err);
      setError("Terjadi kesalahan tak terduga.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-gradient-to-b from-slate-900/90 via-slate-900/80 to-slate-950/90 border border-purple-600/40 rounded-2xl shadow-[0_0_40px_rgba(168,85,247,0.35)] p-8 space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-purple-300/70">
            Member Site
          </p>
          <h1 className="text-2xl font-semibold">Masuk ke Dunia Fantasy</h1>
          <p className="text-sm text-slate-200/80">
            Login dengan username &amp; password untuk membuka Mystery Box.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="member-username">
              Username
            </label>
            <input
              id="member-username"
              type="text"
              autoComplete="username"
              className="w-full rounded-xl border border-purple-500/40 bg-slate-950/70 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-memberAccent focus:border-memberAccent"
              placeholder="hero123"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="member-password">
              Password
            </label>
            <input
              id="member-password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-purple-500/40 bg-slate-950/70 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-memberAccent focus:border-memberAccent"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-xs text-red-300 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !username || !password}
            className="w-full rounded-xl bg-memberAccent px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-purple-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {isSubmitting ? "Menghubungkan..." : "Masuk ke Member Site"}
          </button>
        </form>

        <div className="text-xs text-slate-300/80 text-center space-y-1">
          <p>
            Credit kamu akan dipakai untuk membeli Mystery Box (1 / 2 / 3 credit).
          </p>
          <p>
            Salah portal?{" "}
            <Link
              href="/panel/login"
              className="text-memberAccent hover:underline"
            >
              Buka Panel Admin / CS
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
