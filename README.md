# Mystery Box System

Sistem web **multi-tenant** untuk giveaway / mystery box dengan dua portal:

- **Panel** – untuk Admin / CS:
  - Atur member & credit
  - Atur hadiah & probabilitas box
  - Lihat history transaksi & ledger credit
- **Member Site** – untuk pemain:
  - Login dan melihat saldo credit
  - Beli mystery box (1 / 2 / 3 credit)
  - Menyimpan box di inventory & membuka box (dengan RNG)

Stack utama:

- **Next.js 14** (App Router, TypeScript)
- **Supabase** (Postgres, Auth, RLS, RPC)
- **Vercel** (deployment)
- UI: Tailwind CSS

---

## 1. Struktur High Level

### 1.1. Auth & Tenant

- Auth by **Supabase Email/Password**
- Tabel utama:

#### `public.tenants`

- `id` (uuid, PK)
- `code` (text, unik, contoh: `MB0X1`)
- `name` (text)
- `created_at` (timestamptz)

#### `public.profiles`

- `id` (uuid, PK, sama dengan `auth.users.id`)
- `tenant_id` (uuid, FK → `tenants.id`)
- `email` (text) – mirror dari auth
- `username` (text, unik per tenant, dipakai di member site)
- `role` (enum `user_role`: `ADMIN`, `CS`, `MEMBER`)
- `credit` (integer) – saldo credit member (0 untuk admin/CS)
- `created_at` (timestamptz)

> Catatan:
> - **Panel** login pakai `email + password`
> - **Member** login pakai `username + password`, tapi di belakang tetap disamakan ke `email` (mis. `alipcuy@member.local`).

---

## 2. Kredit & Ledger

### 2.1. Enum

#### `credit_mutation_kind`

- `TOPUP` – tambah credit oleh Admin/CS
- `ADJUSTMENT` – pengurangan credit manual (Adjust -)
- `BOX_PURCHASE` – pengurangan credit karena membeli box

### 2.2. Tabel `public.credit_ledger`

Mencatat semua mutasi credit, source-of-truth saldo.

Kolom penting:

- `id` (uuid, PK)
- `tenant_id` (uuid)
- `member_profile_id` (uuid, nullable) – selalu terisi untuk TOPUP/ADJUST/BOX_PURCHASE
- `delta` (integer) – + / - mutasi credit
- `balance_after` (integer) – saldo credit setelah mutasi
- `kind` (`credit_mutation_kind`)
- `description` (text, nullable) – catatan, contoh: `Topup credit`, `Beli box 2 credit`
- `created_by_profile_id` (uuid, nullable) – siapa yang membuat mutasi (Admin/CS). Untuk transaksi otomatis bisa null.
- `created_at` (timestamptz)

Index:

- `credit_ledger_pkey`
- `credit_ledger_member_idx`
- `credit_ledger_tenant_idx`

### 2.3. Fungsi RPC Credit

Semua update saldo **wajib lewat fungsi**, supaya ledger selalu konsisten:

#### `perform_credit_topup(p_member_id uuid, p_amount integer, p_description text)`

- Hanya untuk **ADMIN/CS** tenant yang sama.
- Menambah credit member (`+p_amount`), update `profiles.credit`.
- Insert 1 baris ke `credit_ledger`:
  - `delta = +p_amount`
  - `kind = 'TOPUP'`
  - `balance_after = saldo baru`
  - `description` diisi dari parameter
  - `created_by_profile_id` = profil admin/CS yang sedang login.
- Return: `TABLE(new_balance integer)`.

#### `perform_credit_adjust_down(p_member_id uuid, p_amount integer, p_description text)`

- Hanya untuk **ADMIN/CS** tenant yang sama.
- Mengurangi credit member (`-p_amount`), tidak boleh minus (< 0).
- Insert `credit_ledger`:
  - `delta = -p_amount`
  - `kind = 'ADJUSTMENT'`.

#### `purchase_box(p_credit_tier integer)`

