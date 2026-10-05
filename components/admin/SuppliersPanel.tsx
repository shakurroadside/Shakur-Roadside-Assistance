"use client";

import { useMemo, useRef, useState } from "react";
import LocationPicker from "@/components/LocationPicker";
import { AdminState, api, GeoPoint, InventoryItem, money, SEASON_LABEL, Supplier } from "@/lib/api";

interface Props {
  state: AdminState;
  refresh: () => void;
}

interface ImportResult {
  added: number;
  updated: number;
  errors: string[];
}

function normalizeSize(input: string) {
  const s = input.toUpperCase().replace(/^(P|LT|ST)/, "").replace(/ZR|R|-|\/|\s+/g, " ").trim();
  const m = s.match(/^(\d{3})\s+(\d{2})\s+(\d{2})$/) || s.replace(/\s+/g, "").match(/^(\d{3})(\d{2})(\d{2})$/);
  return m ? `${m[1]}/${m[2]}R${m[3]}` : null;
}

export default function SuppliersPanel({ state, refresh }: Props) {
  const { suppliers, inventory, settings } = state;
  const [adding, setAdding] = useState(false);
  const [lookup, setLookup] = useState("");
  const [msg, setMsg] = useState<{ text: string; errors?: string[] } | null>(null);
  const bulkRef = useRef<HTMLInputElement>(null);

  const lookupSize = normalizeSize(lookup);
  const lookupRows = useMemo(
    () =>
      lookupSize
        ? inventory
            .filter((i) => i.size === lookupSize)
            .map((i) => ({ i, s: suppliers.find((x) => x.id === i.supplierId) }))
            .filter((r) => r.s)
            .sort((a, b) => a.i.cost - b.i.cost)
        : [],
    [lookupSize, inventory, suppliers]
  );

  const bulkImport = async (file: File) => {
    const csv = await file.text();
    try {
      const r = await api<ImportResult>("/api/admin/inventory/import", { body: { csv, mode: "merge" }, admin: true });
      setMsg({ text: `Imported: ${r.added} new, ${r.updated} updated.`, errors: r.errors });
      refresh();
    } catch (e) {
      setMsg({ text: (e as Error).message });
    }
  };

  const loadSample = async () => {
    await api("/api/admin/sample-data", { body: {}, admin: true });
    refresh();
  };

  return (
    <div className="space-y-4">
      {/* Quick lookup — for when a customer calls */}
      <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <h2 className="font-bold text-gray-900 mb-2">Quick stock check</h2>
        <input
          value={lookup}
          onChange={(e) => setLookup(e.target.value)}
          placeholder="Tire size, e.g. 225/65R17"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {lookup && !lookupSize && <p className="text-xs text-gray-500 mt-1">Keep typing a full size…</p>}
        {lookupSize && (
          <div className="mt-3 overflow-x-auto">
            {lookupRows.length === 0 ? (
              <p className="text-sm text-gray-500">No supplier lists {lookupSize}.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr>
                    <th className="py-1 pr-2">Tire</th>
                    <th className="pr-2">Supplier</th>
                    <th className="pr-2 text-right">Cost</th>
                    <th className="pr-2 text-right">Sell</th>
                    <th className="text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {lookupRows.map(({ i, s }) => (
                    <tr key={i.id} className={`border-t border-gray-100 ${i.qty === 0 ? "text-gray-400" : ""}`}>
                      <td className="py-1.5 pr-2">
                        {i.brand} {i.model} <span className="text-xs text-gray-500">{SEASON_LABEL[i.season] || i.season}</span>
                      </td>
                      <td className="pr-2">{s!.name}</td>
                      <td className="pr-2 text-right">{money(i.cost)}</td>
                      <td className="pr-2 text-right font-medium">{money(Math.ceil(i.cost * (1 + settings.markupPercent / 100)))}</td>
                      <td className="text-right">{i.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* Import */}
      <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <h2 className="font-bold text-gray-900 mb-1">Upload supplier stock (CSV)</h2>
        <p className="text-xs text-gray-500 mb-3">
          Columns: <code>supplier, size, brand, model, season, cost, qty, sku</code>. Headers like “Tire Size”, “Price” or “Stock” work too.
          Export from Excel/Sheets as CSV. Use the upload button on a supplier card below to replace just that supplier&apos;s list.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => bulkRef.current?.click()}
            className="bg-brand-600 text-white text-sm font-semibold rounded-xl px-4 py-2 hover:bg-brand-700"
          >
            ⬆ Upload CSV (all suppliers)
          </button>
          <a href="/tire-inventory-template.csv" download className="text-sm border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-50">
            ⬇ Template
          </a>
          <button type="button" onClick={() => setAdding((v) => !v)} className="text-sm border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-50">
            + Add supplier
          </button>
          {suppliers.length === 0 && (
            <button type="button" onClick={loadSample} className="text-sm text-gray-500 underline px-2">
              Load demo data to try it
            </button>
          )}
        </div>
        <input
          ref={bulkRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) bulkImport(f);
            e.target.value = "";
          }}
        />
        {msg && <ImportMessage msg={msg} />}
      </section>

      {adding && <SupplierForm onDone={() => { setAdding(false); refresh(); }} />}

      {suppliers.length === 0 && !adding && (
        <p className="text-sm text-gray-500 text-center py-6">
          No suppliers yet. Add your tire suppliers (with their location), then upload their stock lists.
        </p>
      )}

      {suppliers.map((s) => (
        <SupplierCard key={s.id} supplier={s} items={inventory.filter((i) => i.supplierId === s.id)} refresh={refresh} />
      ))}
    </div>
  );
}

function ImportMessage({ msg }: { msg: { text: string; errors?: string[] } }) {
  return (
    <div className="mt-3 text-sm">
      <p className="text-gray-800">{msg.text}</p>
      {msg.errors && msg.errors.length > 0 && (
        <details className="mt-1 text-amber-700">
          <summary className="cursor-pointer">{msg.errors.length} row(s) skipped</summary>
          <ul className="list-disc ml-5 text-xs mt-1 space-y-0.5">
            {msg.errors.slice(0, 50).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SupplierForm({ supplier, onDone }: { supplier?: Supplier; onDone: () => void }) {
  const [name, setName] = useState(supplier?.name || "");
  const [phone, setPhone] = useState(supplier?.phone || "");
  const [notes, setNotes] = useState(supplier?.notes || "");
  const [loc, setLoc] = useState<GeoPoint | null>(supplier?.location || null);
  const [err, setErr] = useState("");

  const save = async () => {
    setErr("");
    try {
      await api(supplier ? `/api/admin/suppliers/${supplier.id}` : "/api/admin/suppliers", {
        method: supplier ? "PATCH" : "POST",
        body: { name, phone, notes, location: loc },
        admin: true,
      });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <section className="bg-white rounded-2xl border-2 border-brand-200 p-4 shadow-sm space-y-3">
      <h2 className="font-bold text-gray-900">{supplier ? "Edit supplier" : "New supplier"}</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Supplier name (must match the CSV 'supplier' column)" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm" />
      <div>
        <p className="text-xs font-medium text-gray-600 mb-1">Pickup location</p>
        <LocationPicker value={loc} onChange={setLoc} allowGps placeholder="Supplier address" />
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (hours, account #, contact)" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm" />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="flex-1 border border-gray-300 rounded-xl py-2 text-sm">
          Cancel
        </button>
        <button type="button" onClick={save} className="flex-1 bg-brand-600 text-white rounded-xl py-2 text-sm font-semibold">
          Save
        </button>
      </div>
    </section>
  );
}

function SupplierCard({ supplier, items, refresh }: { supplier: Supplier; items: InventoryItem[]; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [msg, setMsg] = useState<{ text: string; errors?: string[] } | null>(null);
  const [filter, setFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const shown = items
    .filter((i) => !filter || `${i.size} ${i.brand} ${i.model}`.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.size.localeCompare(b.size) || a.cost - b.cost);

  const upload = async (file: File) => {
    const csv = await file.text();
    try {
      const r = await api<ImportResult>(`/api/admin/suppliers/${supplier.id}/inventory`, { body: { csv, mode }, admin: true });
      setMsg({ text: `${mode === "replace" ? "Replaced list" : "Merged"}: ${r.added} new, ${r.updated} updated.`, errors: r.errors });
      refresh();
    } catch (e) {
      setMsg({ text: (e as Error).message });
    }
  };

  const patchItem = async (id: string, body: object) => {
    await api(`/api/admin/inventory/${id}`, { method: "PATCH", body, admin: true });
    refresh();
  };

  if (editing) return <SupplierForm supplier={supplier} onDone={() => { setEditing(false); refresh(); }} />;

  return (
    <section className={`bg-white rounded-2xl border border-gray-200 p-4 shadow-sm ${supplier.active ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900">{supplier.name}</h3>
          <p className="text-xs text-gray-500 truncate">📍 {supplier.location.label}</p>
          <p className="text-xs text-gray-500">
            {items.length} tire lines · {totalQty} tires in stock
            {supplier.inventoryUpdatedAt && ` · updated ${new Date(supplier.inventoryUpdatedAt).toLocaleDateString("en-CA")}`}
          </p>
          {supplier.phone && <p className="text-xs text-gray-500">📞 {supplier.phone}</p>}
        </div>
        <label className="text-xs flex items-center gap-1 shrink-0">
          <input
            type="checkbox"
            checked={supplier.active}
            onChange={async (e) => {
              await api(`/api/admin/suppliers/${supplier.id}`, { method: "PATCH", body: { active: e.target.checked }, admin: true });
              refresh();
            }}
          />
          Active
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <select value={mode} onChange={(e) => setMode(e.target.value as "replace" | "merge")} className="text-sm border border-gray-300 rounded-lg px-2 py-1.5">
          <option value="replace">Replace whole list</option>
          <option value="merge">Update / add only</option>
        </select>
        <button type="button" onClick={() => fileRef.current?.click()} className="text-sm bg-brand-600 text-white rounded-lg px-3 py-1.5 font-medium">
          ⬆ Upload CSV
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5">
          {open ? "Hide stock" : "View stock"}
        </button>
        <button type="button" onClick={() => setEditing(true)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5">
          Edit
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!confirm(`Delete ${supplier.name} and its stock list?`)) return;
            await api(`/api/admin/suppliers/${supplier.id}`, { method: "DELETE", admin: true });
            refresh();
          }}
          className="text-sm text-red-600 px-2"
        >
          Delete
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>
      {msg && <ImportMessage msg={msg} />}

      {open && (
        <div className="mt-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by size or brand"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mb-2"
          />
          <div className="overflow-x-auto max-h-96 overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500 sticky top-0 bg-white">
                <tr>
                  <th className="py-1 pr-2">Size</th>
                  <th className="pr-2">Tire</th>
                  <th className="pr-2 text-right">Cost</th>
                  <th className="text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id} className="border-t border-gray-100">
                    <td className="py-1 pr-2 font-mono text-xs">{i.size}</td>
                    <td className="pr-2">
                      {i.brand} {i.model} <span className="text-xs text-gray-500">{i.season}</span>
                    </td>
                    <td className="pr-2 text-right">
                      <NumberCell key={`c${i.cost}`} value={i.cost} step={0.01} onSave={(v) => patchItem(i.id, { cost: v })} />
                    </td>
                    <td className="text-right">
                      <NumberCell key={`q${i.qty}`} value={i.qty} step={1} onSave={(v) => patchItem(i.id, { qty: v })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function NumberCell({ value, step, onSave }: { value: number; step: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <input
      type="number"
      step={step}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = parseFloat(v);
        if (Number.isFinite(n) && n !== value) onSave(n);
        else setV(String(value));
      }}
      className="w-20 text-right border border-transparent hover:border-gray-300 focus:border-brand-500 rounded px-1 py-0.5"
    />
  );
}
