"use client";

import { useEffect, useRef, useState } from "react";
import { api, GeoPoint } from "@/lib/api";

interface Props {
  value: GeoPoint | null;
  onChange: (p: GeoPoint | null) => void;
  placeholder?: string;
  allowGps?: boolean;
}

export default function LocationPicker({ value, onChange, placeholder = "Address, area or postal code", allowGps = true }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api<{ results: GeoPoint[] }>(`/api/public/geocode?q=${encodeURIComponent(q)}`);
        setResults(r.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, [q]);

  const useGps = () => {
    setGpsError("");
    if (!navigator.geolocation) {
      setGpsError("Location isn't available on this device — type your address instead.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoading(false);
        onChange({ label: "Shared GPS location", lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLoading(false);
        setGpsError("Couldn't get your location — type your address instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 border border-green-300 bg-green-50 rounded-xl px-4 py-3">
        <span className="text-lg">📍</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{value.label || "Selected location"}</p>
          <p className="text-xs text-gray-500">
            {value.lat.toFixed(4)}, {value.lng.toFixed(4)}
          </p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="text-sm text-brand-600 font-medium hover:underline">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {allowGps && (
        <button
          type="button"
          onClick={useGps}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand-700 transition"
        >
          <span>📍</span> Use my current location
        </button>
      )}
      <div className="relative">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={allowGps ? `…or type ${placeholder.toLowerCase()}` : placeholder}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {loading && <span className="absolute right-3 top-3 text-xs text-gray-400">Searching…</span>}
        {results.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lng},${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(r);
                    setQ("");
                    setResults([]);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-brand-50"
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {gpsError && <p className="text-xs text-red-600">{gpsError}</p>}
    </div>
  );
}