- Dipanggil dari **Member site** saat membeli box.
- Langkah:
  1. Ambil profil member (`auth.uid()` → `profiles`), cek tenant & role `MEMBER`.
  2. Tentukan harga box dari tier:
     - 1 credit → minimal COMMON
     - 2 credit → start dari RARE
     - 3 credit → start dari EPIC
  3. Cek saldo credit cukup.
  4. Kurangi credit member, update `profiles.credit`.
  5. Insert ke `credit_ledger`:
     - `delta = -harga`
     - `kind = 'BOX_PURCHASE'`
     - `description` contoh: `Beli box 2 credit`.
  6. Insert row baru di `box_transactions` (status `PURCHASED`) dengan:
     - `credit_tier`, `credit_spent`, `expires_at = now() + 7 hari`.

- Return (ringkas): `transaction_id`, `status`, `tier`, `credit_before/after`, `expires_at`.

#### `open_box(p_transaction_id uuid)`

- Dipanggil dari **Member site** saat klik “Buka Box”.
- Validasi:
  - Transaksi milik member yang sedang login.
  - Status `PURCHASED`.
  - Belum `expires_at`.
- RNG:
  - Ambil rarity berdasarkan **probabilitas real** (bukan gimmick) untuk tier dan tenant tersebut.
  - Ambil reward (saldo / item) di dalam rarity tersebut berdasarkan **probabilitas real** juga.
- Update `box_transactions`:
  - `status = 'OPENED'`
  - `rarity`, `reward_label`, `reward_nominal`, `opened_at`.
- Tidak mengubah credit lagi (karena credit sudah terpotong di `purchase_box`).
- Return detail box + reward.

---

## 3. Mystery Box & Rewards

### 3.1. Konsep Rarity & Rewards

Rarity (enum `box_rarity`):

- `COMMON` (hijau)
- `RARE` (biru)
- `EPIC` (ungu)
- `SUPREME` (kuning)
- `LEGENDARY` (emas)
- `SPECIAL_LEGENDARY` (rainbow)

Contoh kategori hadiah (per tenant, bisa diubah admin):

- Common: 5k, 10k, 15k
- Rare: 20k, 25k, 35k
- Epic: 50k, 75k
- Supreme: 100k, 150k
- Legendary: 200k, 250k
- Special Legendary: 300k, 500k, 1.000k, HP Android, fine gold

### 3.2. Tabel `public.box_rewards`

Per tenant & per rarity menyimpan daftar hadiah + probabilitas.

Kolom utama (konseptual):

- `id` (uuid, PK)
- `tenant_id` (uuid)
- `rarity` (`box_rarity`)
- `label` (text) – nama hadiah, mis: `Saldo 5k`, `HP Android`
- `type` (text / enum bebas) – contoh: `CASH` / `ITEM`
- `amount` (integer, untuk hadiah saldo – nullable untuk item fisik)
- `real_percent` (numeric) – probabilitas asli dalam % (dipakai di RNG DB)
- `gimmick_percent` (numeric) – probabilitas yang akan ditampilkan di UI (teaser saja)
- `is_active` (boolean)
- `created_at` (timestamptz)

Constraint di level aplikasi:

- Untuk setiap kombinasi (tenant + rarity + status aktif):
  - Total `real_percent` = **100%**
  - Total `gimmick_percent` = **100%**
- Kalau ada hadiah dinonaktifkan, sisa hadiah aktif tetap dihitung agar total 100%.

---

## 4. Tabel Transaksi Box

### 4.1. Enum `box_transaction_status`

- `PURCHASED` – box sudah dibeli, belum dibuka
- `OPENED` – sudah dibuka
- `EXPIRED` – kadaluarsa (lebih dari 7 hari tidak dibuka)

### 4.2. `public.box_transactions`

Kolom utama:

- `id` (uuid, PK)
- `tenant_id` (uuid)
- `member_profile_id` (uuid)
- `credit_tier` (integer: 1 / 2 / 3)
- `credit_spent` (integer)
- `status` (`box_transaction_status`)
- `rarity` (`box_rarity`, nullable sampai box dibuka)
- `reward_label` (text, nullable)
- `reward_nominal` (integer, nullable)
- `expires_at` (timestamptz)
- `opened_at` (timestamptz, nullable)
- `processed` (boolean) – penanda hadiah sudah diproses Admin/CS
- `processed_at` (timestamptz, nullable)
- `created_at` (timestamptz)

