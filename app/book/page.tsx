"use client";

import { useEffect, useState } from "react";
import BookingFlow from "@/components/BookingFlow";
import { api, Advice } from "@/lib/api";

interface Info {
  businessName: string;
  phone: string;
  services: Record<string, { label: string; fee: number }>;
  advice: Advice;
  brands: string[];
}

export default function BookPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Info>("/api/public/info").then(setInfo).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="h-screen overflow-y-auto bg-gray-100">
      <header className="bg-brand-600 text-white">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <h1 className="text-xl font-bold">🚗 {info?.businessName || "Shakur Roadside Assistance"}</h1>
          <p className="text-brand-100 text-sm">Mobile tires &amp; seasonal swaps — I come to you, anywhere in Edmonton.</p>
          {info?.phone && (
            <a href={`tel:${info.phone.replace(/[^\d+]/g, "")}`} className="inline-block mt-2 text-sm font-semibold underline">
              📞 {info.phone} · 24/7 emergencies
            </a>
          )}
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5 pb-16">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {info?.advice?.text && (
          <div className="mb-4 bg-sky-50 border border-sky-200 text-sky-900 text-sm rounded-xl px-4 py-3">❄️ {info.advice.text}</div>
        )}
        {info ? <BookingFlow services={info.services} brands={info.brands} /> : !error && <p className="text-gray-500 text-sm">Loading…</p>}
      </main>
    </div>
  );
}
