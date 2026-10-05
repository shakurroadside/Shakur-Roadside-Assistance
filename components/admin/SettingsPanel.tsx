"use client";

import { useState } from "react";
import LocationPicker from "@/components/LocationPicker";
import { AdminState, api, GeoPoint, getPin, money, ServiceKey, setPin } from "@/lib/api";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SettingsPanel({ state, onSaved }: { state: AdminState; onSaved: (s: AdminState) => void }) {
  const s = state.settings;
  const [base, setBase] = useState<GeoPoint | null>(s.base);
  const [markup, setMarkup] = useState(String(s.markupPercent));
  const [driveCost, setDriveCost] = useState(String(s.driveCostPerKm));
  const [services, setServices] = useState(s.services);
  const [workDays, setWorkDays] = useState<number[]>(s.workDays);
  const [slots, setSlots] = useState(s.slots.join(", "));
  const [maxPerSlot, setMaxPerSlot] = useState(String(s.maxJobsPerSlot));
  const [daysAhead, setDaysAhead] = useState(String(s.bookingDaysAhead));
  const [phone, setPhone] = useState(s.phone);
  const [pin, setPinState] = useState(getPin());
  const [msg, setMsg] = useState("");

  const save = async () => {
    setMsg("");
    try {
      const next = await api<AdminState>("/api/admin/settings", {
        body: {
          base,
          markupPercent: +markup,
          driveCostPerKm: +driveCost,
          services,
          workDays,
          slots: slots.split(",").map((x) => x.trim()).filter(Boolean),
          maxJobsPerSlot: +maxPerSlot,
          bookingDaysAhead: +daysAhead,
          phone,
        },
        admin: true,
      });
      onSaved(next);
      setMsg("Saved ✓");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const exampleCost = 150;
  const exampleSell = Math.ceil(exampleCost * (1 + (+markup || 0) / 100));

  return (
    <div className="space-y-4">
      <Section title="Home base" hint="Where your day starts and ends — used to plan routes and pickups.">
        <LocationPicker value={base} onChange={setBase} placeholder="Your base address" />
      </Section>

      <Section title="Pricing">
        <div className="grid grid-cols-2 gap-3">
          <Num label="Tire markup %" value={markup} onChange={setMarkup} />
          <Num label="Driving cost $/km" value={driveCost} onChange={setDriveCost} hint="How much a far-away supplier must save to be worth it" />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Example: supplier cost {money(exampleCost)} → customer pays {money(exampleSell)} per tire.
        </p>
        <div className="mt-3 space-y-2">
          {(Object.keys(services) as ServiceKey[]).map((k) => (
            <div key={k} className="grid grid-cols-[1fr_80px_80px] gap-2 items-end">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Service</label>
                <input
                  value={services[k].label}
                  onChange={(e) => setServices({ ...services, [k]: { ...services[k], label: e.target.value } })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <Num label="Fee $" value={String(services[k].fee)} onChange={(v) => setServices({ ...services, [k]: { ...services[k], fee: +v } })} />
              <Num label="Minutes" value={String(services[k].minutes)} onChange={(v) => setServices({ ...services, [k]: { ...services[k], minutes: +v } })} />
            </div>
          ))}
          <div className="grid grid-cols-[1fr_80px_80px] gap-2 items-end">
            <p className="text-xs text-gray-600 pb-2">Swap extra when tires aren&apos;t on rims (mount &amp; balance)</p>
            <Num
              label="Extra $"
              value={String(services.seasonal_swap.mountFee ?? 0)}
              onChange={(v) => setServices({ ...services, seasonal_swap: { ...services.seasonal_swap, mountFee: +v } })}
            />
          </div>
        </div>
      </Section>

      <Section title="When you work">
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => setWorkDays(workDays.includes(i) ? workDays.filter((x) => x !== i) : [...workDays, i].sort())}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                workDays.includes(i) ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-300"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <label className="block text-xs text-gray-600 mt-3 mb-1">Time slots (24h, comma separated)</label>
        <input value={slots} onChange={(e) => setSlots(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Num label="Jobs per slot" value={maxPerSlot} onChange={setMaxPerSlot} />
          <Num label="Book up to (days ahead)" value={daysAhead} onChange={setDaysAhead} />
        </div>
      </Section>

      <Section title="Business">
        <label className="block text-xs text-gray-600 mb-1">Phone shown to customers</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </Section>

      <Section title="This device" hint="If the server has ADMIN_PIN set, enter it here to unlock the dispatcher screens on this phone/computer.">
        <div className="flex gap-2">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPinState(e.target.value)}
            placeholder="Admin PIN"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => { setPin(pin); setMsg("PIN saved on this device"); }} className="border border-gray-300 rounded-lg px-3 text-sm">
            Save PIN
          </button>
        </div>
      </Section>

      <div className="sticky bottom-0 bg-gray-100 py-3 flex items-center gap-3">
        <button type="button" onClick={save} className="flex-1 bg-brand-600 text-white rounded-xl py-3 font-semibold hover:bg-brand-700">
          Save settings
        </button>
        {msg && <span className="text-sm text-gray-700">{msg}</span>}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
      <h2 className="font-bold text-gray-900">{title}</h2>
      {hint && <p className="text-xs text-gray-500 mb-3">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Num({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}
