import { isSupabaseConfigured } from "@/env";

// Temporary home while Phase 1 screens are built. It reports real state only:
// no buttons until the features behind them exist.
export default function Home() {
  const configured = isSupabaseConfigured();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-24">
      <h1 className="font-[family-name:var(--font-display)] text-6xl leading-none">Stela</h1>
      <p className="text-lg text-muted">Brand guidelines, built, presented and published in one place.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-[var(--radius-card)] border border-line bg-surface p-5 text-sm">
        <dt className="text-muted">Build</dt>
        <dd>Phase 1 in progress</dd>
        <dt className="text-muted">Database</dt>
        <dd>{configured ? "Supabase connected" : "Supabase not configured (see .env.example)"}</dd>
      </dl>
    </main>
  );
}
