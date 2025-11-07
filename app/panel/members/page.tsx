"use client";

import {
  FormEvent,
  useEffect,
  useState
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type CurrentProfile = {
  id: string;
  tenant_id: string | null;
  role: "ADMIN" | "CS" | "MEMBER";
  username: string | null;
};

type MemberRow = {
  id: string;
  username: string | null;
  credit_balance: number;
  created_at: string;
};

async function getAccessToken() {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("No active session");
  }
  return session.access_token;
}

export default function PanelMembersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(
    null
  );
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filter username
  const [filterUsername, setFilterUsername] = useState("");

  // Dropdown akun sendiri
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [selfPwdModalOpen, setSelfPwdModalOpen] = useState(false);
  const [selfPwdNew, setSelfPwdNew] = useState("");
  const [selfPwdConfirm, setSelfPwdConfirm] = useState("");
  const [selfPwdError, setSelfPwdError] = useState<string | null>(null);
  const [selfPwdLoading, setSelfPwdLoading] = useState(false);

  // Modal Topup
  const [topupMember, setTopupMember] = useState<MemberRow | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupNote, setTopupNote] = useState("");
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupLoading, setTopupLoading] = useState(false);

  // Modal Adjust (-)
  const [adjustMember, setAdjustMember] = useState<MemberRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustLoading, setAdjustLoading] = useState(false);

  // Modal Password member
  const [memberPwdMember, setMemberPwdMember] = useState<MemberRow | null>(
    null
  );
  const [memberPwdNew, setMemberPwdNew] = useState("");
  const [memberPwdConfirm, setMemberPwdConfirm] = useState("");
  const [memberPwdError, setMemberPwdError] = useState<string | null>(null);
  const [memberPwdLoading, setMemberPwdLoading] = useState(false);

  // Modal New Member
  const [newMemberModalOpen, setNewMemberModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [newInitialCredit, setNewInitialCredit] = useState("");
  const [newMemberError, setNewMemberError] = useState<string | null>(null);
  const [newMemberLoading, setNewMemberLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      // 1) Cek user login
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
        router.push("/panel/login");
        return;
      }

      setCurrentUserEmail(user.email ?? null);

      // 2) Ambil profile current user (untuk tenant & role)
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, tenant_id, role, username")
        .eq("id", user.id)
        .maybeSingle<CurrentProfile>();

      if (profileError) {
        console.error(profileError);
        setError("Gagal membaca profil.");
        setLoading(false);
        return;
      }

      if (!profile) {
        setError("Profil belum dibuat untuk user ini.");
        setLoading(false);
        return;
      }

      if (!profile.tenant_id) {
        setError("User ini belum terhubung ke tenant mana pun.");
        setLoading(false);
        return;
      }

      if (profile.role !== "ADMIN" && profile.role !== "CS") {
        setError("Hanya Admin / CS yang boleh mengakses halaman member.");
        setLoading(false);
        return;
      }

      setCurrentProfile(profile);

      // 3) Ambil semua member di tenant yang sama
      const { data: memberRows, error: membersError } = await supabase
        .from("profiles")
        .select("id, username, credit_balance, created_at")
        .eq("tenant_id", profile.tenant_id)
        .eq("role", "MEMBER")
        .order("created_at", { ascending: true });

      if (membersError) {
        console.error(membersError);
        setError("Gagal mengambil daftar member.");
        setLoading(false);
        return;
      }

      setMembers(memberRows ?? []);
      setLoading(false);
    }

    load();
  }, [router]);

  function formatDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("id-ID", {
        dateStyle: "short",
        timeStyle: "short"
      });
    } catch {
      return iso;
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/panel/login");
  }

  // --- Self password (akun sendiri) ---

  function openSelfPasswordModal() {
    setSelfPwdModalOpen(true);
    setSelfPwdNew("");
    setSelfPwdConfirm("");
    setSelfPwdError(null);
    setUserMenuOpen(false);
  }

  function closeSelfPasswordModal() {
    setSelfPwdModalOpen(false);
    setSelfPwdNew("");
    setSelfPwdConfirm("");
    setSelfPwdError(null);
    setSelfPwdLoading(false);
  }

  async function handleSelfPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setSelfPwdError(null);

    if (!selfPwdNew || selfPwdNew.length < 6) {
      setSelfPwdError("Password minimal 6 karakter.");
      return;
    }
    if (selfPwdNew !== selfPwdConfirm) {
      setSelfPwdError("Konfirmasi password tidak sama.");
      return;
    }

    setSelfPwdLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: selfPwdNew
      });

      if (updateError) {
        console.error(updateError);
        setSelfPwdError(
          updateError.message || "Gagal mengubah password akun sendiri."
        );
        setSelfPwdLoading(false);
        return;
      }

      closeSelfPasswordModal();
    } catch (err) {
      console.error(err);
      setSelfPwdError("Terjadi kesalahan tak terduga.");
      setSelfPwdLoading(false);
    }
  }

  // --- Topup ---

  function openTopupModal(member: MemberRow) {
    setTopupMember(member);
    setTopupAmount("");
    setTopupNote("");
    setTopupError(null);
  }

  function closeTopupModal() {
    setTopupMember(null);
    setTopupAmount("");
    setTopupNote("");
    setTopupError(null);
    setTopupLoading(false);
  }

  async function handleTopupSubmit(e: FormEvent) {
    e.preventDefault();
    if (!topupMember) return;

    setTopupError(null);

    const amountInt = parseInt(topupAmount, 10);
    if (!Number.isFinite(amountInt) || amountInt <= 0) {
      setTopupError("Jumlah credit harus lebih besar dari 0.");
      return;
    }

    setTopupLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "perform_credit_topup",
        {
          p_member_id: topupMember.id,
          p_amount: amountInt,
          p_description: topupNote || null
        }
      );

      if (rpcError) {
        console.error(rpcError);
        setTopupError(rpcError.message || "Gagal melakukan topup.");
        setTopupLoading(false);
        return;
      }

      const newBalance =
        Array.isArray(data) && data.length > 0 && data[0].new_balance != null
          ? (data[0].new_balance as number)
          : topupMember.credit_balance + amountInt;

      // Update state members
      setMembers((prev) =>
        prev.map((m) =>
          m.id === topupMember.id
            ? { ...m, credit_balance: newBalance }
            : m
        )
      );

      closeTopupModal();
    } catch (err) {
      console.error(err);
      setTopupError("Terjadi kesalahan tak terduga.");
      setTopupLoading(false);
    }
  }

  // --- Adjust (-) ---

  function openAdjustModal(member: MemberRow) {
    setAdjustMember(member);
    setAdjustAmount("");
    setAdjustNote("");
    setAdjustError(null);
  }

  function closeAdjustModal() {
    setAdjustMember(null);
    setAdjustAmount("");
    setAdjustNote("");
    setAdjustError(null);
    setAdjustLoading(false);
  }

  async function handleAdjustSubmit(e: FormEvent) {
    e.preventDefault();
    if (!adjustMember) return;

    setAdjustError(null);

    const amountInt = parseInt(adjustAmount, 10);
    if (!Number.isFinite(amountInt) || amountInt <= 0) {
      setAdjustError("Jumlah credit yang dikurangi harus > 0.");
      return;
    }

    setAdjustLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "perform_credit_adjust_down",
        {
          p_member_id: adjustMember.id,
          p_amount: amountInt,
          p_description: adjustNote || null
        }
      );

      if (rpcError) {
        console.error(rpcError);
        setAdjustError(rpcError.message || "Gagal melakukan adjust.");
        setAdjustLoading(false);
        return;
      }

      const newBalance =
        Array.isArray(data) && data.length > 0 && data[0].new_balance != null
          ? (data[0].new_balance as number)
          : adjustMember.credit_balance - amountInt;

      setMembers((prev) =>
        prev.map((m) =>
          m.id === adjustMember.id
            ? { ...m, credit_balance: newBalance }
            : m
        )
      );

      closeAdjustModal();
    } catch (err) {
      console.error(err);
      setAdjustError("Terjadi kesalahan tak terduga.");
      setAdjustLoading(false);
    }
  }

  // --- Password member ---

  function openMemberPasswordModal(member: MemberRow) {
    setMemberPwdMember(member);
    setMemberPwdNew("");
    setMemberPwdConfirm("");
    setMemberPwdError(null);
  }

  function closeMemberPasswordModal() {
    setMemberPwdMember(null);
    setMemberPwdNew("");
    setMemberPwdConfirm("");
    setMemberPwdError(null);
    setMemberPwdLoading(false);
  }

  async function handleMemberPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!memberPwdMember) return;

    setMemberPwdError(null);

    if (!memberPwdNew || memberPwdNew.length < 6) {
      setMemberPwdError("Password minimal 6 karakter.");
      return;
    }
    if (memberPwdNew !== memberPwdConfirm) {
      setMemberPwdError("Konfirmasi password tidak sama.");
      return;
    }

    setMemberPwdLoading(true);

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/panel/members/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          memberId: memberPwdMember.id,
          newPassword: memberPwdNew
        })
      });

      const json = await res.json();

      if (!res.ok) {
        setMemberPwdError(json.error || "Gagal mengubah password member.");
        setMemberPwdLoading(false);
        return;
      }

      closeMemberPasswordModal();
    } catch (err) {
      console.error(err);
      setMemberPwdError("Terjadi kesalahan tak terduga.");
      setMemberPwdLoading(false);
    }
  }

  // --- New Member ---

  function openNewMemberModal() {
    setNewMemberModalOpen(true);
    setNewUsername("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setNewInitialCredit("");
    setNewMemberError(null);
  }

  function closeNewMemberModal() {
    setNewMemberModalOpen(false);
    setNewUsername("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setNewInitialCredit("");
    setNewMemberError(null);
    setNewMemberLoading(false);
  }

  async function handleNewMemberSubmit(e: FormEvent) {
    e.preventDefault();
    setNewMemberError(null);

    const username = newUsername.trim();
    const password = newPassword;
    const initialCredit = newInitialCredit.trim()
      ? parseInt(newInitialCredit, 10)
      : 0;

    if (!username) {
      setNewMemberError("Username wajib diisi.");
      return;
    }
    if (!password) {
      setNewMemberError("Password wajib diisi.");
      return;
    }
    if (password !== newPasswordConfirm) {
      setNewMemberError("Konfirmasi password tidak sama.");
      return;
    }
    if (Number.isNaN(initialCredit) || initialCredit < 0) {
      setNewMemberError("Initial credit harus angka 0 atau lebih.");
      return;
    }

    setNewMemberLoading(true);

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/panel/members/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ username, password, initialCredit })
      });

      const json = await res.json();

      if (!res.ok) {
        setNewMemberError(json.error || "Gagal membuat member.");
        setNewMemberLoading(false);
        return;
      }

      const created: MemberRow = json.member;
      setMembers((prev) => [...prev, created]);
      setNewMemberLoading(false);
      setNewMemberModalOpen(false);
      setNewUsername("");
      setNewPassword("");
      setNewInitialCredit("");
      closeNewMemberModal();
    } catch (err) {
      console.error(err);
      setNewMemberError("Terjadi kesalahan tak terduga.");
      setNewMemberLoading(false);
    }
  }

  const filteredMembers = members.filter((m) => {
    if (!filterUsername.trim()) return true;
    const u = (m.username || "").toLowerCase();
    return u.includes(filterUsername.trim().toLowerCase());
  });

  const displayName =
    currentProfile?.username || currentUserEmail || "Akun Panel";

  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
              Panel
            </p>
            <h1 className="text-2xl font-semibold">Members</h1>
            <p className="text-sm text-slate-400">
              Daftar member di tenant yang sama. Bisa topup dan adjust credit
              dari Panel.
            </p>
          </div>

          {/* Dropdown akun */}
          <div className="relative inline-flex">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="inline-flex items-center rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium hover:bg-slate-800 transition"
            >
              <span className="mr-2 truncate max-w-[160px]">{displayName}</span>
              <span className="text-slate-400">▾</span>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-700 bg-slate-900/95 shadow-lg text-xs overflow-hidden z-20">
                <button
                  type="button"
                  onClick={openSelfPasswordModal}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800"
                >
                  Ubah password saya
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    void handleLogout();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 text-red-300"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filter + New Member */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Filter username
            </label>
            <input
              type="text"
              value={filterUsername}
              onChange={(e) => setFilterUsername(e.target.value)}
              placeholder="cari username..."
              className="w-full max-w-xs rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            />
          </div>

          <button
            type="button"
            onClick={openNewMemberModal}
            className="self-start inline-flex items-center rounded-lg border border-emerald-500/70 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 transition"
          >
            New Member
          </button>
        </div>

        {loading && (
          <p className="text-sm text-slate-300">Memuat data member...</p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900/70">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/90 border-b border-slate-700/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">
                    Username
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">
                    Credit
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">
                    Dibuat
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-slate-400"
                    >
                      Tidak ada member yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((m) => (
                    <tr
                      key={m.id}
                      className="border-t border-slate-800/80 hover:bg-slate-800/60"
                    >
                      <td className="px-4 py-3 align-middle">
                        {m.username ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {m.credit_balance} credit
                      </td>
                      <td className="px-4 py-3 align-middle text-slate-400">
                        {formatDate(m.created_at)}
                      </td>
                      <td className="px-4 py-3 align-middle text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => openTopupModal(m)}
                          className="inline-flex items-center rounded-lg border border-emerald-500/60 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/10 transition"
                        >
                          Topup
                        </button>
                        <button
                          type="button"
                          onClick={() => openAdjustModal(m)}
                          className="inline-flex items-center rounded-lg border border-amber-500/70 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/10 transition"
                        >
                          Adjust (-)
                        </button>
                        <button
                          type="button"
                          onClick={() => openMemberPasswordModal(m)}
                          className="inline-flex items-center rounded-lg border border-slate-500/70 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/40 transition"
                        >
                          Password
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Self Password */}
      {selfPwdModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Ubah password akun saya</h2>
            <form onSubmit={handleSelfPasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="self-pwd-new">
                  Password baru
                </label>
                <input
                  id="self-pwd-new"
                  type="password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  value={selfPwdNew}
                  onChange={(e) => setSelfPwdNew(e.target.value)}
                  placeholder="min. 6 karakter"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="self-pwd-confirm"
                >
                  Konfirmasi password baru
                </label>
                <input
                  id="self-pwd-confirm"
                  type="password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  value={selfPwdConfirm}
                  onChange={(e) => setSelfPwdConfirm(e.target.value)}
                />
              </div>

              {selfPwdError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                  {selfPwdError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeSelfPasswordModal}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 transition"
                  disabled={selfPwdLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={selfPwdLoading}
                  className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {selfPwdLoading ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal New Member */}
      {newMemberModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 space-y-4">
            <h2 className="text-lg font-semibold">New Member</h2>
            <p className="text-xs text-slate-400">
              Email internal akan otomatis dibuat sebagai{" "}
              <span className="font-mono">username@member.local</span>.
            </p>

            <form onSubmit={handleNewMemberSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="nm-username">
                  Username
                </label>
                <input
                  id="nm-username"
                  type="text"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="contoh: alipcuy"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="nm-password">
                  Password
                </label>
                <input
                  id="nm-password"
                  type="password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="nm-password-confirm">
                  Konfirmasi password
                </label>
                <input
                  id="nm-password-confirm"
                  type="password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="ulang password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                />
              </div>

              {newMemberError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                  {newMemberError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeNewMemberModal}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 transition"
                  disabled={newMemberLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    newMemberLoading ||
                    !newUsername.trim() ||
                    !newPassword ||
                    !newPasswordConfirm
                  }
                  className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {newMemberLoading ? "Membuat..." : "Simpan Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Topup */}
      {topupMember && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              Topup Credit – {topupMember.username ?? "Tanpa username"}
            </h2>
            <p className="text-xs text-slate-400">
              Credit saat ini:{" "}
              <span className="font-mono text-emerald-300">
                {topupMember.credit_balance}
              </span>
            </p>

            <form onSubmit={handleTopupSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="topup-amount">
                  Jumlah credit
                </label>
                <input
                  id="topup-amount"
                  type="number"
                  min={1}
                  step={1}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="contoh: 10"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="topup-note">
                  Catatan (opsional)
                </label>
                <textarea
                  id="topup-note"
                  rows={2}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                  placeholder="mis. Topup manual dari CS"
                  value={topupNote}
                  onChange={(e) => setTopupNote(e.target.value)}
                />
              </div>

              {topupError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                  {topupError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeTopupModal}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 transition"
                  disabled={topupLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={topupLoading || !topupAmount}
                  className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {topupLoading ? "Memproses..." : "Simpan Topup"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adjust */}
      {adjustMember && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              Adjust Credit (–) – {adjustMember.username ?? "Tanpa username"}
            </h2>
            <p className="text-xs text-slate-400">
              Credit saat ini:{" "}
              <span className="font-mono text-emerald-300">
                {adjustMember.credit_balance}
              </span>
            </p>

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="adjust-amount">
                  Jumlah yang dikurangi
                </label>
                <input
                  id="adjust-amount"
                  type="number"
                  min={1}
                  step={1}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  placeholder="contoh: 5"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="adjust-note">
                  Catatan (opsional)
                </label>
                <textarea
                  id="adjust-note"
                  rows={2}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
                  placeholder="mis. koreksi saldo"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                />
              </div>

              {adjustError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                  {adjustError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeAdjustModal}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 transition"
                  disabled={adjustLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading || !adjustAmount}
                  className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {adjustLoading ? "Memproses..." : "Simpan Adjust"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Password Member */}
      {memberPwdMember && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              Ubah password member –{" "}
              {memberPwdMember.username ?? "Tanpa username"}
            </h2>

            <form onSubmit={handleMemberPasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="member-pwd-new"
                >
                  Password baru
                </label>
                <input
                  id="member-pwd-new"
                  type="password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
                  value={memberPwdNew}
                  onChange={(e) => setMemberPwdNew(e.target.value)}
                  placeholder="min. 6 karakter"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="member-pwd-confirm"
                >
                  Konfirmasi password baru
                </label>
                <input
                  id="member-pwd-confirm"
                  type="password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
                  value={memberPwdConfirm}
                  onChange={(e) => setMemberPwdConfirm(e.target.value)}
                />
              </div>

              {memberPwdError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
                  {memberPwdError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeMemberPasswordModal}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 transition"
                  disabled={memberPwdLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={memberPwdLoading}
                  className="rounded-lg bg-slate-600 px-4 py-1.5 text-xs font-semibold text-slate-50 hover:bg-slate-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {memberPwdLoading ? "Menyimpan..." : "Simpan password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