Index:

- `box_transactions_pkey`
- `box_transactions_tenant_idx`
- `box_transactions_member_idx`
- `box_transactions_status_idx`
- `box_transactions_expires_at_idx`

---

## 5. RLS & Helper Function

### 5.1. Helper

- `current_profile_tenant_id() RETURNS uuid`
- `current_profile_role() RETURNS user_role`

Dipakai di policy untuk memastikan semua akses scoped ke tenant & role.

### 5.2. Pola Umum RLS (ringkasan)

- **profiles**
  - Member hanya bisa `SELECT` profilnya sendiri.
  - Admin/CS bisa `SELECT` semua profil di tenant yang sama.
  - Update credit hanya lewat fungsi (topup/adjust/purchase), bukan update langsung.

- **tenants**
  - Admin/CS bisa lihat tenant miliknya.
  - Member hanya baca tenant yang berkaitan dengan profilnya.

- **box_rewards**
  - Select: semua role di tenant yang sama (panel & member).
  - Insert/Update/Delete: hanya Admin di tenant yang sama.
  - Insert via panel UI, bukan langsung bebas.

- **box_transactions**
  - Member: hanya bisa `SELECT` transaksi miliknya sendiri.
  - Panel (Admin/CS): bisa `SELECT` semua transaksi di tenant.
  - Insert `PURCHASED`: hanya lewat fungsi `purchase_box`.
  - Update status / reward: hanya lewat `open_box` dan update `processed` dari Panel.

- **credit_ledger**
  - Insert:
    - Member: hanya via `purchase_box` (kind `BOX_PURCHASE`).
    - Admin/CS: via `perform_credit_topup` & `perform_credit_adjust_down`.
  - Select:
    - Panel: semua ledger di tenant.
    - Member: (opsional, saat ini ledger hanya dipakai panel).

---

## 6. Frontend – Panel

Base route: `/panel`

### 6.1. Auth & Layout

- `/panel/login`
  - Form login **email + password** (Supabase).
  - Setelah sukses, redirect ke `/panel/members` (dashboard awal).
- Layout panel:
  - Sidebar kiri dengan menu:
    - `Members`
    - `Ledger`
    - `History`
    - `Boxes`
  - Bagian atas kanan: email user login dengan dropdown:
    - Ganti password sendiri
    - Logout

### 6.2. Members – `/panel/members`

Fitur:

- Tabel member per tenant:
  - Kolom: Username, Credit, Dibuat, Aksi
- Filter:
  - Search box **username**
- Aksi per member:
  - **Topup**
    - Modal: amount + catatan (description).
    - Memanggil `perform_credit_topup`.
    - Setelah sukses, update credit di UI + pesan sukses.
  - **Adjust (-)**
    - Modal: amount + catatan.
    - Memanggil `perform_credit_adjust_down`.
    - Credit tidak boleh minus.
  - **Password**
    - Modal untuk reset password member (via API route yang memakai service-role Supabase).

- Tombol **New Member**:
  - Modal: username + password.
  - Membuat:
    - User di `auth.users` (email internal, mis: `username@member.local`).
    - Row di `profiles` dengan:
      - `tenant_id` = tenant admin/CS
      - `role = MEMBER`
      - `credit = 0`.

### 6.3. Boxes – `/panel/boxes`

Fitur:

- Tabs per rarity: `Common`, `Rare`, `Epic`, `Supreme`, `Legendary`, `Special Legendary`.
- Per tab, tabel hadiah:
  - Kolom: Nama Hadiah, Type, Nominal, Real (%), Gimmick (%), Status (Aktif).
  - Bisa **tambah / edit / hapus** baris hadiah.
- Validasi sebelum simpan:
  - Hanya menghitung hadiah **aktif**.
  - Total Real(%) = 100.
  - Total Gimmick(%) = 100.
  - Jika tidak 100, tampilkan error dan **tidak boleh** simpan.
- Tombol **Simpan**:
  - Menyimpan ke `public.box_rewards` (upsert).

### 6.4. History – `/panel/history`

Fitur:

