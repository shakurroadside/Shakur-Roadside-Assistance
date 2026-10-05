"use client";

import { useState } from "react";
import Link from "next/link";
import BookingFlow from "@/components/BookingFlow";
import SchedulePanel from "@/components/admin/SchedulePanel";
import SuppliersPanel from "@/components/admin/SuppliersPanel";
import SettingsPanel from "@/components/admin/SettingsPanel";
import { setPin } from "@/lib/api";
import { useAdmin } from "@/lib/useAdmin";

const TABS = [
  { key: "schedule", label: "📅 Schedule" },
  { key: "new", label: "➕ New job" },
  { key: "stock", label: "🛞 Suppliers & stock" },
  { key: "settings", label: "⚙️ Settings" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function JobsPage() {
  const { state, setState, refresh, needsPin, error } = useAdmin();
  const [tab, setTab] = useState<Tab>("schedule");
  const [pin, setPinInput] = useState("");

  const requests = state?.jobs.filter((j) => j.status === "requested").length || 0;

  return (
    <div className="h-screen overflow-y-auto bg-gray-100">
      <header className="bg-brand-600 text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-3xl mx-auto px-4 pt-3 flex items-center gap-3">
          <span className="text-lg font-bold flex-1">🚗 <span className="hidden sm:inline">Shakur Roadside · </span>Jobs</span>
          <Link href="/" className="text-sm text-brand-100 hover:text-white">
            💬 Chat
          </Link>
          <Link href="/book" target="_blank" className="text-sm text-brand-100 hover:text-white">
            Booking page ↗
          </Link>
        </div>
        <nav className="max-w-3xl mx-auto px-2 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 transition ${
                tab === t.key ? "border-white text-white" : "border-transparent text-brand-100 hover:text-white"
              }`}
            >
              {t.label}
              {t.key === "schedule" && requests > 0 && (
                <span className="ml-1 bg-white text-brand-700 text-[11px] font-bold rounded-full px-1.5">{requests}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 pb-16">
        {needsPin && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPin(pin);
              refresh();
            }}
            className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm mx-auto space-y-3"
          >
            <h2 className="font-bold">Enter admin PIN</h2>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPinInput(e.target.value)}
              autoFocus
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5"
            />
            <button className="w-full bg-brand-600 text-white rounded-xl py-2.5 font-semibold">Unlock</button>
          </form>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!state && !needsPin && !error && <p className="text-sm text-gray-500">Loading…</p>}

        {state && tab === "schedule" && <SchedulePanel state={state} refresh={refresh} />}
        {state && tab === "new" && (
          <BookingFlow
            admin
            services={state.settings.services}
            onBooked={() => {
              refresh();
            }}
          />
        )}
        {state && tab === "stock" && <SuppliersPanel state={state} refresh={refresh} />}
        {state && tab === "settings" && <SettingsPanel state={state} onSaved={setState} />}
      </main>
    </div>
  );
}
