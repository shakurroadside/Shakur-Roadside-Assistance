// REST API for tire search, booking, suppliers/inventory and scheduling.
// Mounted by server.js under /api/*.
const store = require("./store");
const { normalizeSize, parseInventoryCsv } = require("./tires");
const { geocode, validPoint, roadKm } = require("./geo");
const sched = require("./scheduler");
const weather = require("./weather");

const JOB_STATUSES = ["requested", "confirmed", "tires_ordered", "in_progress", "done", "cancelled"];
const SEASONS = ["any", "winter", "all-season", "all-weather", "summer"];

function createApi({ onJobsChanged = () => {}, onNewBooking = () => {} } = {}) {
  const db = store.load();

  // ---------- helpers ----------
  const send = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const fail = (res, status, error) => send(res, status, { error });

  function readBody(req, limit = 5 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", (c) => {
        size += c.length;
        if (size > limit) { reject(new Error("Body too large")); req.destroy(); return; }
        chunks.push(c);
      });
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw) return resolve({});
        try { resolve(JSON.parse(raw)); } catch { reject(new Error("Invalid JSON")); }
      });
      req.on("error", reject);
    });
  }

  function isAdmin(req) {
    const pin = process.env.ADMIN_PIN;
    return !pin || req.headers["x-admin-pin"] === pin;
  }

  const point = (p) => ({ label: String(p.label || "").slice(0, 200), lat: +p.lat, lng: +p.lng });
  const changed = () => { store.save(); onJobsChanged(); };

  function publicOption(o) {
    // Customers never see supplier names or costs.
    const { supplierName, supplierCost, supplierId, rank, pickupDetourKm, ...rest } = o;
    return rest;
  }

  async function weatherFor() {
    const w = await weather.forecast(db.settings.base, db.settings.timezone);
    return w;
  }

  async function search(body, admin) {
    const size = normalizeSize(body.size);
    const service = db.settings.services[body.service] ? body.service : "new_tires";
    const qty = Math.min(8, Math.max(1, parseInt(body.qty, 10) || 4));
    const season = SEASONS.includes(body.season) ? body.season : "any";
    if (!validPoint(body.location)) throw new Error("Please share your location or pick an address.");
    const loc = point(body.location);
    if (service === "new_tires" && !size) throw new Error("Tire size looks off. It's on the tire sidewall, like 225/65R17.");

    const options = service === "new_tires" ? sched.tireOptions(db, { size, qty, season, loc, service }) : [];
    const supplierChoices = options.length
      ? sched.suppliersFor(db, db.inventory.find((i) => i.id === options[0].inventoryId), qty).map((x) => x.sup)
      : [];
    const { today, suggestions, days } = sched.suggestSlots(db, loc, { supplierChoices });
    const w = await weatherFor();
    return {
      size,
      qty,
      service,
      options: admin ? options : options.map(publicOption),
      suggestions: suggestions.map((s) => withWeather(s, w, admin)),
      days: days.map((d) => ({ ...d, weather: w[d.date] || null })),
      advice: weather.seasonAdvice(today, w),
      serviceFee: db.settings.services[service].fee,
    };
  }

  function withWeather(s, w, admin) {
    const out = { ...s, weather: w[s.date] || null };
    if (!admin) delete out.supplierId;
    delete out.score;
    return out;
  }

  // Pick the supplier that is cheapest-on-the-way for this job slot,
  // never one that's pricier than what the customer was quoted.
  function chooseSupplier(item, qty, date, slot, loc) {
    const quotedUnit = sched.retailUnit(item.cost, db.settings.markupPercent);
    const { prev } = sched.neighbours(db, date, slot);
    const choices = sched.suppliersFor(db, item, qty)
      .filter((x) => sched.retailUnit(x.item.cost, db.settings.markupPercent) <= quotedUnit)
      .map((x) => ({ ...x, score: x.item.cost * qty + sched.pickupDetour(prev, x.sup, loc) * sched.kmCost(db) }))
      .sort((a, b) => a.score - b.score);
    return choices[0] || null;
  }

  function createJob(body, { source }) {
    const service = db.settings.services[body.service] ? body.service : "new_tires";
    const name = String(body.customer?.name || "").trim().slice(0, 100);
    const phone = String(body.customer?.phone || "").trim().slice(0, 40);
    if (!name || !phone) throw new Error("Name and phone are required.");
    if (!validPoint(body.location)) throw new Error("Location is required.");
    const loc = point(body.location);
    const { days } = sched.bookableDays(db);
    const day = days.find((d) => d.date === body.date);
    if (!day || !day.slots.includes(body.slot)) throw new Error("That time was just taken — please pick another slot.");

    const job = {
      id: store.id("job"),
      createdAt: new Date().toISOString(),
      source,
      status: source === "dispatcher" ? "confirmed" : "requested",
      service,
      serviceLabel: db.settings.services[service].label,
      customer: { name, phone, email: String(body.customer?.email || "").trim().slice(0, 120) },
      vehicle: String(body.vehicle || "").slice(0, 120),
      notes: String(body.notes || "").slice(0, 1000),
      location: loc,
      date: body.date,
      slot: body.slot,
      serviceFee: db.settings.services[service].fee,
      tire: null,
      supplierId: null,
      reserved: null,
      tiresPickedUp: false,
      total: db.settings.services[service].fee,
    };

    if (service === "new_tires" && body.inventoryId) {
      const qty = Math.min(8, Math.max(1, parseInt(body.qty, 10) || 4));
      const quoted = db.inventory.find((i) => i.id === body.inventoryId);
      if (!quoted || quoted.qty < qty) throw new Error("Sorry, that tire just sold out. Please search again.");
      const pick = chooseSupplier(quoted, qty, body.date, body.slot, loc) || { item: quoted, sup: db.suppliers.find((s) => s.id === quoted.supplierId) };
      const unit = sched.retailUnit(quoted.cost, db.settings.markupPercent);
      pick.item.qty -= qty;
      job.tire = { size: quoted.size, brand: quoted.brand, model: quoted.model, season: quoted.season, qty, unitPrice: unit, unitCost: pick.item.cost };
      job.supplierId = pick.sup?.id || null;
      job.reserved = { inventoryId: pick.item.id, qty };
      job.total = unit * qty + job.serviceFee;
    }

    db.jobs.push(job);
    changed();
    onNewBooking(job);
    return job;
  }

  function publicJob(j) {
    return {
      id: j.id, status: j.status, serviceLabel: j.serviceLabel, date: j.date, slot: j.slot,
      tire: j.tire && { size: j.tire.size, brand: j.tire.brand, model: j.tire.model, season: j.tire.season, qty: j.tire.qty, unitPrice: j.tire.unitPrice },
      serviceFee: j.serviceFee, total: j.total, location: j.location, customer: { name: j.customer.name },
    };
  }

  function releaseReservation(job) {
    if (!job.reserved) return;
    const item = db.inventory.find((i) => i.id === job.reserved.inventoryId);
    if (item) item.qty += job.reserved.qty;
    job.reserved = null;
  }

  function reserveAgain(job) {
    if (job.reserved || !job.tire) return;
    const item = db.inventory.find(
      (i) => i.supplierId === job.supplierId && i.size === job.tire.size && i.brand === job.tire.brand && i.model === job.tire.model && i.qty >= job.tire.qty
    );
    if (item) { item.qty -= job.tire.qty; job.reserved = { inventoryId: item.id, qty: job.tire.qty }; }
  }

  function upsertSupplier(body, existing) {
    const name = String(body.name ?? existing?.name ?? "").trim().slice(0, 100);
    if (!name) throw new Error("Supplier name is required.");
    const loc = body.location ?? existing?.location;
    if (!validPoint(loc)) throw new Error("Supplier location is required (search an address or enter lat/lng).");
    const sup = existing || { id: store.id("sup"), createdAt: new Date().toISOString() };
    Object.assign(sup, {
      name,
      phone: String(body.phone ?? sup.phone ?? "").slice(0, 40),
      notes: String(body.notes ?? sup.notes ?? "").slice(0, 500),
      location: point(loc),
      active: body.active ?? sup.active ?? true,
    });
    if (!existing) db.suppliers.push(sup);
    return sup;
  }

  function importInventory(supplierId, csv, mode) {
    const { items, errors } = parseInventoryCsv(csv);
    const bySupplier = new Map();
    const unknown = new Set();
    for (const it of items) {
      let sid = supplierId;
      if (!sid) {
        const sup = db.suppliers.find((s) => s.name.toLowerCase() === it.supplier.toLowerCase());
        if (!sup) { unknown.add(it.supplier || "(blank)"); continue; }
        sid = sup.id;
      }
      if (!bySupplier.has(sid)) bySupplier.set(sid, []);
      bySupplier.get(sid).push(it);
    }
    let added = 0, updated = 0;
    for (const [sid, list] of bySupplier) {
      if (mode === "replace") db.inventory = db.inventory.filter((i) => i.supplierId !== sid);
      for (const it of list) {
        const match = db.inventory.find(
          (i) => i.supplierId === sid && (it.sku ? i.sku === it.sku : i.size === it.size && i.brand === it.brand && i.model === it.model)
        );
        const { supplier, ...fields } = it;
        if (match) { Object.assign(match, fields, { updatedAt: new Date().toISOString() }); updated++; }
        else { db.inventory.push({ id: store.id("inv"), supplierId: sid, ...fields, updatedAt: new Date().toISOString() }); added++; }
      }
      const sup = db.suppliers.find((s) => s.id === sid);
      if (sup) sup.inventoryUpdatedAt = new Date().toISOString();
    }
    if (unknown.size) errors.push(`Unknown supplier name(s): ${[...unknown].join(", ")} — add them first, or upload from that supplier's card.`);
    store.save();
    return { added, updated, errors };
  }

  function loadSampleData() {
    const demo = [
      { name: "Demo Supplier – North", location: { label: "North Edmonton (demo)", lat: 53.6010, lng: -113.4870 } },
      { name: "Demo Supplier – South", location: { label: "South Edmonton (demo)", lat: 53.4580, lng: -113.4920 } },
      { name: "Demo Supplier – West", location: { label: "West Edmonton (demo)", lat: 53.5330, lng: -113.6200 } },
    ];
    const sizes = ["205/55R16", "215/60R16", "225/65R17", "235/65R17", "225/45R17", "215/55R17", "245/60R18", "265/70R17", "195/65R15", "275/55R20"];
    const tires = [
      { brand: "Michelin", model: "X-Ice Snow", season: "winter", base: 165 },
      { brand: "Bridgestone", model: "Blizzak WS90", season: "winter", base: 155 },
      { brand: "Nokian", model: "WR G4", season: "all-weather", base: 150 },
      { brand: "Toyo", model: "Observe GSi-6", season: "winter", base: 120 },
      { brand: "Goodyear", model: "Assurance All-Season", season: "all-season", base: 115 },
      { brand: "Sailun", model: "Ice Blazer WST3", season: "winter", base: 85 },
    ];
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (const d of demo) {
      let sup = db.suppliers.find((s) => s.name === d.name);
      if (!sup) sup = upsertSupplier({ ...d, notes: "Sample data — delete when you add real suppliers." });
      db.inventory = db.inventory.filter((i) => i.supplierId !== sup.id);
      sizes.forEach((size, si) => {
        tires.forEach((t) => {
          if (rnd() < 0.35) return;
          const rim = parseInt(size.slice(-2), 10);
          db.inventory.push({
            id: store.id("inv"), supplierId: sup.id, size, brand: t.brand, model: t.model, season: t.season,
            cost: Math.round((t.base + (rim - 15) * 12 + rnd() * 20 - 10) * 100) / 100,
            qty: Math.floor(rnd() * 12), sku: "", updatedAt: new Date().toISOString(),
          });
        });
      });
      sup.inventoryUpdatedAt = new Date().toISOString();
    }
    store.save();
  }

  function adminState() {
    const { today, days } = sched.bookableDays(db);
    return { suppliers: db.suppliers, inventory: db.inventory, jobs: db.jobs, settings: db.settings, today, days, statuses: JOB_STATUSES };
  }

  // ---------- router ----------
  return async function handle(req, res, pathname, query) {
    const method = req.method;
    try {
      // ----- public -----
      if (pathname === "/api/public/info" && method === "GET") {
        const { today } = sched.bookableDays(db);
        const w = await weatherFor();
        const s = db.settings;
        return send(res, 200, {
          businessName: s.businessName, phone: s.phone, markupHidden: true,
          services: Object.fromEntries(Object.entries(s.services).map(([k, v]) => [k, { label: v.label, fee: v.fee }])),
          advice: weather.seasonAdvice(today, w),
        });
      }
      if (pathname === "/api/public/geocode" && method === "GET") {
        const q = String(query.q || "").trim();
        if (q.length < 2) return send(res, 200, { results: [] });
        return send(res, 200, { results: await geocode(q) });
      }
      if (pathname === "/api/public/search" && method === "POST") {
        return send(res, 200, await search(await readBody(req), false));
      }
      if (pathname === "/api/public/slots" && method === "POST") {
        // Re-suggest days for a specific chosen tire (supplier pickups factored in).
        const body = await readBody(req);
        if (!validPoint(body.location)) return fail(res, 400, "Location required");
        const loc = point(body.location);
        const qty = Math.min(8, Math.max(1, parseInt(body.qty, 10) || 4));
        const item = db.inventory.find((i) => i.id === body.inventoryId);
        const supplierChoices = item ? sched.suppliersFor(db, item, qty).map((x) => x.sup) : [];
        const { suggestions, days } = sched.suggestSlots(db, loc, { supplierChoices });
        const w = await weatherFor();
        return send(res, 200, {
          suggestions: suggestions.map((s) => withWeather(s, w, false)),
          days: days.map((d) => ({ ...d, weather: w[d.date] || null })),
        });
      }
      if (pathname === "/api/public/book" && method === "POST") {
        const job = createJob(await readBody(req), { source: "customer" });
        return send(res, 201, { job: publicJob(job) });
      }

      // ----- admin -----
      if (pathname.startsWith("/api/admin/")) {
        if (!isAdmin(req)) return fail(res, 401, "PIN required");
        const parts = pathname.split("/").filter(Boolean); // ["api","admin",...]
        const [, , resource, rid, sub] = parts;

        if (resource === "state" && method === "GET") return send(res, 200, adminState());
        if (resource === "search" && method === "POST") return send(res, 200, await search(await readBody(req), true));
        if (resource === "route" && method === "GET") return send(res, 200, sched.dayRoute(db, String(query.date || sched.todayIn(db.settings.timezone))));
        if (resource === "sample-data" && method === "POST") { loadSampleData(); return send(res, 200, adminState()); }

        if (resource === "settings" && method === "POST") {
          const body = await readBody(req);
          const next = { ...db.settings };
          if (body.base && validPoint(body.base)) next.base = point(body.base);
          if (Number.isFinite(+body.markupPercent)) next.markupPercent = Math.max(0, Math.min(300, +body.markupPercent));
          if (body.services) {
            for (const [k, v] of Object.entries(body.services)) {
              if (!next.services[k]) continue;
              next.services[k] = {
                ...next.services[k],
                ...(Number.isFinite(+v.fee) ? { fee: Math.max(0, +v.fee) } : {}),
                ...(Number.isFinite(+v.minutes) ? { minutes: Math.max(10, +v.minutes) } : {}),
                ...(v.label ? { label: String(v.label).slice(0, 80) } : {}),
              };
            }
          }
          if (Array.isArray(body.workDays)) next.workDays = body.workDays.map(Number).filter((d) => d >= 0 && d <= 6);
          if (Array.isArray(body.slots)) {
            const slots = body.slots.map(String).filter((s) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(s)).sort();
            if (slots.length) next.slots = slots;
          }
          if (Number.isFinite(+body.driveCostPerKm)) next.driveCostPerKm = Math.max(0, Math.min(20, +body.driveCostPerKm));
          if (Number.isFinite(+body.maxJobsPerSlot)) next.maxJobsPerSlot = Math.max(1, Math.min(5, +body.maxJobsPerSlot));
          if (Number.isFinite(+body.bookingDaysAhead)) next.bookingDaysAhead = Math.max(1, Math.min(60, +body.bookingDaysAhead));
          if (body.phone !== undefined) next.phone = String(body.phone).slice(0, 40);
          db.settings = store.mergeSettings(next);
          changed();
          return send(res, 200, adminState());
        }

        if (resource === "suppliers") {
          if (!rid && method === "POST") { const s = upsertSupplier(await readBody(req)); store.save(); return send(res, 201, { supplier: s }); }
          const sup = db.suppliers.find((s) => s.id === rid);
          if (!sup) return fail(res, 404, "Supplier not found");
          if (!sub && method === "PATCH") { upsertSupplier(await readBody(req), sup); store.save(); return send(res, 200, { supplier: sup }); }
          if (!sub && method === "DELETE") {
            db.suppliers = db.suppliers.filter((s) => s.id !== rid);
            db.inventory = db.inventory.filter((i) => i.supplierId !== rid);
            store.save();
            return send(res, 200, { ok: true });
          }
          if (sub === "inventory" && method === "POST") {
            const body = await readBody(req);
            return send(res, 200, importInventory(rid, String(body.csv || ""), body.mode === "merge" ? "merge" : "replace"));
          }
        }

        if (resource === "inventory") {
          if (rid === "import" && method === "POST") {
            const body = await readBody(req);
            return send(res, 200, importInventory(null, String(body.csv || ""), body.mode === "replace" ? "replace" : "merge"));
          }
          const item = db.inventory.find((i) => i.id === rid);
          if (!item) return fail(res, 404, "Item not found");
          if (method === "PATCH") {
            const body = await readBody(req);
            if (Number.isFinite(+body.qty)) item.qty = Math.max(0, Math.floor(+body.qty));
            if (Number.isFinite(+body.cost)) item.cost = Math.max(0, +body.cost);
            item.updatedAt = new Date().toISOString();
            store.save();
            return send(res, 200, { item });
          }
          if (method === "DELETE") { db.inventory = db.inventory.filter((i) => i.id !== rid); store.save(); return send(res, 200, { ok: true }); }
        }

        if (resource === "jobs") {
          if (!rid && method === "POST") return send(res, 201, { job: createJob(await readBody(req), { source: "dispatcher" }) });
          const job = db.jobs.find((j) => j.id === rid);
          if (!job) return fail(res, 404, "Job not found");
          if (method === "PATCH") {
            const body = await readBody(req);
            if (body.status && JOB_STATUSES.includes(body.status)) {
              if (body.status === "cancelled" && job.status !== "cancelled") releaseReservation(job);
              if (job.status === "cancelled" && body.status !== "cancelled") reserveAgain(job);
              job.status = body.status;
            }
            if (body.date && body.slot) {
              const { days } = sched.bookableDays(db);
              const day = days.find((d) => d.date === body.date);
              const free = day && (day.slots.includes(body.slot) || (job.date === body.date && job.slot === body.slot));
              if (!free) return fail(res, 409, "That slot isn't available.");
              job.date = body.date;
              job.slot = body.slot;
            }
            if (typeof body.tiresPickedUp === "boolean") job.tiresPickedUp = body.tiresPickedUp;
            if (body.notes !== undefined) job.notes = String(body.notes).slice(0, 1000);
            job.updatedAt = new Date().toISOString();
            changed();
            return send(res, 200, { job });
          }
        }

        if (resource === "reschedule-suggestions" && method === "GET") {
          // Best days for an existing job if it needs to move.
          const job = db.jobs.find((j) => j.id === rid);
          if (!job) return fail(res, 404, "Job not found");
          const sup = db.suppliers.find((s) => s.id === job.supplierId);
          const { suggestions } = sched.suggestSlots(db, job.location, { supplierChoices: sup ? [sup] : [] });
          return send(res, 200, { suggestions });
        }
      }

      return fail(res, 404, "Not found");
    } catch (err) {
      return fail(res, 400, err.message || "Bad request");
    }
  };
}

module.exports = { createApi, roadKm };
