"use client";

import { useState } from "react";
import LocationPicker from "@/components/LocationPicker";
import {
  api,
  formatSlot,
  GeoPoint,
  Job,
  money,
  SEASON_LABEL,
  Season,
  SearchResult,
  ServiceKey,
  SlotSuggestion,
  BookableDay,
  TireOption,
  DayWeather,
} from "@/lib/api";

interface Props {
  admin?: boolean;
  services: Record<string, { label: string; fee: number }>;
  onBooked?: (job: Job) => void;
}

const SERVICE_ICON: Record<string, string> = { new_tires: "🛞", seasonal_swap: "🔄", flat_repair: "🔧" };
const SERVICE_HINT: Record<string, string> = {
  new_tires: "I bring new tires and install them where your car is",
  seasonal_swap: "Swap to your own winter/summer tires",
  flat_repair: "Flat tire or put on your spare",
};

type Step = "need" | "results" | "details" | "done";

export default function BookingFlow({ admin = false, services, onBooked }: Props) {
  const [step, setStep] = useState<Step>("need");
  const [service, setService] = useState<ServiceKey>("new_tires");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(4);
  const [season, setSeason] = useState<Season>("any");
  const [location, setLocation] = useState<GeoPoint | null>(null);

  const [result, setResult] = useState<SearchResult | null>(null);
  const [option, setOption] = useState<TireOption | null>(null);
  const [suggestions, setSuggestions] = useState<SlotSuggestion[]>([]);
  const [days, setDays] = useState<BookableDay[]>([]);
  const [showAllDays, setShowAllDays] = useState(false);
  const [pick, setPick] = useState<{ date: string; slot: string; label: string } | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<Job | null>(null);

  const needsTires = service === "new_tires";

  const search = async () => {
    setError("");
    if (!location) return setError("Please share your location or pick an address.");
    if (needsTires && !size.trim()) return setError("Enter your tire size (on the tire sidewall, e.g. 225/65R17).");
    setBusy(true);
    try {
      const r = await api<SearchResult>(admin ? "/api/admin/search" : "/api/public/search", {
        body: { service, size, qty, season, location },
        admin,
      });
      setResult(r);
      setOption(r.options[0] || null);
      setSuggestions(r.suggestions);
      setDays(r.days);
      setPick(r.suggestions[0] ? { date: r.suggestions[0].date, slot: r.suggestions[0].slot, label: r.suggestions[0].dayLabel } : null);
      setStep("results");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // When a different tire is chosen, re-suggest days with that tire's supplier pickups.
  const chooseOption = async (o: TireOption) => {
    setOption(o);
    if (!location) return;
    try {
      const r = await api<{ suggestions: SlotSuggestion[]; days: BookableDay[] }>("/api/public/slots", {
        body: { location, qty, inventoryId: o.inventoryId },
      });
      setSuggestions(r.suggestions);
      setDays(r.days);
      if (r.suggestions[0]) setPick({ date: r.suggestions[0].date, slot: r.suggestions[0].slot, label: r.suggestions[0].dayLabel });
    } catch {
      /* keep previous suggestions */
    }
  };

  const book = async () => {
    setError("");
    if (!pick) return setError("Pick a day and time.");
    if (!name.trim() || !phone.trim()) return setError("Name and phone are required.");
    setBusy(true);
    try {
      const r = await api<{ job: Job }>(admin ? "/api/admin/jobs" : "/api/public/book", {
        body: {
          service,
          qty,
          inventoryId: needsTires ? option?.inventoryId : undefined,
          location,
          date: pick.date,
          slot: pick.slot,
          customer: { name, phone, email },
          vehicle,
          notes: needsTires && !option ? `[Needs tires sourced: ${qty}× ${result?.size || size}] ${notes}` : notes,
        },
        admin,
      });
      setBooked(r.job);
      setStep("done");
      onBooked?.(r.job);
    } catch (e) {
      setError((e as Error).message);
      // Slot or stock may have changed — refresh suggestions.
      if (location) search();
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep("need");
    setResult(null);
    setOption(null);
    setPick(null);
    setBooked(null);
    setName("");
    setPhone("");
    setEmail("");
    setVehicle("");
    setNotes("");
    setError("");
  };

  const serviceFee = services[service]?.fee ?? 0;
  const total = needsTires && option ? option.total : serviceFee;
  const firstSnow = result?.advice.firstSnowDate;

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      {step === "need" && (
        <>
          <Card title="1. What do you need?">
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(services).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setService(k as ServiceKey)}
                  className={`text-left rounded-xl border-2 p-3 transition ${
                    service === k ? "border-brand-600 bg-brand-50" : "border-gray-200 hover:border-brand-300"
                  }`}
                >
                  <div className="text-xl">{SERVICE_ICON[k]}</div>
                  <div className="font-semibold text-sm text-gray-900 mt-1">{v.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{SERVICE_HINT[k]}</div>
                  <div className="text-xs font-medium text-brand-700 mt-1">Service from {money(v.fee)}</div>
                </button>
              ))}
            </div>
          </Card>

          {needsTires && (
            <Card title="2. Your tire size">
              <input
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="e.g. 225/65R17"
                inputMode="text"
                autoCapitalize="characters"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                It&apos;s printed on the side of your tire — three numbers like <b>225/65R17</b>. You can type it with spaces too.
              </p>
              <div className="flex flex-wrap gap-4 mt-3">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">How many?</p>
                  <div className="flex gap-1">
                    {[1, 2, 4].map((n) => (
                      <Chip key={n} active={qty === n} onClick={() => setQty(n)}>
                        {n}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Type</p>
                  <div className="flex flex-wrap gap-1">
                    {(["any", "winter", "all-weather", "all-season"] as Season[]).map((s) => (
                      <Chip key={s} active={season === s} onClick={() => setSeason(s)}>
                        {SEASON_LABEL[s]}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card title={`${needsTires ? "3" : "2"}. Where's your car?`}>
            <LocationPicker value={location} onChange={setLocation} allowGps={!admin} />
          </Card>

          <button
            type="button"
            onClick={search}
            disabled={busy}
            className="w-full bg-brand-600 text-white rounded-xl py-3.5 font-semibold hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {busy ? "Checking stock & schedule…" : needsTires ? "Find tires & best days" : "Find the best days"}
          </button>
        </>
      )}

      {step === "results" && result && (
        <>
          <button type="button" onClick={() => setStep("need")} className="text-sm text-brand-600 font-medium">
            ← Change search
          </button>

          {admin && result.advice?.text && (
            <div className="bg-sky-50 border border-sky-200 text-sky-900 text-sm rounded-xl px-4 py-3">💡 {result.advice.text}</div>
          )}

          {needsTires && (
            <Card title={`Tires in stock for ${result.size} (${qty})`}>
              {result.options.length === 0 ? (
                <div className="text-sm text-gray-600 space-y-1">
                  <p>No supplier has {qty} of this size in stock right now.</p>
                  <p>You can still book a time — I&apos;ll source the tires and call you with a price.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {result.options.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => chooseOption(o)}
                      className={`w-full text-left rounded-xl border-2 p-3 transition ${
                        option?.key === o.key ? "border-brand-600 bg-brand-50" : "border-gray-200 hover:border-brand-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-gray-900">
                              {o.brand} {o.model}
                            </span>
                            {o.tags.map((t) => (
                              <span
                                key={t}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                  t === "Recommended" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {t === "Recommended" ? "⭐ " : ""}
                                {t}
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {SEASON_LABEL[o.season] || o.season} · {money(o.unitPrice)}/tire · {o.inStock} in stock
                          </p>
                          {admin && (
                            <p className="text-xs text-purple-700 mt-1">
                              {o.supplierName} · cost {money(o.supplierCost || 0)}/tire · +{o.pickupDetourKm} km pickup · margin{" "}
                              {money((o.unitPrice - (o.supplierCost || 0)) * o.qty)}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-gray-900">{money(o.total)}</div>
                          <div className="text-[11px] text-gray-500">installed</div>
                        </div>
                      </div>
                    </button>
                  ))}
                  <p className="text-xs text-gray-500">Prices include mobile installation ({money(result.serviceFee)}). Taxes extra.</p>
                </div>
              )}
            </Card>
          )}

          <Card title="Best days for you">
            <p className="text-xs text-gray-500 -mt-1 mb-3">
              I do every job myself — these are the days I&apos;m already working near you, so you get the quickest, most reliable visit.
            </p>
            {suggestions.length === 0 ? (
              <p className="text-sm text-gray-600">I&apos;m fully booked for the next while — please call me.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {suggestions.map((s, i) => {
                  const active = pick?.date === s.date && pick?.slot === s.slot;
                  const beforeSnow = firstSnow && s.date < firstSnow;
                  return (
                    <button
                      key={`${s.date}-${s.slot}`}
                      type="button"
                      onClick={() => setPick({ date: s.date, slot: s.slot, label: s.dayLabel })}
                      className={`text-left rounded-xl border-2 p-3 transition ${
                        active ? "border-brand-600 bg-brand-50" : "border-gray-200 hover:border-brand-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900">{s.dayLabel}</span>
                        {i === 0 && <span className="text-[11px] font-semibold bg-green-600 text-white px-2 py-0.5 rounded-full">Best fit</span>}
                      </div>
                      <div className="text-sm text-gray-700">{formatSlot(s.slot)}</div>
                      <div className="text-xs text-green-700 mt-1">✓ {s.reason}</div>
                      <div className="flex gap-2 mt-1 text-xs text-gray-500">
                        <WeatherChip w={s.weather} />
                        {beforeSnow && <span className="text-sky-700 font-medium">Before the snow</span>}
                      </div>
                      {admin && <div className="text-[11px] text-purple-700 mt-1">+{s.detourKm} km extra driving</div>}
                    </button>
                  );
                })}
              </div>
            )}

            <button type="button" onClick={() => setShowAllDays((v) => !v)} className="mt-3 text-sm text-brand-600 font-medium">
              {showAllDays ? "Hide other times" : "See all available times"}
            </button>
            {showAllDays && (
              <div className="mt-3 space-y-3">
                {days.map((d) => (
                  <div key={d.date}>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      {d.label} <WeatherChip w={d.weather || null} />
                    </div>
                    {d.slots.length === 0 ? (
                      <p className="text-xs text-gray-400">Fully booked</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {d.slots.map((slot) => (
                          <Chip
                            key={slot}
                            active={pick?.date === d.date && pick?.slot === slot}
                            onClick={() => setPick({ date: d.date, slot, label: d.label })}
                          >
                            {formatSlot(slot)}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <button
            type="button"
            disabled={!pick}
            onClick={() => setStep("details")}
            className="w-full bg-brand-600 text-white rounded-xl py-3.5 font-semibold hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {pick ? `Continue — ${pick.label}, ${formatSlot(pick.slot)}` : "Pick a day"}
          </button>
        </>
      )}

      {step === "details" && pick && (
        <>
          <button type="button" onClick={() => setStep("results")} className="text-sm text-brand-600 font-medium">
            ← Back
          </button>
          <Card title="Your booking">
            <dl className="text-sm space-y-1">
              <Row k="Service" v={services[service]?.label} />
              {needsTires && option && <Row k="Tires" v={`${qty}× ${option.brand} ${option.model} ${option.size}`} />}
              {needsTires && !option && <Row k="Tires" v={`${qty}× ${result?.size} — I'll source & quote`} />}
              <Row k="When" v={`${pick.label}, ${formatSlot(pick.slot)}`} />
              <Row k="Where" v={location?.label || ""} />
              <Row k="Total" v={`${money(total)}${needsTires && !option ? " + tires" : ""} + tax`} bold />
            </dl>
          </Card>
          <Card title="Contact details">
            <div className="space-y-3">
              <Field label="Name *" value={name} onChange={setName} placeholder="Your name" />
              <Field label="Phone *" value={phone} onChange={setPhone} placeholder="780-555-0123" type="tel" />
              <Field label="Email" value={email} onChange={setEmail} placeholder="optional" type="email" />
              <Field label="Vehicle" value={vehicle} onChange={setVehicle} placeholder="e.g. 2019 Toyota RAV4" />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Parking spot, wheel locks, where your other tires are…"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </Card>
          <button
            type="button"
            onClick={book}
            disabled={busy}
            className="w-full bg-brand-600 text-white rounded-xl py-3.5 font-semibold hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {busy ? "Booking…" : admin ? "Create job" : "Book it"}
          </button>
        </>
      )}

      {step === "done" && booked && (
        <Card title={admin ? "Job created ✅" : "You're booked ✅"}>
          <div className="text-sm text-gray-700 space-y-1">
            <p>
              <b>{pick?.label}</b>, {formatSlot(booked.slot)}
            </p>
            <p>{booked.serviceLabel}</p>
            {booked.tire && (
              <p>
                {booked.tire.qty}× {booked.tire.brand} {booked.tire.model} {booked.tire.size}
              </p>
            )}
            <p className="font-semibold">Total: {money(booked.total)} + tax</p>
            {!admin && <p className="text-gray-500 pt-2">I&apos;ll text you to confirm and when I&apos;m on the way.</p>}
          </div>
          <button type="button" onClick={reset} className="mt-4 text-sm text-brand-600 font-medium">
            {admin ? "+ Another job" : "Book another"}
          </button>
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
      <h2 className="font-bold text-gray-900 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition ${
        active ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-700 border-gray-300 hover:border-brand-400"
      }`}
    >
      {children}
    </button>
  );
}

function WeatherChip({ w }: { w: DayWeather | null }) {
  if (!w) return null;
  return (
    <span className="text-xs text-gray-500">
      {w.snowCm > 0 ? `🌨 ${w.snowCm}cm snow` : w.max < 7 ? "🥶" : "🌤"} {w.max}°/{w.min}°
    </span>
  );
}

function Row({ k, v, bold }: { k: string; v?: string; bold?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-gray-500">{k}</dt>
      <dd className={`flex-1 ${bold ? "font-bold text-gray-900" : "text-gray-800"}`}>{v}</dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}