- Menampilkan riwayat `box_transactions` per tenant.

Kolom utama:

- Username
- Tier (1/2/3)
- Credit (spent)
- Rarity (kalau sudah dibuka)
- Reward (label / nominal)
- Status (`Purchased` / `Opened` / `Expired`)
- Dibuat (created_at)
- Opened / Expired
- Processed (flag)

Filter:

- Username (search box)
- Status (dropdown)
- Tier (dropdown)

Aksi:

- **Process**:
  - Hanya muncul jika status `OPENED` dan `processed = false`.
  - Klik button akan men-set `processed = true` (dan `processed_at`).
  - Dipakai Admin/CS sebagai penanda hadiah fisik/saldo sudah benar-benar dikirim manual.

### 6.5. Ledger – `/panel/ledger`

Menampilkan `credit_ledger` per tenant.

Kolom:

- Waktu (`created_at`)
- Username member
- Mutasi (contoh: `+10 credit`, `-3 credit`)
- Saldo Akhir (balance_after)
- Jenis:
  - “Topup”
  - “Adjustment (-)”
  - “Beli box”
- Keterangan (`description`)
- Dibuat oleh (email admin/CS, bisa `-` untuk mutasi otomatis)

Filter:

- Search username
- Jenis mutasi: `Semua`, `Topup`, `Adjustment (-)`, `Beli box`.

> Ledger sekarang sudah menampilkan **TOPUP**, **ADJUSTMENT**, dan **BOX_PURCHASE**, jadi total credit akan konsisten dengan mutasi.

---

## 7. Frontend – Member Site

Base route: `/member`

### 7.1. Auth

- `/member/login`
  - Form: **username + password**.
  - Di belakang:
    - Username dikonversi ke email internal (mis: `alipcuy` → `alipcuy@member.local`).
    - Login pakai Supabase Email/Password.

### 7.2. Halaman Utama – `/member`

Bagian atas:

- Judul: **Masuk ke Dunia Fantasy**
- Subjudul: deskripsi singkat.
- Kanan atas:
  - “Login sebagai {username}”
  - Badge credit: `{credit} credit`
  - Tombol Logout.

#### 7.2.1. Pembelian Box

3 kartu box:

1. **Box 1 Credit**
   - Minimal dapat COMMON.
   - Tombol: **Beli Box 1 Credit** → panggil `purchase_box(1)`.

2. **Box 2 Credit**
   - Start dari RARE ke atas (COMMON tidak mungkin).
   - Tombol: **Beli Box 2 Credit** → `purchase_box(2)`.

3. **Box 3 Credit**
   - Start dari EPIC (COMMON & RARE tidak mungkin).
   - Tombol: **Beli Box 3 Credit** → `purchase_box(3)`.

Setelah beli:

- Banner sukses di atas:  
  `Berhasil membeli box 2 credit. Rarity: Rare (RARE).`
- Card “Pembelian Terakhir” yang menampilkan:
  - Tier
  - Rarity (kalau sudah ditentukan oleh RNG beli – optional / sesuai implementasi sekarang)
  - Credit sebelum & sesudah beli
  - Expired date (7 hari)

Credit saldo di header ikut update.

#### 7.2.2. Inventory Box

Section: **Inventory Box Kamu**

- Menampilkan list box dari `box_transactions` dengan:
  - Status `PURCHASED`
  - Belum `expires_at`
- Per item:
  - Info: `Box 1/2/3 Credit`
  - Tanggal kadaluarsa.
  - Tombol **Buka Box**.

Jika box sudah kadaluarsa, back-end (`purchase_box` / scheduled logic) menandai `EXPIRED` dan tidak tampil lagi di inventory.

#### 7.2.3. Buka Box

Tombol **Buka Box** memanggil `open_box(transaction_id)`:

- Jika sukses:
  - Box hilang dari daftar inventory.
  - Banner hijau di atas:  
    `Box 1 credit terbuka! Rarity: Common (COMMON) — Hadiah: Saldo 5k`
  - Card besar **“Box Terakhir Dibuka”** (warna oranye) berisi:
    - Info box (tier, rarity, tenant)
    - Hadiah (label + nominal)
    - Waktu buka
    - Text: *“Setelah ini, hadiah akan ditindaklanjuti oleh Admin / CS via kontak yang disediakan di member site.”*
