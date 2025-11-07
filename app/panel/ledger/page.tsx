"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type UserRole = "ADMIN" | "CS" | "MEMBER";

type PanelProfile = {
  id: string;
  tenant_id: string;
  role: UserRole;
};

type LedgerBase = {
  id: string;
  tenant_id: string;
  member_profile_id: string | null;
  delta: number;
  balance_after: number;
  kind: string;
  description: string | null;
  created_by_profile_id: string | null;
  created_at: string;
};

type MemberShort = {
  id: string;
  username: string | null;
};

type CreatorShort = {
  id: string;
  email: string | null;
};

type LedgerRow = LedgerBase & {
  member: MemberShort | null;
  created_by: CreatorShort | null;
};

export default function PanelLedgerPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<PanelProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [searchUsername, setSearchUsername] = useState("");
  const [kindFilter, setKindFilter] = useState<
    "ALL" | "TOPUP" | "ADJUSTMENT" | "BOX_PURCHASE"
  >("ALL");

  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [infoType, setInfoType] = useState<"success" | "error" | null>(
    null,
  );

  // ---------- load profil admin/CS ----------

  useEffect(() => {
    async function loadProfile() {
      setLoadingProfile(true);
      setProfileError(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr) {
        console.error(userErr);
        setProfileError("Gagal membaca sesi login.");
        setLoadingProfile(false);
        return;
      }

      if (!user) {
        router.push("/panel/login");
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, tenant_id, role")
        .eq("id", user.id)
        .maybeSingle<PanelProfile>();

      if (profErr) {
        console.error(profErr);
        setProfileError("Gagal membaca profil.");
        setLoadingProfile(false);
        return;
      }

      if (!prof) {
        setProfileError("Profil belum dibuat untuk akun ini.");
        setLoadingProfile(false);
        return;
      }

      if (prof.role !== "ADMIN" && prof.role !== "CS") {
        setProfileError("Halaman ini hanya untuk Admin / CS.");
        setLoadingProfile(false);
        return;
      }

      setProfile(prof);
      setLoadingProfile(false);
    }

    loadProfile();
  }, [router]);

  // ---------- load ledger untuk tenant ----------

  useEffect(() => {
    async function loadRows() {
      if (!profile) return;

      setLoadingRows(true);
      setRowsError(null);

      try {
        const { data, error } = await supabase
          .from("credit_ledger")
          .select(
            `
            id,
            tenant_id,
            member_profile_id,
            delta,
            balance_after,
            kind,
            description,
            created_by_profile_id,
            created_at
          `,
          )
          .eq("tenant_id", profile.tenant_id)
          .order("created_at", { ascending: false })
          .limit(200);

        if (error) {
          console.error(error);
          setRowsError("Gagal membaca data ledger.");
          setLoadingRows(false);
          return;
        }

        const baseRows = (data || []) as LedgerBase[];

        if (baseRows.length === 0) {
          setRows([]);
          setLoadingRows(false);
          return;
        }

        const memberIds = Array.from(
          new Set(
            baseRows
              .map((r) => r.member_profile_id)
              .filter((v): v is string => !!v),
          ),
        );
        const creatorIds = Array.from(
          new Set(
            baseRows
              .map((r) => r.created_by_profile_id)
              .filter((v): v is string => !!v),
          ),
        );

        const [
          { data: memberData, error: memberErr },
          { data: creatorData, error: creatorErr },
        ] = await Promise.all([
          memberIds.length
            ? supabase
                .from("profiles")
                .select("id, username")
                .in("id", memberIds)
            : Promise.resolve({ data: [] as MemberShort[], error: null }),
          creatorIds.length
            ? supabase
                .from("profiles")
                .select("id, email")
                .in("id", creatorIds)
            : Promise.resolve({ data: [] as CreatorShort[], error: null }),
        ]);

        if (memberErr) {
          console.error("Ledger member lookup error:", memberErr);
        }
        if (creatorErr) {
          console.error("Ledger creator lookup error:", creatorErr);
        }

        const memberMap = new Map(
          (memberData || []).map((m) => [m.id, m as MemberShort]),
        );
        const creatorMap = new Map(
          (creatorData || []).map((c) => [c.id, c as CreatorShort]),
        );

        const fullRows: LedgerRow[] = baseRows.map((r) => ({
          ...r,
          member: r.member_profile_id
            ? memberMap.get(r.member_profile_id) || null
            : null,
          created_by: r.created_by_profile_id
            ? creatorMap.get(r.created_by_profile_id) || null
            : null,
        }));

        setRows(fullRows);
        setLoadingRows(false);
      } catch (err) {
        console.error(err);
        setRowsError("Terjadi kesalahan saat membaca ledger.");
        setLoadingRows(false);
      }
    }

    loadRows();
  }, [profile]);

  function showInfo(msg: string, type: "success" | "error") {
    setInfoMessage(msg);
    setInfoType(type);
    setTimeout(() => {
      setInfoMessage(null);
      setInfoType(null);
    }, 3500);
  }

  // ---------- filter di client ----------

  const filteredRows = useMemo(() => {
    return rows
      // Ledger menampilkan semua mutasi credit utama
      .filter((row) =>
        ["TOPUP", "ADJUSTMENT", "BOX_PURCHASE"].includes(row.kind),
      )
      .filter((row) => {
        if (kindFilter !== "ALL" && row.kind !== kindFilter) {
          return false;
        }

        if (searchUsername.trim() !== "") {
          const u = (row.member?.username || "")
            .toLowerCase()
            .trim();
          if (!u.includes(searchUsername.toLowerCase().trim())) {
            return false;
          }
        }

        return true;
      });
  }, [rows, kindFilter, searchUsername]);

  // ---------- helpers ----------

  function formatDateTime(dateStr: string) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("id-ID", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  function formatKind(kind: string) {
    if (kind === "TOPUP") return "Topup";
    if (kind === "ADJUSTMENT") return "Adjustment (-)";
    if (kind === "BOX_PURCHASE") return "Beli box";
    return kind;
  }

  function kindBadgeClass(kind: string) {
    if (kind === "TOPUP") {
      return "border-emerald-500/60 bg-emerald-950/50 text-emerald-200";
    }
    if (kind === "ADJUSTMENT" || kind === "BOX_PURCHASE") {
      // dua-duanya mengurangi credit → merah
      return "border-rose-500/60 bg-rose-950/50 text-rose-200";
    }
    return "border-slate-500/60 bg-slate-900/60 text-slate-200";
  }

  function deltaText(delta: number) {
    const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
    const abs = Math.abs(delta);
    return `${sign}${abs} credit`;
  }

  function deltaClass(delta: number) {
    if (delta > 0) return "text-emerald-300";
    if (delta < 0) return "text-rose-300";
    return "text-slate-200";
  }

  // ---------- render ----------

  if (loadingProfile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-slate-300">
          Memuat profil admin / CS...
        </p>
      </main>
    );
  }

  if (profileError) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {profileError}
        </p>
        <button
          onClick={() => router.push("/panel/login")}
          className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800 transition"
        >
          Kembali ke login panel
        </button>
      </main>
    );
  }

  return (
    <main className="px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-sky-400">
            Panel
          </p>
          <h1 className="text-xl font-semibold text-slate-50">
            Ledger Credit Member
          </h1>
          <p className="text-xs text-slate-400">
            Riwayat semua mutasi credit (topup, adjust, dan pembelian box)
            di tenant ini. Detail box bisa dilihat di menu History.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 md:items-end">
          <p className="text-[11px] text-slate-500">
            Menampilkan {filteredRows.length} dari {rows.length} mutasi
            terakhir.
          </p>
        </div>
      </div>

      {/* Info message */}
      {infoMessage && infoType && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            infoType === "success"
              ? "border-emerald-500/70 bg-emerald-950/40 text-emerald-200"
              : "border-red-500/70 bg-red-950/40 text-red-200"
          }`}
        >
          {infoMessage}
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-400">
              Filter username member
            </label>
            <input
              value={searchUsername}
              onChange={(e) => setSearchUsername(e.target.value)}
              placeholder="cari username..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none ring-0 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Jenis mutasi
            </label>
            <select
              value={kindFilter}
              onChange={(e) =>
                setKindFilter(e.target.value as any)
              }
              className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            >
              <option value="ALL">Semua</option>
              <option value="TOPUP">Topup</option>
              <option value="ADJUSTMENT">Adjustment (-)</option>
              <option value="BOX_PURCHASE">Beli box</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabel ledger */}
      <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-950/60">
        <table className="min-w-full text-left text-xs text-slate-200">
          <thead className="border-b border-slate-800 bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Waktu</th>
              <th className="px-2 py-3">Username</th>
              <th className="px-2 py-3 text-center">Mutasi</th>
              <th className="px-2 py-3 text-center">Saldo Akhir</th>
              <th className="px-2 py-3">Jenis</th>
              <th className="px-2 py-3">Keterangan</th>
              <th className="px-2 py-3">Dibuat oleh</th>
            </tr>
          </thead>
          <tbody>
            {loadingRows ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  Memuat data ledger...
                </td>
              </tr>
            ) : rowsError ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-red-300"
                >
                  {rowsError}
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  Tidak ada mutasi yang cocok dengan filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-slate-800/80 hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2 text-[11px]">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-2 py-2 text-[11px]">
                    {row.member?.username || "-"}
                  </td>
                  <td
                    className={`px-2 py-2 text-center text-[11px] font-semibold ${deltaClass(
                      row.delta,
                    )}`}
                  >
                    {deltaText(row.delta)}
                  </td>
                  <td className="px-2 py-2 text-center text-[11px]">
                    {row.balance_after} credit
                  </td>
                  <td className="px-2 py-2 text-[11px]">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${kindBadgeClass(
                        row.kind,
                      )}`}
                    >
                      {formatKind(row.kind)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[11px]">
                    {row.description || "-"}
                  </td>
                  <td className="px-2 py-2 text-[11px]">
                    {row.created_by?.email || "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
