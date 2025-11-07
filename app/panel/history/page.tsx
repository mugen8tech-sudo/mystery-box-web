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

type TxBase = {
  id: string;
  member_profile_id: string;
  credit_tier: number;
  credit_spent: number;
  status: "PURCHASED" | "OPENED" | "EXPIRED";
  expires_at: string;
  opened_at: string | null;
  processed: boolean;
  processed_at: string | null;
  created_at: string;
  rarity_id: string;
  reward_id: string | null;
};

type MemberShort = {
  id: string;
  username: string | null;
};

type RarityShort = {
  id: string;
  code: string;
  name: string;
};

type RewardShort = {
  id: string;
  label: string;
  reward_type: string;
  amount: number | null;
};

type HistoryRow = TxBase & {
  member: MemberShort | null;
  rarity: RarityShort | null;
  reward: RewardShort | null;
};

export default function PanelHistoryPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<PanelProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [searchUsername, setSearchUsername] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PURCHASED" | "OPENED" | "EXPIRED"
  >("ALL");
  const [tierFilter, setTierFilter] = useState<"ALL" | "1" | "2" | "3">("ALL");

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [infoType, setInfoType] = useState<"success" | "error" | null>(
    null,
  );

  // 1. Load profile admin / CS
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

  // 2. Load history transaksi box (+ lookup member/rarity/reward)
  useEffect(() => {
    async function loadRows() {
      if (!profile) return;
      setLoadingRows(true);
      setRowsError(null);

      try {
        // ambil transaksi dulu
        const { data: txData, error: txErr } = await supabase
          .from("box_transactions")
          .select(
            `
            id,
            member_profile_id,
            credit_tier,
            credit_spent,
            status,
            expires_at,
            opened_at,
            processed,
            processed_at,
            created_at,
            rarity_id,
            reward_id
          `,
          )
          .eq("tenant_id", profile.tenant_id)
          .order("created_at", { ascending: false })
          .limit(100);

        if (txErr) {
          console.error(txErr);
          setRowsError("Gagal membaca history transaksi.");
          setLoadingRows(false);
          return;
        }

        const baseRows = (txData || []) as TxBase[];

        if (baseRows.length === 0) {
          setRows([]);
          setLoadingRows(false);
          return;
        }

        // kumpulkan id untuk lookup
        const memberIds = Array.from(
          new Set(baseRows.map((r) => r.member_profile_id)),
        );
        const rarityIds = Array.from(
          new Set(baseRows.map((r) => r.rarity_id)),
        );
        const rewardIds = Array.from(
          new Set(
            baseRows
              .map((r) => r.reward_id)
              .filter((v): v is string => !!v),
          ),
        );

        // ambil data lookup paralel
        const [
          { data: memberData, error: memberErr },
          { data: rarityData, error: rarityErr },
          { data: rewardData, error: rewardErr },
        ] = await Promise.all([
          memberIds.length
            ? supabase
                .from("profiles")
                .select("id, username")
                .in("id", memberIds)
            : Promise.resolve({ data: [] as MemberShort[], error: null }),
          rarityIds.length
            ? supabase
                .from("box_rarities")
                .select("id, code, name")
                .in("id", rarityIds)
            : Promise.resolve({ data: [] as RarityShort[], error: null }),
          rewardIds.length
            ? supabase
                .from("box_rewards")
                .select("id, label, reward_type, amount")
                .in("id", rewardIds)
            : Promise.resolve({ data: [] as RewardShort[], error: null }),
        ]);

        if (memberErr || rarityErr || rewardErr) {
          console.error(memberErr || rarityErr || rewardErr);
          setRowsError("Gagal membaca data tambahan (member/rarity/reward).");
          setLoadingRows(false);
          return;
        }

        const memberMap = new Map(
          (memberData || []).map((m) => [m.id, m as MemberShort]),
        );
        const rarityMap = new Map(
          (rarityData || []).map((r) => [r.id, r as RarityShort]),
        );
        const rewardMap = new Map(
          (rewardData || []).map((r) => [r.id, r as RewardShort]),
        );

        const fullRows: HistoryRow[] = baseRows.map((r) => ({
          ...r,
          member: memberMap.get(r.member_profile_id) || null,
          rarity: rarityMap.get(r.rarity_id) || null,
          reward: r.reward_id ? rewardMap.get(r.reward_id) || null : null,
        }));

        setRows(fullRows);
        setLoadingRows(false);
      } catch (err) {
        console.error(err);
        setRowsError("Terjadi kesalahan saat membaca history transaksi.");
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

  // 3. Filter di client
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) {
        return false;
      }

      if (tierFilter !== "ALL" && row.credit_tier !== Number(tierFilter)) {
        return false;
      }

      if (searchUsername.trim() !== "") {
        const u = (row.member?.username || "").toLowerCase().trim();
        if (!u.includes(searchUsername.toLowerCase().trim())) {
          return false;
        }
      }

      return true;
    });
  }, [rows, statusFilter, tierFilter, searchUsername]);

  function formatDateTime(s?: string | null) {
    if (!s) return "-";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString("id-ID", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  function statusLabel(row: HistoryRow) {
    if (row.status === "PURCHASED") return "Purchased";
    if (row.status === "OPENED") return "Opened";
    if (row.status === "EXPIRED") return "Expired";
    return row.status;
  }

  async function toggleProcessed(row: HistoryRow) {
    if (!profile) return;
    setProcessingId(row.id);

    const makeProcessed = !row.processed;
    const nowIso = new Date().toISOString();

    try {
      const { error } = await supabase
        .from("box_transactions")
        .update({
          processed: makeProcessed,
          processed_by_profile_id: makeProcessed ? profile.id : null,
          processed_at: makeProcessed ? nowIso : null,
        })
        .eq("id", row.id);

      if (error) {
        console.error(error);
        showInfo(
          error.message || "Gagal mengubah status proses.",
          "error",
        );
        return;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                processed: makeProcessed,
                processed_at: makeProcessed ? nowIso : null,
              }
            : r,
        ),
      );

      showInfo(
        makeProcessed
          ? "Transaksi ditandai sudah diproses."
          : "Transaksi dikembalikan ke belum diproses.",
        "success",
      );
    } catch (err: any) {
      console.error(err);
      showInfo(
        err?.message || "Gagal mengubah status proses.",
        "error",
      );
    } finally {
      setProcessingId(null);
    }
  }

  // ---------------- render ----------------

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
            History Transaksi Box
          </h1>
          <p className="text-xs text-slate-400">
            Riwayat pembelian dan pembukaan mystery box di tenant ini.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 md:items-end">
          <p className="text-[11px] text-slate-500">
            Menampilkan {filteredRows.length} dari {rows.length} transaksi
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

          <div className="flex gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as any)
                }
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                <option value="ALL">Semua</option>
                <option value="PURCHASED">Purchased</option>
                <option value="OPENED">Opened</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Tier Credit
              </label>
              <select
                value={tierFilter}
                onChange={(e) =>
                  setTierFilter(e.target.value as any)
                }
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                <option value="ALL">Semua</option>
                <option value="1">1 credit</option>
                <option value="2">2 credit</option>
                <option value="3">3 credit</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Tabel */}
      <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-950/60">
        <table className="min-w-full text-left text-xs text-slate-200">
          <thead className="border-b border-slate-800 bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-2 py-3 text-center">Tier</th>
              <th className="px-2 py-3 text-center">Credit</th>
              <th className="px-2 py-3">Rarity</th>
              <th className="px-2 py-3">Reward</th>
              <th className="px-2 py-3">Status</th>
              <th className="px-2 py-3">Dibuat</th>
              <th className="px-2 py-3">Opened / Expired</th>
              <th className="px-2 py-3 text-center">Processed</th>
            </tr>
          </thead>
          <tbody>
            {loadingRows ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  Memuat history transaksi...
                </td>
              </tr>
            ) : rowsError ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-red-300"
                >
                  {rowsError}
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  Tidak ada transaksi yang cocok dengan filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const rarityText = row.rarity
                  ? `${row.rarity.name} (${row.rarity.code})`
                  : "-";

                let rewardText = "-";
                if (row.reward) {
                  if (row.reward.reward_type === "CASH") {
                    const amount = row.reward.amount || 0;
                    rewardText = `${row.reward.label} - Rp ${amount.toLocaleString(
                      "id-ID",
                    )}`;
                  } else {
                    rewardText = row.reward.label;
                  }
                }

                const canProcess =
                  row.status === "OPENED" && !!row.reward_id;

                return (
                  <tr
                    key={row.id}
                    className="border-t border-slate-800/80 hover:bg-slate-900/60"
                  >
                    <td className="px-4 py-2 text-[11px]">
                      {row.member?.username || "-"}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {row.credit_tier}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {row.credit_spent}
                    </td>
                    <td className="px-2 py-2 text-[11px]">
                      {rarityText}
                    </td>
                    <td className="px-2 py-2 text-[11px]">
                      {rewardText}
                    </td>
                    <td className="px-2 py-2 text-[11px]">
                      {statusLabel(row)}
                    </td>
                    <td className="px-2 py-2 text-[11px]">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-2 py-2 text-[11px]">
                      {row.status === "OPENED"
                        ? formatDateTime(row.opened_at)
                        : formatDateTime(row.expires_at)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {canProcess ? (
                        <button
                          onClick={() => toggleProcessed(row)}
                          disabled={processingId === row.id}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                            row.processed
                              ? "border border-emerald-500/70 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-800/50"
                              : "border border-slate-600 bg-slate-900/80 text-slate-100 hover:bg-slate-800"
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                        >
                          {processingId === row.id
                            ? "..."
                            : row.processed
                            ? "Sudah diproses"
                            : "Process"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          -
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
