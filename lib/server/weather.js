// Daily forecast (Open-Meteo, free, no key) used to nudge customers toward
// swapping before cold/snow days. Fails quietly when offline.
let cache = { at: 0, key: "", data: null };
const TTL = 3 * 60 * 60 * 1000;

async function forecast(base, tz) {
  const key = `${base.lat.toFixed(2)},${base.lng.toFixed(2)}`;
  if (cache.data && cache.key === key && Date.now() - cache.at < TTL) return cache.data;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${base.lat}&longitude=${base.lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,snowfall_sum&forecast_days=16&timezone=${encodeURIComponent(tz)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    const data = {};
    j.daily.time.forEach((date, i) => {
      data[date] = {
        max: Math.round(j.daily.temperature_2m_max[i]),
        min: Math.round(j.daily.temperature_2m_min[i]),
        snowCm: Math.round((j.daily.snowfall_sum[i] || 0) * 10) / 10,
      };
    });
    cache = { at: Date.now(), key, data };
    return data;
  } catch {
    return cache.data || {};
  }
}

// Season guidance for Edmonton-style climates (the 7°C rule of thumb).
function seasonAdvice(today, weather) {
  const month = parseInt(today.slice(5, 7), 10);
  const days = Object.entries(weather).filter(([d]) => d >= today).slice(0, 10);
  const firstSnow = days.find(([, w]) => w.snowCm >= 0.5);
  const coldDays = days.filter(([, w]) => w.max < 7).length;

  if (month >= 9 || month <= 1) {
    let text = "Winter tire season: swap once daytime highs stay below 7°C — and before the first snow, when everyone books at once.";
    if (firstSnow) text = `Snow is forecast for ${fmt(firstSnow[0])}. Book your winter swap before then to beat the rush.`;
    else if (coldDays >= 3) text = `${coldDays} of the next ${days.length} days stay below 7°C — it's time for winter tires.`;
    return { season: "winter", text, firstSnowDate: firstSnow ? firstSnow[0] : null };
  }
  if (month >= 3 && month <= 6) {
    return {
      season: "summer",
      text: "Spring swap: switch back to summer/all-season tires once highs stay above 7°C and the snow risk has passed (usually late April–May in Edmonton).",
      firstSnowDate: firstSnow ? firstSnow[0] : null,
    };
  }
  return { season: "any", text: "Need new tires or a swap? Pick a day below — I'll suggest the ones when I'm already near you.", firstSnowDate: null };
}

function fmt(date) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

module.exports = { forecast, seasonAdvice };