- Di belakang, `box_transactions` di-update (status `OPENED`) dan `History` di Panel ikut ter-update.

> **Catatan:** Animasi beli & buka box belum dibuat – masih versi statis. Efek “wah” & animasi akan dibuat di tahap berikutnya.

---

## 8. Checkpoint – Status Sekarang

### 8.1. Sudah Selesai

- ✅ Struktur database tenant, profiles, box_rewards, box_transactions, credit_ledger
- ✅ Enum dan fungsi helper (role & tenant)
- ✅ RLS dasar untuk semua tabel core (tenant, profiles, box_rewards, box_transactions, credit_ledger)
- ✅ RPC:
  - `perform_credit_topup`
  - `perform_credit_adjust_down`
  - `purchase_box`
  - `open_box`
- ✅ Panel:
  - Login Admin/CS
  - Sidebar + layout dasar
  - Members:
    - List member by tenant
    - New member
    - Topup
    - Adjust (-)
    - Reset password member
  - Boxes:
    - CRUD hadiah per rarity
    - Validasi real/gimmick % = 100% (aktif saja)
  - History:
    - List transaksi box
    - Filter (username, status, tier)
    - Tombol Process untuk transaksi OPENED
  - Ledger:
    - List mutasi credit (TOPUP, ADJUSTMENT, BOX_PURCHASE)
    - Filter username & jenis mutasi
- ✅ Member site:
  - Login username+password
  - Info credit
  - Beli box 1/2/3 credit (terhubung ke `purchase_box`)
  - Inventory box + tombol Buka Box (terhubung ke `open_box`)
  - Card “Box Terakhir Dibuka”

### 8.2. TODO Berikutnya

Fokus terbesar berikutnya: **mempercantik Member Site + experience buka box.**

Beberapa ide/PR konkret:

1. **Tema Fantasy RPG di Member Site**
   - Background gradien / ilustrasi bertema fantasy.
   - Font title yang lebih “magical”.
   - Card box yang lebih seperti “chest / loot box”.

2. **Animasi**
   - Animasi saat **beli box** (mis. chest muncul / gem berputar).
   - Animasi saat **buka box**:
     - Glow / particle effect
     - Reveal rarity dengan warna berbeda (Common hijau, Rare biru, dst).
     - Hentakan kecil saat hadiah muncul.

3. **UI probabilitas “gimmick”**
   - Tombol info di member site: “Lihat peluang hadiah”.
   - Menampilkan probability gimmick (yang di-set di Panel, bukan real) per tier dan rarity:
     - `1 credit` → breakdown gimmick
     - `2 credit` → start dari Rare
     - `3 credit` → start dari Epic
   - Data diambil dari `box_rewards` (field gimmick).

4. **UX lainnya**
   - Link / tombol “Hubungi Admin/CS” (WhatsApp / Telegram) setelah box dibuka.
   - Notifikasi kalau ada box yang kadaluarsa (opsional).
   - Pagination / infinite scroll untuk History & Ledger kalau data sudah banyak.

5. **Hardening & nice-to-have**
   - Tambah loading skeleton yang lebih halus di semua list.
   - Tambah guard ekstra di client (mis. disable tombol kalau kredit tidak cukup, di samping check di RPC).
   - Dokumentasi singkat untuk cara setup tenant baru (seed SQL / manual steps).

---

## 9. Environment Variables (ringkas)

Minimal env yang dipakai Next.js:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Untuk API route (admin actions):

- `SUPABASE_SERVICE_ROLE_KEY`  
  → **hanya dipakai di server-side** (API route / server action), jangan pernah expose ke client.

---

Checkpoint README ini menggambarkan kondisi project **per sekarang**.  
Nanti kalau kita sudah mulai masuk ke tema Fantasy RPG + animasi + gimmick probability, README ini bisa di-update di bagian **TODO** dan deskripsi Member Site. Setelah README ini kamu commit, kita bisa langsung lanjut ngulik tampilan dan animasi di member site 😄
