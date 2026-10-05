"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminState,
  api,
  DayRoute,
  formatDate,
  formatSlot,
  Job,
  JobStatus,
  money,
  SlotSuggestion,
  STATUS_COLOR,
  STATUS_LABEL,
} from "@/lib/api";

interface Props {
  state: AdminState;
  refresh: () => void;
}

const ACTIVE = (j: Job) => j.status !== "cancelled" && j.status !== "done";

function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function SchedulePanel({ state, refresh }: Props) {
  const { jobs, today, suppliers } = state;
  const [date, setDate] = useState(today);
  const [route, setRoute] = useState<DayRoute | null>(null);

  const dates = useMemo(() => {
    const list = Array.from({ length: Math.max(14, state.settings.bookingDaysAhead) }, (_, i) => addDays(today, i));
    // Include any later dates that have jobs.
    for (const j of jobs) if (j.date > list[list.length - 1] && ACTIVE(j) && !list.includes(j.date)) list.push(j.date);
    return list.sort();
  }, [today, jobs, state.settings.bookingDaysAhead]);

  const countFor = (d: string) => jobs.filter((j) => j.date === d && ACTIVE(j)).length;
  const dayJobs = jobs
    .filter((j) => j.date === date)
    .sort((a, b) => a.slot.localeCompare(b.slot) || a.createdAt.localeCompare(b.createdAt));
  const requests = jobs.filter((j) => j.status === "requested").sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));
  const overdue = jobs.filter((j) => j.date < today && ACTIVE(j));

  useEffect(() => {
    api<DayRoute>(`/api/admin/route?date=${date}`, { admin: true }).then(setRoute).catch(() => setRoute(null));
  }, [date, jobs]);

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name || "—";
  const dayRevenue = dayJobs.filter((j) => j.status !== "cancelled").reduce((s, j) => s + j.total, 0);
  const dayMargin = dayJobs
    .filter((j) => j.status !== "cancelled")
    .reduce((s, j) => s + j.serviceFee + (j.tire ? (j.tire.unitPrice - j.tire.unitCost) * j.tire.qty : 0), 0);

  return (
    <div className="space-y-4">
      {(requests.length > 0 || overdue.length > 0) && (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h2 className="font-bold text-amber-900 mb-2">Needs your attention</h2>
          <ul className="space-y-1 text-sm">
            {requests.map((j) => (
              <li key={j.id}>
                <button type="button" onClick={() => setDate(j.date)} className="text-left hover:underline">
                  🆕 <b>{j.customer.name}</b> — {j.serviceLabel}, {formatDate(j.date)} {formatSlot(j.slot)} (needs confirming)
                </button>
              </li>
            ))}
            {overdue.map((j) => (
              <li key={j.id}>
                <button type="button" onClick={() => setDate(j.date)} className="text-left hover:underline">
                  ⏰ <b>{j.customer.name}</b> — {formatDate(j.date)} still marked “{STATUS_LABEL[j.status]}”
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Day strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {dates.map((d) => {
          const n = countFor(d);
          const active = d === date;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={`shrink-0 rounded-xl px-3 py-2 text-center border ${
                active ? "bg-brand-600 text-white border-brand-600" : "bg-white border-gray-200 hover:border-brand-300"
              }`}
            >
              <div className="text-xs">{d === today ? "Today" : formatDate(d).split(",")[0]}</div>
              <div className="text-sm font-semibold">{formatDate(d).split(", ")[1] || formatDate(d)}</div>
              <div className={`text-[11px] ${active ? "text-brand-100" : n ? "text-brand-700 font-semibold" : "text-gray-400"}`}>
                {n ? `${n} job${n > 1 ? "s" : ""}` : "free"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Route */}
      {route && dayJobs.some(ACTIVE) && (
        <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="font-bold text-gray-900">Route for {date === today ? "today" : formatDate(date)}</h2>
            {route.mapsUrl && (
              <a
                href={route.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-full hover:bg-brand-700"
              >
                🗺 Open in Maps
              </a>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-2">
            ≈ {route.totalKm} km · {route.driveMinutes} min driving · {money(dayRevenue)} booked · {money(dayMargin)} est. profit
          </p>
          <ol className="space-y-1 text-sm">
            {route.stops.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-5 text-gray-400">{i + 1}.</span>
                <span>{s.type === "base" ? "🏠" : s.type === "pickup" ? "📦" : "🔧"}</span>
                <span className={s.type === "pickup" ? "text-purple-700" : "text-gray-800"}>{s.label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Jobs */}
      {dayJobs.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-200 p-6 text-center">No jobs this day.</p>
      ) : (
        dayJobs.map((j) => <JobCard key={j.id} job={j} state={state} supplierName={supplierName(j.supplierId)} refresh={refresh} />)
      )}
    </div>
  );
}

function JobCard({ job, state, supplierName, refresh }: { job: Job; state: AdminState; supplierName: string; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<SlotSuggestion[] | null>(null);
  const [err, setErr] = useState("");
  const phoneDigits = job.customer.phone.replace(/[^\d+]/g, "");
  const margin = job.serviceFee + (job.tire ? (job.tire.unitPrice - job.tire.unitCost) * job.tire.qty : 0);

  const patch = async (body: object) => {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/admin/jobs/${job.id}`, { method: "PATCH", body, admin: true });
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const loadMoves = async () => {
    try {
      const r = await api<{ suggestions: SlotSuggestion[] }>(`/api/admin/reschedule-suggestions/${job.id}`, { admin: true });
      setMoving(r.suggestions);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const confirmText = encodeURIComponent(
    `Hi ${job.customer.name.split(" ")[0]}, this is ${state.settings.businessName}. You're confirmed for ${formatDate(job.date)}, ${formatSlot(
      job.slot
    )} — ${job.serviceLabel}${job.tire ? ` (${job.tire.qty}× ${job.tire.brand} ${job.tire.size})` : ""}. Total ${money(job.total)} + tax. I'll text when I'm on the way!`
  );
  const otwText = encodeURIComponent(`Hi ${job.customer.name.split(" ")[0]}, ${state.settings.businessName} here — I'm on my way now!`);

  return (
    <section className={`bg-white rounded-2xl border border-gray-200 p-4 shadow-sm ${job.status === "cancelled" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-brand-700">{formatSlot(job.slot)}</div>
          <div className="font-bold text-gray-900">{job.customer.name}</div>
          <div className="text-sm text-gray-600">{job.serviceLabel}</div>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLOR[job.status]}`}>{STATUS_LABEL[job.status]}</span>
      </div>

      <div className="mt-2 text-sm space-y-1 text-gray-700">
        <p>
          📍{" "}
          <a
            className="underline"
            target="_blank"
            rel="noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${job.location.lat},${job.location.lng}`}
          >
            {job.location.label || "Location"}
          </a>
        </p>
        {job.onRims === false && (
          <p className="font-medium text-amber-800 bg-amber-50 rounded-lg px-2 py-1">🛠 Tires not on rims — bring the tire machine &amp; balancer</p>
        )}
        {job.vehicle && <p>🚗 {job.vehicle}</p>}
        {job.tire && (
          <p>
            🛞 {job.tire.qty}× {job.tire.brand} {job.tire.model} {job.tire.size}{" "}
            <span className="text-purple-700">from {supplierName}</span>
          </p>
        )}
        {job.notes && <p className="text-gray-500">📝 {job.notes}</p>}
        <p>
          💲 <b>{money(job.total)}</b> <span className="text-gray-500">(profit ≈ {money(margin)})</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <a href={`tel:${phoneDigits}`} className="text-sm border border-gray-300 rounded-full px-3 py-1.5 hover:bg-gray-50">
          📞 Call
        </a>
        <a href={`sms:${phoneDigits}?&body=${confirmText}`} className="text-sm border border-gray-300 rounded-full px-3 py-1.5 hover:bg-gray-50">
          💬 Text confirmation
        </a>
        <a href={`sms:${phoneDigits}?&body=${otwText}`} className="text-sm border border-gray-300 rounded-full px-3 py-1.5 hover:bg-gray-50">
          🚚 On my way
        </a>
        {job.tire && (
          <label className="text-sm border border-gray-300 rounded-full px-3 py-1.5 flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={job.tiresPickedUp} disabled={busy} onChange={(e) => patch({ tiresPickedUp: e.target.checked })} />
            Tires picked up
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <select
          value={job.status}
          disabled={busy}
          onChange={(e) => patch({ status: e.target.value as JobStatus })}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
        >
          {state.statuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {job.status === "requested" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ status: "confirmed" })}
            className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 font-medium"
          >
            ✓ Confirm
          </button>
        )}
        {job.status !== "done" && job.status !== "cancelled" && (
          <button type="button" onClick={moving ? () => setMoving(null) : loadMoves} className="text-sm text-brand-600 font-medium">
            {moving ? "Cancel move" : "Move to a better day"}
          </button>
        )}
      </div>

      {moving && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {moving.length === 0 && <p className="text-sm text-gray-500">No open slots.</p>}
          {moving.map((s) => (
            <button
              key={`${s.date}-${s.slot}`}
              type="button"
              onClick={async () => {
                await patch({ date: s.date, slot: s.slot });
                setMoving(null);
              }}
              className="text-left text-sm border border-gray-200 rounded-xl p-2 hover:border-brand-400"
            >
              <b>{s.dayLabel}</b> {formatSlot(s.slot)}
              <div className="text-xs text-green-700">{s.reason}</div>
            </button>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </section>
  );
}
