"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type UserRole = "ADMIN" | "CS" | "MEMBER";

type CurrentProfile = {
  id: string;
  tenant_id: string | null;
  role: UserRole;
  username: string | null;
};

type RarityCode =
  | "COMMON"
  | "RARE"
  | "EPIC"
  | "SUPREME"
  | "LEGENDARY"
  | "SPECIAL_LEGENDARY";

type RarityRow = {
  id: string;
  code: RarityCode;
  name: string;
  color_key: string;
  sort_order: number;
};

type RewardRow = {
  id: string;
  rarity_id: string;
  label: string;
  reward_type: string; // "CASH" | "ITEM"
  amount: number | null;
  is_active: boolean;
  real_probability: number | null;
  gimmick_probability: number | null;
};

type RarityWithRewards = RarityRow & {
  rewards: RewardRow[];
};

type CreditProbRow = {
  id: string;
  credit_tier: number; // 1 / 2 / 3
  rarity_id: string;
  is_active: boolean;
  real_probability: number;
  gimmick_probability: number;
  rarity: RarityRow;
};

export default function PanelBoxesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [rows, setRows] = useState<RarityWithRewards[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [savingRarityId, setSavingRarityId] = useState<string | null>(null);
  const [creditConfigs, setCreditConfigs] = useState<
    Record<number, CreditProbRow[]>
  >({
    1: [],
    2: [],
    3: [],
  });
  const [savingTier, setSavingTier] = useState<number | null>(null);

  // Modal Tambah/Edit Hadiah per rarity
  const [rewardModalOpen, setRewardModalOpen] = useState(false);
  const [rewardModalMode, setRewardModalMode] = useState<"create" | "edit">(
    "create",
  );
  const [rewardModalRarity, setRewardModalRarity] = useState<RarityRow | null>(
    null,
  );
  const [editingReward, setEditingReward] = useState<RewardRow | null>(null);

  const [rewardLabel, setRewardLabel] = useState("");
  const [rewardType, setRewardType] = useState<"CASH" | "ITEM">("CASH");
  const [rewardAmount, setRewardAmount] = useState<string>("");
  const [rewardIsActive, setRewardIsActive] = useState(true);
  const [rewardSaving, setRewardSaving] = useState(false);
  const [rewardError, setRewardError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      // 1) Cek user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error(userError);
        setError("Gagal membaca sesi login.");
        setLoading(false);
        return;
      }

      if (!user) {
        router.push("/panel/login");
        return;
      }

      // 2) Ambil profil
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, tenant_id, role, username")
        .eq("id", user.id)
        .maybeSingle<CurrentProfile>();

      if (profErr) {
        console.error(profErr);
        setError("Gagal membaca profil.");
        setLoading(false);
        return;
      }

      if (!prof) {
        setError("Profil belum dibuat untuk user ini.");
        setLoading(false);
        return;
      }

      if (!prof.tenant_id) {
        setError("User ini belum terhubung ke tenant mana pun.");
        setLoading(false);
        return;
      }

      if (prof.role !== "ADMIN" && prof.role !== "CS") {
        setError("Hanya Admin / CS yang boleh mengakses konfigurasi box.");
        setLoading(false);
        return;
      }

      setProfile(prof);

      // 3) Ambil master rarity
      const { data: raritiesData, error: rarErr } = await supabase
        .from("box_rarities")
        .select("id, code, name, color_key, sort_order")
        .order("sort_order", { ascending: true });

      if (rarErr) {
        console.error(rarErr);
        setError("Gagal mengambil data rarity.");
        setLoading(false);
        return;
      }

      const rarities = (raritiesData || []) as RarityRow[];

      // 4) Ambil rewards per tenant
      const { data: rewardsData, error: rewErr } = await supabase
        .from("box_rewards")
        .select(
          "id, rarity_id, label, reward_type, amount, is_active, real_probability, gimmick_probability",
        )
        .eq("tenant_id", prof.tenant_id)
        .order("rarity_id", { ascending: true });

      if (rewErr) {
        console.error(rewErr);
        setError("Gagal mengambil daftar hadiah.");
        setLoading(false);
        return;
      }

      const rewards = (rewardsData || []) as RewardRow[];

      const byRarity: Record<string, RewardRow[]> = {};
      rewards.forEach((rw) => {
        const rid = rw.rarity_id;
        if (!byRarity[rid]) byRarity[rid] = [];
        byRarity[rid].push({
          ...rw,
          real_probability: rw.real_probability ?? 0,
          gimmick_probability: rw.gimmick_probability ?? 0,
        });
      });

      const combined: RarityWithRewards[] = rarities.map((rar) => ({
        ...rar,
        rewards: byRarity[rar.id] || [],
      }));
      setRows(combined);

      // 5) Ambil konfigurasi probabilitas per credit tier
      const { data: creditData, error: creditErr } = await supabase
        .from("box_credit_rarity_probs")
        .select(
          "id, credit_tier, rarity_id, is_active, real_probability, gimmick_probability",
        )
        .eq("tenant_id", prof.tenant_id);

      if (creditErr) {
        console.error(creditErr);
        setError("Gagal mengambil konfigurasi probabilitas box.");
        setLoading(false);
        return;
      }

      const rarityMap = new Map<string, RarityRow>();
      rarities.forEach((r) => rarityMap.set(r.id, r));

      const creditByTier: Record<number, CreditProbRow[]> = {
        1: [],
        2: [],
        3: [],
      };

      (creditData || []).forEach((raw: any) => {
        const rarity = rarityMap.get(raw.rarity_id);
        if (!rarity) return;

        const row: CreditProbRow = {
          id: raw.id,
          credit_tier: raw.credit_tier,
          rarity_id: raw.rarity_id,
          is_active: raw.is_active,
          real_probability: raw.real_probability ?? 0,
          gimmick_probability: raw.gimmick_probability ?? 0,
          rarity,
        };

        if (!creditByTier[row.credit_tier]) {
          creditByTier[row.credit_tier] = [];
        }
        creditByTier[row.credit_tier].push(row);
      });

      [1, 2, 3].forEach((tier) => {
        creditByTier[tier]?.sort(
          (a, b) => a.rarity.sort_order - b.rarity.sort_order,
        );
      });

      setCreditConfigs(creditByTier);

      setLoading(false);
    }

    load();
  }, [router]);

  const canEdit = profile?.role === "ADMIN";

  function formatAmount(amount: number | null, reward_type: string) {
    if (reward_type === "CASH" && amount != null) {
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
      }).format(amount);
    }
    return "-";
  }

  function rarityBadge(r: RarityRow) {
    const base =
      "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold";
    switch (r.code) {
      case "COMMON":
        return (
          <span className={`${base} bg-emerald-900/50 text-emerald-300`}>
            Common
          </span>
        );
      case "RARE":
        return (
          <span className={`${base} bg-sky-900/60 text-sky-300`}>Rare</span>
        );
      case "EPIC":
        return (
          <span className={`${base} bg-purple-900/60 text-purple-300`}>
            Epic
          </span>
        );
      case "SUPREME":
        return (
          <span className={`${base} bg-yellow-900/60 text-yellow-300`}>
            Supreme
          </span>
        );
      case "LEGENDARY":
        return (
          <span className={`${base} bg-amber-900/70 text-amber-300`}>
            Legendary
          </span>
        );
      case "SPECIAL_LEGENDARY":
        return (
          <span className={`${base} bg-pink-900/70 text-pink-200`}>
            Special Legendary
          </span>
        );
      default:
        return (
          <span className={`${base} bg-slate-800 text-slate-200`}>
            {r.name}
          </span>
        );
    }
  }

  // ----- Modal Tambah/Edit Hadiah -----

  function openCreateRewardModal(rarity: RarityRow) {
    if (!canEdit) return;
    setRewardModalMode("create");
    setRewardModalRarity(rarity);
    setEditingReward(null);
    setRewardLabel("");
    setRewardType("CASH");
    setRewardAmount("");
    setRewardIsActive(true);
    setRewardError(null);
    setRewardModalOpen(true);
  }

  function openEditRewardModal(rarity: RarityRow, reward: RewardRow) {
    if (!canEdit) return;
    setRewardModalMode("edit");
    setRewardModalRarity(rarity);
    setEditingReward(reward);
    setRewardLabel(reward.label);
    setRewardType((reward.reward_type as "CASH" | "ITEM") ?? "CASH");
    setRewardAmount(
      reward.amount != null ? String(reward.amount) : "",
    );
    setRewardIsActive(!!reward.is_active);
    setRewardError(null);
    setRewardModalOpen(true);
  }

  function closeRewardModal() {
    setRewardModalOpen(false);
    setRewardModalRarity(null);
    setEditingReward(null);
    setRewardLabel("");
    setRewardAmount("");
    setRewardIsActive(true);
    setRewardSaving(false);
    setRewardError(null);
  }

  async function handleRewardModalSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile?.tenant_id || !rewardModalRarity) return;

    const tenantId = profile.tenant_id;
    const label = rewardLabel.trim();
    if (!label) {
      setRewardError("Nama hadiah wajib diisi.");
      return;
    }

    let amountNumber: number | null = null;

    if (rewardType === "CASH") {
      if (!rewardAmount.trim()) {
        setRewardError("Nominal wajib diisi untuk hadiah saldo.");
        return;
      }
      amountNumber = Number(rewardAmount);
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        setRewardError("Nominal harus angka lebih dari 0.");
        return;
      }
    }

    setRewardSaving(true);
    setRewardError(null);

    try {
      if (rewardModalMode === "create") {
        // INSERT hadiah baru
        const { data, error } = await supabase
          .from("box_rewards")
          .insert({
            tenant_id: tenantId,
            rarity_id: rewardModalRarity.id,
            label,
            reward_type: rewardType,
            amount: amountNumber,
            is_active: rewardIsActive,
            real_probability: 0,
            gimmick_probability: 0,
          })
          .select(
            "id, rarity_id, label, reward_type, amount, is_active, real_probability, gimmick_probability",
          )
          .single<RewardRow>();

        if (error) throw error;

        const newReward: RewardRow = {
          ...data,
          real_probability: data.real_probability ?? 0,
          gimmick_probability: data.gimmick_probability ?? 0,
        };

        setRows((prev) =>
          prev.map((r) =>
            r.id === rewardModalRarity.id
              ? { ...r, rewards: [...r.rewards, newReward] }
              : r,
          ),
        );
      } else if (rewardModalMode === "edit" && editingReward) {
        // UPDATE hadiah existing
        const { data, error } = await supabase
          .from("box_rewards")
          .update({
            label,
            reward_type: rewardType,
            amount: amountNumber,
            is_active: rewardIsActive,
          })
          .eq("id", editingReward.id)
          .select(
            "id, rarity_id, label, reward_type, amount, is_active, real_probability, gimmick_probability",
          )
          .maybeSingle<RewardRow>();

        if (error) throw error;

        if (data) {
          const updated: RewardRow = {
            ...data,
            real_probability: data.real_probability ?? 0,
            gimmick_probability: data.gimmick_probability ?? 0,
          };

          setRows((prev) =>
            prev.map((r) =>
              r.id === updated.rarity_id
                ? {
                    ...r,
                    rewards: r.rewards.map((rw) =>
                      rw.id === updated.id ? { ...rw, ...updated } : rw,
                    ),
                  }
                : r,
            ),
          );
        }
      }

      closeRewardModal();
    } catch (err: any) {
      console.error(err);
      setRewardError(
        err?.message || "Gagal menyimpan hadiah. Coba lagi nanti.",
      );
    } finally {
      setRewardSaving(false);
    }
  }

  // --- Reward per rarity (RNG 2, buka box) ---

  function handleRewardChange(
    rarityId: string,
    rewardId: string,
    field: "is_active" | "real_probability" | "gimmick_probability",
    value: boolean | number,
  ) {
    setRows((prev) =>
      prev.map((rar) => {
        if (rar.id !== rarityId) return rar;
        return {
          ...rar,
          rewards: rar.rewards.map((rw) => {
            if (rw.id !== rewardId) return rw;

            if (field === "is_active") {
              return { ...rw, is_active: value as boolean };
            }

            let num = Number(value);
            if (!Number.isFinite(num) || num < 0) num = 0;
            if (num > 100) num = 100;

            if (field === "real_probability") {
              return { ...rw, real_probability: num };
            } else {
              return { ...rw, gimmick_probability: num };
            }
          }),
        };
      }),
    );
  }

  function getSums(rar: RarityWithRewards) {
    let real = 0;
    let gimmick = 0;
    for (const rw of rar.rewards) {
      if (!rw.is_active) continue;
      real += rw.real_probability ?? 0;
      gimmick += rw.gimmick_probability ?? 0;
    }
    return { real, gimmick };
  }

  async function handleSaveRarity(rarityId: string) {
    const rar = rows.find((r) => r.id === rarityId);
    if (!rar) return;

    const { real, gimmick } = getSums(rar);
    if (real !== 100 || gimmick !== 100) {
      alert(
        `Total probability untuk rarity ini harus 100%.\n\nReal sekarang: ${real}%, Gimmick sekarang: ${gimmick}%.`,
      );
      return;
    }

    setSavingRarityId(rarityId);

    try {
      const payload = rar.rewards.map((rw) => ({
        id: rw.id,
        is_active: rw.is_active,
        real_probability: rw.real_probability ?? 0,
        gimmick_probability: rw.gimmick_probability ?? 0,
      }));

      // Semua row sudah ada, cukup UPDATE per id.
      for (const item of payload) {
        const { error: updErr } = await supabase
          .from("box_rewards")
          .update({
            is_active: item.is_active,
            real_probability: item.real_probability,
            gimmick_probability: item.gimmick_probability,
          })
          .eq("id", item.id);

        if (updErr) {
          console.error(updErr);
          throw updErr;
        }
      }
    } catch (e: any) {
      console.error(e);
      alert(
        e?.message ||
          "Terjadi kesalahan tak terduga saat menyimpan konfigurasi reward.",
      );
    } finally {
      setSavingRarityId(null);
    }
  }

  // --- Probabilitas per credit tier (RNG 1, beli box) ---

  function getTierRows(tier: number): CreditProbRow[] {
    const list = creditConfigs[tier] || [];
    if (tier === 2) {
      // 2 credit: mulai dari Rare (Common digugurkan)
      return list.filter((row) => row.rarity.code !== "COMMON");
    }
    if (tier === 3) {
      // 3 credit: mulai dari Epic (Common & Rare digugurkan)
      return list.filter(
        (row) =>
          row.rarity.code !== "COMMON" && row.rarity.code !== "RARE",
      );
    }
    return list;
  }

  function handleTierChange(
    tier: number,
    id: string,
    field: "is_active" | "real_probability" | "gimmick_probability",
    value: boolean | number,
  ) {
    setCreditConfigs((prev) => {
      const copy: Record<number, CreditProbRow[]> = {
        1: prev[1] || [],
        2: prev[2] || [],
        3: prev[3] || [],
      };

      copy[tier] = (copy[tier] || []).map((row) => {
        if (row.id !== id) return row;

        if (field === "is_active") {
          return { ...row, is_active: value as boolean };
        }

        let num = Number(value);
        if (!Number.isFinite(num) || num < 0) num = 0;
        if (num > 100) num = 100;

        if (field === "real_probability") {
          return { ...row, real_probability: num };
        } else {
          return { ...row, gimmick_probability: num };
        }
      });

      return copy;
    });
  }

  function getTierSums(tier: number) {
    const list = getTierRows(tier);
    let real = 0;
    let gimmick = 0;
    for (const row of list) {
      if (!row.is_active) continue;
      real += row.real_probability ?? 0;
      gimmick += row.gimmick_probability ?? 0;
    }
    return { real, gimmick };
  }

  async function handleSaveTier(tier: number) {
    const list = getTierRows(tier);
    const { real, gimmick } = getTierSums(tier);

    if (real !== 100 || gimmick !== 100) {
      alert(
        `Total probability untuk box ${tier} credit harus 100%.\n\nReal sekarang: ${real}%, Gimmick sekarang: ${gimmick}%.`,
      );
      return;
    }

    setSavingTier(tier);

    try {
      for (const row of list) {
        const { error: updErr } = await supabase
          .from("box_credit_rarity_probs")
          .update({
            is_active: row.is_active,
            real_probability: row.real_probability,
            gimmick_probability: row.gimmick_probability,
          })
          .eq("id", row.id);

        if (updErr) {
          console.error(updErr);
          throw updErr;
        }
      }
    } catch (e: any) {
      console.error(e);
      alert(
        e?.message ||
          "Terjadi kesalahan tak terduga saat menyimpan konfigurasi tier.",
      );
    } finally {
      setSavingTier(null);
    }
  }

  // --- Render ---

  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
              Panel
            </p>
            <h1 className="text-2xl font-semibold">Box & Rewards</h1>
            <p className="text-sm text-slate-400">
              Master data rarity & hadiah per tenant. Di sini Admin bisa
              mengatur probabilitas <span className="font-semibold">real</span>{" "}
              &amp; <span className="font-semibold">gimmick</span> baik untuk
              hadiah di setiap rarity (saat box dibuka), maupun probabilitas
              rarity saat membeli box 1 / 2 / 3 credit.
            </p>
          </div>
          {profile && profile.role === "CS" && (
            <span className="text-[11px] px-3 py-1 rounded-full border border-slate-600 text-slate-300">
              Mode baca saja (role CS)
            </span>
          )}
        </div>

        {loading && (
          <p className="text-sm text-slate-300">Memuat konfigurasi box...</p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {!loading && !error && (
          <>
            {/* BAGIAN 1: Hadiah per rarity */}
            <div className="space-y-4">
              {rows.map((rar) => {
                const { real, gimmick } = getSums(rar);
                const sumOk = real === 100 && gimmick === 100;

                return (
                  <section
                    key={rar.id}
                    className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {rarityBadge(rar)}
                        <span className="text-xs text-slate-400">
                          Kode: {rar.code}
                        </span>
                      </div>
                      <div className="flex flex-col items-start md:items-end gap-1">
                        <span className="text-[11px] text-slate-400">
                          Total Real (aktif):{" "}
                          <span
                            className={
                              real === 100
                                ? "text-emerald-300 font-semibold"
                                : "text-red-300 font-semibold"
                            }
                          >
                            {real}%
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Total Gimmick (aktif):{" "}
                          <span
                            className={
                              gimmick === 100
                                ? "text-emerald-300 font-semibold"
                                : "text-red-300 font-semibold"
                            }
                          >
                            {gimmick}%
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-700/80 bg-slate-950/50 overflow-hidden">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-900/90 border-b border-slate-700/80">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Hadiah
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Tipe
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Nominal
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Real (%)
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Gimmick (%)
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Status
                            </th>
                            {canEdit && (
                              <th className="px-3 py-2 text-left font-semibold text-slate-300">
                                Aksi
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {rar.rewards.length === 0 ? (
                            <tr>
                              <td
                                colSpan={canEdit ? 7 : 6}
                                className="px-3 py-3 text-center text-slate-400"
                              >
                                Belum ada reward untuk rarity ini.
                              </td>
                            </tr>
                          ) : (
                            rar.rewards.map((rw) => (
                              <tr
                                key={rw.id}
                                className="border-t border-slate-800/80"
                              >
                                <td className="px-3 py-2 align-middle">
                                  {rw.label}
                                </td>
                                <td className="px-3 py-2 align-middle text-slate-300">
                                  {rw.reward_type}
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  {formatAmount(rw.amount, rw.reward_type)}
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    disabled={!canEdit}
                                    className="w-20 rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-60"
                                    value={rw.real_probability ?? 0}
                                    onChange={(e) =>
                                      handleRewardChange(
                                        rar.id,
                                        rw.id,
                                        "real_probability",
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    disabled={!canEdit}
                                    className="w-20 rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-60"
                                    value={rw.gimmick_probability ?? 0}
                                    onChange={(e) =>
                                      handleRewardChange(
                                        rar.id,
                                        rw.id,
                                        "gimmick_probability",
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() =>
                                      handleRewardChange(
                                        rar.id,
                                        rw.id,
                                        "is_active",
                                        !rw.is_active,
                                      )
                                    }
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border ${
                                      rw.is_active
                                        ? "border-emerald-500/70 bg-emerald-900/60 text-emerald-200"
                                        : "border-slate-600 bg-slate-800 text-slate-300"
                                    } ${
                                      !canEdit
                                        ? "opacity-60 cursor-not-allowed"
                                        : "cursor-pointer"
                                    }`}
                                  >
                                    {rw.is_active ? "Aktif" : "Non-aktif"}
                                  </button>
                                </td>
                                {canEdit && (
                                  <td className="px-3 py-2 align-middle">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openEditRewardModal(rar, rw)
                                      }
                                      className="inline-flex items-center rounded-lg border border-slate-600 px-3 py-1 text-[11px] text-slate-200 hover:bg-slate-800 transition"
                                    >
                                      Edit
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] text-slate-500">
                        Probabilitas dihitung hanya dari hadiah yang{" "}
                        <span className="font-semibold text-emerald-300">
                          Aktif
                        </span>
                        . Total <span className="font-semibold">Real</span> dan{" "}
                        <span className="font-semibold">Gimmick</span>{" "}
                        masing-masing harus tepat{" "}
                        <span className="font-semibold text-emerald-300">
                          100%
                        </span>
                        .
                      </p>
                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openCreateRewardModal(rar)}
                            className="inline-flex items-center rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 transition"
                          >
                            Tambah Hadiah
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveRarity(rar.id)}
                            disabled={
                              savingRarityId === rar.id ||
                              !rar.rewards.length ||
                              !sumOk
                            }
                            className="inline-flex items-center rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            {savingRarityId === rar.id
                              ? "Menyimpan..."
                              : sumOk
                              ? "Simpan konfigurasi"
                              : "Total belum 100%"}
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* BAGIAN 2: Probabilitas rarity per credit tier */}
            <div className="space-y-4 mt-8">
              <div>
                <h2 className="text-lg font-semibold">
                  Probabilitas Box per Credit
                </h2>
                <p className="text-sm text-slate-400">
                  Mengatur peluang mendapatkan rarity saat membeli box 1 / 2 / 3
                  credit. 2 credit otomatis mulai dari{" "}
                  <span className="font-semibold">Rare</span>, dan 3 credit
                  mulai dari <span className="font-semibold">Epic</span>. Total
                  Real &amp; Gimmick (yang aktif) untuk setiap tier harus 100%.
                </p>
              </div>

              {[1, 2, 3].map((tier) => {
                const tierRows = getTierRows(tier);
                const { real, gimmick } = getTierSums(tier);
                const sumOk = real === 100 && gimmick === 100;

                const title =
                  tier === 1
                    ? "Box 1 Credit"
                    : tier === 2
                    ? "Box 2 Credit (mulai Rare)"
                    : "Box 3 Credit (mulai Epic)";

                return (
                  <section
                    key={tier}
                    className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">{title}</h3>
                      <div className="flex flex-col items-start md:items-end gap-1">
                        <span className="text-[11px] text-slate-400">
                          Total Real (aktif):{" "}
                          <span
                            className={
                              real === 100
                                ? "text-emerald-300 font-semibold"
                                : "text-red-300 font-semibold"
                            }
                          >
                            {real}%
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Total Gimmick (aktif):{" "}
                          <span
                            className={
                              gimmick === 100
                                ? "text-emerald-300 font-semibold"
                                : "text-red-300 font-semibold"
                            }
                          >
                            {gimmick}%
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-700/80 bg-slate-950/50 overflow-hidden">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-900/90 border-b border-slate-700/80">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Rarity
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Real (%)
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Gimmick (%)
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {tierRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-3 py-3 text-center text-slate-400"
                              >
                                Belum ada konfigurasi untuk tier ini.
                              </td>
                            </tr>
                          ) : (
                            tierRows.map((row) => (
                              <tr
                                key={row.id}
                                className="border-t border-slate-800/80"
                              >
                                <td className="px-3 py-2 align-middle">
                                  <div className="flex items-center gap-2">
                                    {rarityBadge(row.rarity)}
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    disabled={!canEdit}
                                    className="w-20 rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-60"
                                    value={row.real_probability}
                                    onChange={(e) =>
                                      handleTierChange(
                                        tier,
                                        row.id,
                                        "real_probability",
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    disabled={!canEdit}
                                    className="w-20 rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-60"
                                    value={row.gimmick_probability}
                                    onChange={(e) =>
                                      handleTierChange(
                                        tier,
                                        row.id,
                                        "gimmick_probability",
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() =>
                                      handleTierChange(
                                        tier,
                                        row.id,
                                        "is_active",
                                        !row.is_active,
                                      )
                                    }
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border ${
                                      row.is_active
                                        ? "border-emerald-500/70 bg-emerald-900/60 text-emerald-200"
                                        : "border-slate-600 bg-slate-800 text-slate-300"
                                    } ${
                                      !canEdit
                                        ? "opacity-60 cursor-not-allowed"
                                        : "cursor-pointer"
                                    }`}
                                  >
                                    {row.is_active ? "Aktif" : "Non-aktif"}
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] text-slate-500">
                        Hanya rarity yang{" "}
                        <span className="font-semibold text-emerald-300">
                          Aktif
                        </span>{" "}
                        yang dihitung dalam total. Total Real dan Gimmick harus
                        masing-masing 100% untuk bisa disimpan.
                      </p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleSaveTier(tier)}
                          disabled={
                            savingTier === tier || !tierRows.length || !sumOk
                          }
                          className="inline-flex items-center rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          {savingTier === tier
                            ? "Menyimpan..."
                            : sumOk
                            ? "Simpan konfigurasi"
                            : "Total belum 100%"}
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal Tambah/Edit Hadiah */}
      {rewardModalOpen && rewardModalRarity && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              {rewardModalMode === "create"
                ? `Tambah Hadiah (${rewardModalRarity.name})`
                : `Edit Hadiah (${rewardModalRarity.name})`}
            </h2>

            <form onSubmit={handleRewardModalSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="rw-label">
                  Nama hadiah
                </label>
                <input
                  id="rw-label"
                  type="text"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="contoh: Saldo 5k / HP Android"
                  value={rewardLabel}
                  onChange={(e) => setRewardLabel(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="rw-type">
                    Tipe
                  </label>
                  <select
                    id="rw-type"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    value={rewardType}
                    onChange={(e) =>
                      setRewardType(
                        e.target.value === "ITEM" ? "ITEM" : "CASH",
                      )
                    }
                  >
                    <option value="CASH">CASH (saldo)</option>
                    <option value="ITEM">ITEM (barang)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    className="text-sm font-medium"
                    htmlFor="rw-amount"
                  >
                    Nominal (untuk CASH)
                  </label>
                  <input
                    id="rw-amount"
                    type="number"
                    min={0}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    placeholder="5000"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(e.target.value)}
                    disabled={rewardType !== "CASH"}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRewardIsActive((v) => !v)}
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs border ${
                    rewardIsActive
                      ? "border-emerald-500/70 bg-emerald-900/60 text-emerald-200"
                      : "border-slate-600 bg-slate-800 text-slate-300"
                  }`}
                >
                  {rewardIsActive ? "Aktif" : "Non-aktif"}
                </button>
                <span className="text-[11px] text-slate-400">
                  Status awal hadiah (bisa diubah lagi dari tabel).
                </span>
              </div>

              {rewardError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                  {rewardError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeRewardModal}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 transition"
                  disabled={rewardSaving}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={rewardSaving || !rewardLabel.trim()}
                  className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {rewardSaving
                    ? "Menyimpan..."
                    : rewardModalMode === "create"
                    ? "Tambah Hadiah"
                    : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
