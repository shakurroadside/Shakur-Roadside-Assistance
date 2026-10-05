// JSON-file backed store for suppliers, inventory, jobs and settings.
// Small and dependency-free; swap for a real DB when volume grows.
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const DEFAULT_SETTINGS = {
  businessName: "Shakur Roadside Assistance",
  phone: "780-264-0758",
  timezone: "America/Edmonton",
  // Where the day starts/ends. Default: central Edmonton — change in Settings.
  base: { label: "Edmonton (base)", lat: 53.5461, lng: -113.4938 },
  markupPercent: 20,
  services: {
    new_tires: { label: "New tires – mobile install", fee: 120, minutes: 75 },
    seasonal_swap: { label: "Seasonal swap (my own tires)", fee: 90, minutes: 60 },
    flat_repair: { label: "Flat tire / spare change", fee: 80, minutes: 40 },
  },
  workDays: [1, 2, 3, 4, 5, 6], // 0=Sun … 6=Sat
  slots: ["08:00-10:00", "10:00-12:00", "12:00-14:00", "14:00-16:00", "16:00-18:00", "18:00-20:00"],
  maxJobsPerSlot: 1,
  bookingDaysAhead: 14,
  driveCostPerKm: 1.5, // $ per extra km when weighing a cheaper-but-farther supplier
  avgSpeedKmh: 40, // city driving, used to estimate drive minutes
};

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    db = { suppliers: [], inventory: [], jobs: [], settings: {} };
  }
  db.suppliers ||= [];
  db.inventory ||= [];
  db.jobs ||= [];
  db.settings = mergeSettings(db.settings || {});
  return db;
}

function mergeSettings(s) {
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    base: { ...DEFAULT_SETTINGS.base, ...(s.base || {}) },
    services: Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS.services).map(([k, v]) => [k, { ...v, ...((s.services || {})[k] || {}) }])
    ),
  };
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

module.exports = { load, save, id, mergeSettings, DEFAULT_SETTINGS };
