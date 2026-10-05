// Tire size parsing and supplier CSV import.

// Accepts "225/65R17", "225/65/17", "225 65 17", "P225/65 R17", "2256517", "LT245/75R16"
// and returns the canonical "225/65R17" (or null if it can't be read).
function normalizeSize(input) {
  if (!input) return null;
  const s = String(input).toUpperCase().replace(/^(P|LT|ST)/, "").replace(/ZR|R|-|\/|\s+/g, " ").trim();
  let m = s.match(/^(\d{3})\s+(\d{2})\s+(\d{2})$/);
  if (!m) m = s.replace(/\s+/g, "").match(/^(\d{3})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${m[1]}/${m[2]}R${m[3]}`;
}

// Minimal RFC-4180-ish CSV parser (handles quotes, commas and newlines inside quotes).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  text = String(text).replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// Header aliases so supplier spreadsheets don't need exact column names.
const COLUMNS = {
  supplier: ["supplier", "supplier name", "store", "vendor"],
  size: ["size", "tire size", "tyre size", "dimension"],
  brand: ["brand", "make", "manufacturer"],
  model: ["model", "pattern", "tire model", "name", "description"],
  season: ["season", "type", "category"],
  cost: ["cost", "price", "unit price", "supplier price", "dealer price", "your price"],
  qty: ["qty", "quantity", "stock", "on hand", "available", "in stock"],
  sku: ["sku", "part", "part number", "item", "item number"],
};

function mapHeader(header) {
  const map = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    for (const [col, aliases] of Object.entries(COLUMNS)) {
      if (map[col] === undefined && aliases.includes(key)) map[col] = i;
    }
  });
  return map;
}

function normalizeSeason(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("winter") || s.includes("snow") || s.includes("ice")) return "winter";
  if (s.includes("all-weather") || s.includes("all weather")) return "all-weather";
  if (s.includes("summer") || s.includes("performance")) return "summer";
  if (s.includes("all")) return "all-season";
  return s || "all-season";
}

function toNumber(v) {
  const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

// Returns { items: [{supplier?, size, brand, model, season, cost, qty, sku}], errors: [string] }
function parseInventoryCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { items: [], errors: ["The file has no data rows."] };
  const map = mapHeader(rows[0]);
  const missing = ["size", "cost", "qty"].filter((c) => map[c] === undefined);
  if (missing.length) {
    return { items: [], errors: [`Missing column(s): ${missing.join(", ")}. Expected headers like: size, brand, model, season, cost, qty`] };
  }
  const items = [];
  const errors = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const get = (c) => (map[c] === undefined ? "" : (r[map[c]] || "").trim());
    const size = normalizeSize(get("size"));
    const cost = toNumber(get("cost"));
    const qty = Math.max(0, Math.floor(toNumber(get("qty")) || 0));
    if (!size) return errors.push(`Row ${line}: can't read tire size "${get("size")}"`);
    if (!Number.isFinite(cost)) return errors.push(`Row ${line}: invalid cost "${get("cost")}"`);
    items.push({
      supplier: get("supplier"),
      size,
      brand: get("brand") || "Unbranded",
      model: get("model"),
      season: normalizeSeason(get("season")),
      cost: Math.round(cost * 100) / 100,
      qty,
      sku: get("sku"),
    });
  });
  return { items, errors };
}

module.exports = { normalizeSize, parseCsv, parseInventoryCsv, normalizeSeason };
