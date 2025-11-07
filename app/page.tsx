import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-slate-900/70 border border-slate-700 rounded-2xl shadow-xl p-8 space-y-6">
        <h1 className="text-2xl font-semibold text-center">
          Mystery Box System
        </h1>
        <p className="text-sm text-slate-300 text-center">
          Pilih portal yang ingin kamu akses.
        </p>

        <div className="space-y-4">
          <Link
            href="/panel/login"
            className="block w-full text-center rounded-xl bg-panelAccent/10 border border-panelAccent/50 px-4 py-3 text-sm font-medium hover:bg-panelAccent/20 transition"
          >
            Masuk Panel Admin / CS
          </Link>

          <Link
            href="/member/login"
            className="block w-full text-center rounded-xl bg-memberAccent/10 border border-memberAccent/50 px-4 py-3 text-sm font-medium hover:bg-memberAccent/20 transition"
          >
            Masuk Member Site
          </Link>
        </div>

        <p className="text-[11px] text-slate-500 text-center">
          1 tenant = 1 panel + 1 member site.
        </p>
      </div>
    </main>
  );
}
