// Distance helpers and address lookup for the Edmonton area.

const ROAD_FACTOR = 1.3; // straight-line → rough road distance in a city grid

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function roadKm(a, b) {
  return haversineKm(a, b) * ROAD_FACTOR;
}

// Fallback when online geocoding is unavailable: common Edmonton-area areas.
const AREAS = [
  { label: "Downtown Edmonton", lat: 53.5444, lng: -113.4909 },
  { label: "Old Strathcona / Whyte Ave", lat: 53.5196, lng: -113.4965 },
  { label: "West Edmonton Mall area", lat: 53.5225, lng: -113.6242 },
  { label: "Mill Woods", lat: 53.4555, lng: -113.4300 },
  { label: "Windermere / Ambleside", lat: 53.4400, lng: -113.6150 },
  { label: "Terwillegar", lat: 53.4610, lng: -113.5850 },
  { label: "Summerside / Ellerslie", lat: 53.4270, lng: -113.4800 },
  { label: "South Edmonton Common", lat: 53.4560, lng: -113.4890 },
  { label: "Clareview", lat: 53.6040, lng: -113.4010 },
  { label: "Castle Downs", lat: 53.6150, lng: -113.5150 },
  { label: "The Palisades / Griesbach", lat: 53.6050, lng: -113.5250 },
  { label: "Londonderry / North Edmonton", lat: 53.6000, lng: -113.4500 },
  { label: "Callingwood / Lewis Farms", lat: 53.5100, lng: -113.6550 },
  { label: "Heritage Valley", lat: 53.4180, lng: -113.5400 },
  { label: "St. Albert", lat: 53.6305, lng: -113.6256 },
  { label: "Sherwood Park", lat: 53.5413, lng: -113.2958 },
  { label: "Spruce Grove", lat: 53.5450, lng: -113.9008 },
  { label: "Stony Plain", lat: 53.5260, lng: -114.0030 },
  { label: "Leduc", lat: 53.2594, lng: -113.5492 },
  { label: "Beaumont", lat: 53.3570, lng: -113.4150 },
  { label: "Fort Saskatchewan", lat: 53.7128, lng: -113.2133 },
  { label: "Nisku / Airport", lat: 53.3000, lng: -113.5300 },
];

function searchAreas(q) {
  const s = String(q || "").toLowerCase().trim();
  if (!s) return [];
  return AREAS.filter((a) => a.label.toLowerCase().includes(s) || s.includes(a.label.toLowerCase().split(" ")[0]));
}

// Online lookup via OpenStreetMap Nominatim, biased to the Edmonton region.
async function geocode(q) {
  const local = searchAreas(q);
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ca" +
      "&viewbox=-114.2,53.85,-113.0,53.2&bounded=1&q=" + encodeURIComponent(q);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "ShakurRoadsideScheduler/1.0", "Accept-Language": "en" },
    });
    clearTimeout(t);
    if (res.ok) {
      const data = await res.json();
      const online = data.map((d) => ({
        label: d.display_name.split(",").slice(0, 3).join(","),
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon),
      }));
      return [...online, ...local].slice(0, 6);
    }
  } catch {
    /* offline or blocked — fall back to built-in areas */
  }
  return local;
}

function validPoint(p) {
  return p && Number.isFinite(+p.lat) && Number.isFinite(+p.lng) && Math.abs(+p.lat) <= 90 && Math.abs(+p.lng) <= 180;
}

module.exports = { haversineKm, roadKm, geocode, searchAreas, validPoint, AREAS };
