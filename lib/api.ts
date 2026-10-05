"use client";

export interface GeoPoint {
  label: string;
  lat: number;
  lng: number;
}

export type ServiceKey = "new_tires" | "seasonal_swap" | "flat_repair";
export type Season = "any" | "winter" | "all-season" | "all-weather" | "summer";

export interface DayWeather {
  max: number;
  min: number;
  snowCm: number;
}

export interface TireOption {
  key: string;
  inventoryId: string;
  size: string;
  brand: string;
  model: string;
  season: string;
  inStock: number;
  unitPrice: number;
  qty: number;
  tiresTotal: number;
  serviceFee: number;
  total: number;
  tags: string[];
  // Dispatcher-only fields
  supplierId?: string;
  supplierName?: string;
  supplierCost?: number;
  pickupDetourKm?: number;
}

export interface SlotSuggestion {
  date: string;
  dayLabel: string;
  slot: string;
  detourKm: number;
  nearbyJobKm: number | null;
  jobsThatDay: number;
  reason: string;
  weather: DayWeather | null;
  supplierId?: string | null;
}

export interface BookableDay {
  date: string;
  label: string;
  slots: string[];
  weather?: DayWeather | null;
}

export interface Advice {
  season: string;
  text: string;
  firstSnowDate: string | null;
}

export interface SearchResult {
  size: string | null;
  qty: number;
  service: ServiceKey;
  options: TireOption[];
  suggestions: SlotSuggestion[];
  days: BookableDay[];
  advice: Advice;
  serviceFee: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  notes: string;
  location: GeoPoint;
  active: boolean;
  inventoryUpdatedAt?: string;
}

export interface InventoryItem {
  id: string;
  supplierId: string;
  size: string;
  brand: string;
  model: string;
  season: string;
  cost: number;
  qty: number;
  sku: string;
  updatedAt: string;
}

export type JobStatus = "requested" | "confirmed" | "tires_ordered" | "in_progress" | "done" | "cancelled";

export interface Job {
  id: string;
  createdAt: string;
  source: "customer" | "dispatcher";
  status: JobStatus;
  service: ServiceKey;
  serviceLabel: string;
  customer: { name: string; phone: string; email: string };
  vehicle: string;
  notes: string;
  location: GeoPoint;
  date: string;
  slot: string;
  serviceFee: number;
  tire: { size: string; brand: string; model: string; season: string; qty: number; unitPrice: number; unitCost: number } | null;
  supplierId: string | null;
  tiresPickedUp: boolean;
  total: number;
}

export interface Settings {
  businessName: string;
  phone: string;
  timezone: string;
  base: GeoPoint;
  markupPercent: number;
  services: Record<ServiceKey, { label: string; fee: number; minutes: number }>;
  workDays: number[];
  slots: string[];
  maxJobsPerSlot: number;
  bookingDaysAhead: number;
  driveCostPerKm: number;
  avgSpeedKmh: number;
}

export interface AdminState {
  suppliers: Supplier[];
  inventory: InventoryItem[];
  jobs: Job[];
  settings: Settings;
  today: string;
  days: BookableDay[];
  statuses: JobStatus[];
}

export interface DayRoute {
  date: string;
  stops: { type: "base" | "pickup" | "job"; label: string; location: GeoPoint; jobId?: string }[];
  totalKm: number;
  driveMinutes: number;
  mapsUrl: string | null;
}

const PIN_KEY = "sra_admin_pin";

export function getPin(): string {
  try {
    return localStorage.getItem(PIN_KEY) || "";
  } catch {
    return "";
  }
}

export function setPin(pin: string) {
  try {
    localStorage.setItem(PIN_KEY, pin);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; admin?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.admin) headers["x-admin-pin"] = getPin();
  const res = await fetch(path, {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data as T;
}

export const money = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const SEASON_LABEL: Record<string, string> = {
  any: "Any season",
  winter: "❄️ Winter",
  "all-season": "🌤 All-season",
  "all-weather": "🌨 All-weather",
  summer: "☀️ Summer",
};

export const STATUS_LABEL: Record<JobStatus, string> = {
  requested: "New request",
  confirmed: "Confirmed",
  tires_ordered: "Tires ordered",
  in_progress: "On the way / working",
  done: "Done",
  cancelled: "Cancelled",
};

export const STATUS_COLOR: Record<JobStatus, string> = {
  requested: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  tires_ordered: "bg-purple-100 text-purple-800",
  in_progress: "bg-brand-100 text-brand-700",
  done: "bg-green-100 text-green-800",
  cancelled: "bg-gray-200 text-gray-600",
};

export function formatSlot(slot: string) {
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "pm" : "am";
    const hh = h % 12 || 12;
    return m ? `${hh}:${String(m).padStart(2, "0")}${ampm}` : `${hh}${ampm}`;
  };
  const [a, b] = slot.split("-");
  return `${fmt(a)}–${fmt(b)}`;
}

export function formatDate(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
