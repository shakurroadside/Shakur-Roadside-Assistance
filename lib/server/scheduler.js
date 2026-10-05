// Scheduling brain: suggests days/slots that fit the owner's route,
// picks the supplier that's on the way, and prices tire options.
const { roadKm } = require("./geo");

const ACTIVE = (j) => j.status !== "cancelled" && j.status !== "done";
// What an extra km of driving "costs" when ranking options (fuel + time).
const kmCost = (db) => db.settings.driveCostPerKm ?? 1.5;

// ---------- dates in the business timezone ----------
function todayIn(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function hourIn(tz) {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date());
  return parseInt(h, 10) % 24;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(dateStr) {
  return new Date(dateStr + "T12:00:00Z").getUTCDay();
}
function dayLabel(dateStr, today) {
  if (dateStr === today) return "Today";
  if (dateStr === addDays(today, 1)) return "Tomorrow";
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}
const slotStartHour = (slot) => parseInt(slot.split(":")[0], 10);

// Upcoming bookable dates with their still-open slots.
function bookableDays(db) {
  const s = db.settings;
  const today = todayIn(s.timezone);
  const nowHour = hourIn(s.timezone);
  const days = [];
  for (let i = 0; i < s.bookingDaysAhead; i++) {
    const date = addDays(today, i);
    if (!s.workDays.includes(weekday(date))) continue;
    const slots = s.slots.filter((slot) => {
      if (date === today && slotStartHour(slot) <= nowHour + 1) return false; // need ~1h notice
      const taken = db.jobs.filter((j) => ACTIVE(j) && j.date === date && j.slot === slot).length;
      return taken < s.maxJobsPerSlot;
    });
    days.push({ date, label: dayLabel(date, today), slots });
  }
  return { today, days };
}

// Ordered stops (base → jobs in slot order → base) for a day.
function dayJobs(db, date) {
  return db.jobs
    .filter((j) => ACTIVE(j) && j.date === date)
    .sort((a, b) => a.slot.localeCompare(b.slot) || a.createdAt.localeCompare(b.createdAt));
}

// Where the owner is just before and after a given slot that day.
function neighbours(db, date, slot) {
  const base = db.settings.base;
  const jobs = dayJobs(db, date);
  const before = jobs.filter((j) => j.slot <= slot);
  const after = jobs.filter((j) => j.slot > slot);
  return {
    prev: before.length ? before[before.length - 1].location : base,
    next: after.length ? after[0].location : base,
    prevJob: before[before.length - 1] || null,
    jobs,
  };
}

// Extra driving (km) if the new job is slotted between prev and next.
function insertionDetour(prev, loc, next) {
  return roadKm(prev, loc) + roadKm(loc, next) - roadKm(prev, next);
}

// Best supplier pickup on the way from `prev` to the job `loc`.
function pickupDetour(prev, supplier, loc) {
  return roadKm(prev, supplier.location) + roadKm(supplier.location, loc) - roadKm(prev, loc);
}

function retailUnit(cost, markupPercent) {
  return Math.ceil(cost * (1 + markupPercent / 100));
}

// Nearest active job (km) to a location on a given date.
function nearestJobKm(jobs, loc) {
  let best = Infinity;
  for (const j of jobs) best = Math.min(best, roadKm(j.location, loc));
  return best;
}

/**
 * Suggest the best day+slot combos for a customer.
 * `supplierChoices` (optional) are suppliers that can fill the order; their
 * pickup detour is added so tire jobs land on days when a supplier is en route.
 */
function suggestSlots(db, loc, { supplierChoices = [], limit = 4 } = {}) {
  const { today, days } = bookableDays(db);
  const candidates = [];
  for (const day of days) {
    for (const slot of day.slots) {
      const { prev, next, jobs } = neighbours(db, day.date, slot);
      let detour = insertionDetour(prev, loc, next);
      let supplier = null;
      if (supplierChoices.length) {
        let best = Infinity;
        for (const sup of supplierChoices) {
          const d = pickupDetour(prev, sup, loc);
          if (d < best) { best = d; supplier = sup; }
        }
        detour += best;
      }
      const nearKm = nearestJobKm(jobs, loc);
      candidates.push({
        date: day.date,
        dayLabel: day.label,
        slot,
        detourKm: Math.round(detour * 10) / 10,
        nearbyJobKm: Number.isFinite(nearKm) ? Math.round(nearKm * 10) / 10 : null,
        jobsThatDay: jobs.length,
        supplierId: supplier?.id || null,
        // Small penalty for later days so sooner wins ties.
        score: detour + 0.3 * days.indexOf(day),
      });
    }
  }
  candidates.sort((a, b) => a.score - b.score);

  // Best slot per day, then top days.
  const seen = new Set();
  const picks = [];
  for (const c of candidates) {
    if (seen.has(c.date)) continue;
    seen.add(c.date);
    picks.push({ ...c, reason: reasonFor(c) });
    if (picks.length >= limit) break;
  }
  return { today, suggestions: picks, days };
}

function reasonFor(c) {
  if (c.nearbyJobKm !== null && c.nearbyJobKm < 1) return "I'm already in your neighbourhood that day";
  if (c.nearbyJobKm !== null && c.nearbyJobKm <= 5) return `Already working ~${c.nearbyJobKm} km from you that day`;
  if (c.nearbyJobKm !== null && c.nearbyJobKm <= 12) return `On my route that day (${c.nearbyJobKm} km away)`;
  if (c.jobsThatDay === 0) return "Open day — lots of flexibility";
  return "Good fit with my schedule";
}

/**
 * Tire options for a size near a customer. Groups identical tires across
 * suppliers and keeps the best supplier for each (price + pickup distance).
 */
function tireOptions(db, { size, qty, season, loc, service = "new_tires" }) {
  const s = db.settings;
  const fee = s.services[service]?.fee ?? s.services.new_tires.fee;
  const suppliersById = Object.fromEntries(db.suppliers.filter((x) => x.active !== false).map((x) => [x.id, x]));
  const matches = db.inventory.filter(
    (i) => i.size === size && i.qty >= qty && suppliersById[i.supplierId] && (!season || season === "any" || i.season === season)
  );

  const groups = new Map();
  for (const item of matches) {
    const sup = suppliersById[item.supplierId];
    const key = `${item.brand}|${item.model}|${item.season}`.toLowerCase();
    // From base, out to supplier, then to the customer.
    const routeKm = roadKm(s.base, sup.location) + roadKm(sup.location, loc) - roadKm(s.base, loc);
    const unit = retailUnit(item.cost, s.markupPercent);
    const rank = unit * qty + routeKm * kmCost(db);
    const g = groups.get(key);
    if (!g || rank < g.rank) {
      groups.set(key, { key, item, sup, unit, rank, routeKm, suppliers: g ? g.suppliers + 1 : 1 });
    } else {
      g.suppliers += 1;
    }
  }

  const options = Array.from(groups.values()).map((g) => ({
    key: g.key,
    inventoryId: g.item.id,
    supplierId: g.sup.id,
    supplierName: g.sup.name,
    supplierCost: g.item.cost,
    size: g.item.size,
    brand: g.item.brand,
    model: g.item.model,
    season: g.item.season,
    inStock: g.item.qty,
    unitPrice: g.unit,
    qty,
    tiresTotal: g.unit * qty,
    serviceFee: fee,
    total: g.unit * qty + fee,
    pickupDetourKm: Math.round(g.routeKm * 10) / 10,
    rank: g.rank,
    tags: [],
  }));

  options.sort((a, b) => a.rank - b.rank);
  if (options.length) {
    options[0].tags.push("Recommended");
    const cheapest = options.reduce((m, o) => (o.total < m.total ? o : m), options[0]);
    if (cheapest !== options[0]) cheapest.tags.push("Lowest price");
    const closest = options.reduce((m, o) => (o.pickupDetourKm < m.pickupDetourKm ? o : m), options[0]);
    if (closest !== options[0] && closest !== cheapest) closest.tags.push("Fastest pickup");
  }
  return options;
}

// Suppliers that can fill a given tire (same size/brand/model/season, enough stock).
function suppliersFor(db, inventoryItem, qty) {
  const k = (i) => `${i.size}|${i.brand}|${i.model}|${i.season}`.toLowerCase();
  const key = k(inventoryItem);
  return db.inventory
    .filter((i) => k(i) === key && i.qty >= qty)
    .map((i) => ({ item: i, sup: db.suppliers.find((s) => s.id === i.supplierId && s.active !== false) }))
    .filter((x) => x.sup);
}

// Ordered route for a day, including supplier pickups right before their job.
function dayRoute(db, date) {
  const base = db.settings.base;
  const jobs = dayJobs(db, date);
  const stops = [{ type: "base", label: base.label, location: base }];
  let km = 0;
  let last = base;
  for (const j of jobs) {
    if (j.supplierId && j.status !== "in_progress") {
      const sup = db.suppliers.find((s) => s.id === j.supplierId);
      if (sup && j.tire && !j.tiresPickedUp) {
        km += roadKm(last, sup.location);
        last = sup.location;
        stops.push({ type: "pickup", label: `Pick up ${j.tire.qty}× ${j.tire.size} at ${sup.name}`, location: sup.location, jobId: j.id, supplier: sup });
      }
    }
    km += roadKm(last, j.location);
    last = j.location;
    stops.push({ type: "job", label: `${j.slot} · ${j.customer.name}`, location: j.location, jobId: j.id });
  }
  km += roadKm(last, base);
  stops.push({ type: "base", label: base.label, location: base });
  const minutes = Math.round((km / db.settings.avgSpeedKmh) * 60);
  return { date, stops, totalKm: Math.round(km * 10) / 10, driveMinutes: minutes, mapsUrl: mapsUrl(stops) };
}

function mapsUrl(stops) {
  if (stops.length < 2) return null;
  const p = (s) => `${s.location.lat},${s.location.lng}`;
  const origin = p(stops[0]);
  const destination = p(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1).map(p).join("|");
  return (
    "https://www.google.com/maps/dir/?api=1&travelmode=driving" +
    `&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}` +
    (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : "")
  );
}

module.exports = {
  kmCost, todayIn, addDays, bookableDays, suggestSlots, tireOptions, suppliersFor, dayRoute,
  pickupDetour, neighbours, retailUnit, ACTIVE,
};
