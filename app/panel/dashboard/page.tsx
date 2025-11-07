"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type TenantInfo = {
  code: string;
  name: string;
} | null;

type ProfileRow = {
  role: "ADMIN" | "CS" | "MEMBER";
  username: string | null;
  tenant: TenantInfo;
};

export default function PanelDashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setError(null);
      setLoading(true);

      // 1) Cek user dari Supabase Auth
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError) {
        console.error(userError);
        setError("Gagal membaca sesi login.");
        setLoading(false);
        return;
      }

      if (!user) {
        // Tidak ada sesi -> balik ke login panel
        router.push("/panel/login");
        return;
      }

      setUserEmail(user.email ?? null);

      // 2) Ambil profile + tenant
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select(
          `
          role,
          username,
          tenant:tenants (
            code,
            name
          )
        `
        )
        .eq("id", user.id)
        .maybeSingle<any>(); // pakai any biar simple

      if (profileError) {
        console.error(profileError);
        setError("Gagal membaca profil panel.");
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Profil belum dibuat untuk user ini.");
        setLoading(false);
        return;
      }

      // Supabase biasa mengembalikan relasi sebagai array -> ambil elemen pertama
      const rawTenant = (data as any).tenant as any;
      const tenant: TenantInfo = Array.isArray(rawTenant)
        ? rawTenant[0] ?? null
        : rawTenant ?? null;

      setProfile({
        role: data.role,
        username: data.username,
        tenant
      });

      setLoading(false);
    }

    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/panel/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-xl w-full bg-slate-900/80 border border-slate-700 rounded-2xl shadow-2xl p-8 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
              Panel
            </p>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
          </div>

          <button
            onClick={handleLogout}
            className="text-xs rounded-lg border border-slate-600 px-3 py-1.5 hover:bg-slate-800 transition"
          >
            Logout
          </button>
        </div>

        {loading && (
          <p className="text-sm text-slate-300">Memuat profil panel...</p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {!loading && !error && profile && (
          <div className="space-y-3 text-sm text-slate-200">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                Akun
              </p>
              <p>Email: {userEmail ?? "—"}</p>
              <p>
                Role:{" "}
                <span className="font-semibold">
                  {profile.role === "ADMIN"
                    ? "Admin"
                    : profile.role === "CS"
                    ? "CS"
                    : "Member"}
                </span>
              </p>
              {profile.username && <p>Username: {profile.username}</p>}
            </div>

            <div className="pt-2 border-t border-slate-700/60">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                Tenant
              </p>
              {profile.tenant ? (
                <>
                  <p>
                    Kode:{" "}
                    <span className="font-mono text-cyan-300">
                      {profile.tenant.code}
                    </span>
                  </p>
                  <p>Nama: {profile.tenant.name}</p>
                </>
              ) : (
                <p className="text-slate-400">Tenant belum terhubung.</p>
              )}
            </div>

            <p className="text-xs text-slate-500 pt-2">
              Setelah ini, kita akan tambahkan menu Panel (member, credit,
              history box, dll.) di sekitar header ini.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
