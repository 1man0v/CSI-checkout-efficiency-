// Аналитика по времени: суточные тренды (регион/сеть, календарь периода) и почасовые графики
// для drill-down по KPI-плашкам и кассам. Пункты 3, 8, 11, 12 замечаний к прототипу.

function storeIdsForScope(db, scope, region, storeId) {
  if (scope === "store" && storeId) return [storeId];
  const rows = db.prepare("SELECT id, region FROM stores").all();
  if (scope === "region" && region) return rows.filter(r => r.region === region).map(r => r.id);
  return rows.map(r => r.id);
}

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

// GET /api/analytics/daily?scope=&region=&storeId=&days=30
function dailySeries(db, query) {
  const days = Number(query.days) || 30;
  const ids = storeIdsForScope(db, query.scope, query.region, query.storeId);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT date, availability_pct, sco_share_pct FROM daily_summary
    WHERE store_id IN (${placeholders}) ORDER BY date`).all(...ids);
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, { availability: [], sco: [] });
    byDate.get(r.date).availability.push(r.availability_pct);
    byDate.get(r.date).sco.push(r.sco_share_pct);
  }
  const dates = [...byDate.keys()].sort().slice(-days);
  return dates.map(date => ({
    date,
    availability_pct: Math.round(avg(byDate.get(date).availability) * 10) / 10,
    sco_share_pct: Math.round(avg(byDate.get(date).sco) * 10) / 10
  }));
}

// GET /api/analytics/regions?days=7 — сводка по регионам с трендом (текущий период vs предыдущий).
function regionsSummary(db, query) {
  const days = Number(query.days) || 7;
  const stores = db.prepare("SELECT id, region FROM stores").all();
  const regions = [...new Set(stores.map(s => s.region))];
  const allDaily = db.prepare("SELECT store_id, date, availability_pct, sco_share_pct FROM daily_summary ORDER BY date").all();
  const dates = [...new Set(allDaily.map(r => r.date))].sort();
  const currentDates = new Set(dates.slice(-days));
  const previousDates = new Set(dates.slice(-2 * days, -days));

  function summarize(storeIds, dateSet) {
    const rows = allDaily.filter(r => storeIds.includes(r.store_id) && dateSet.has(r.date));
    return { availability: avg(rows.map(r => r.availability_pct)), sco: avg(rows.map(r => r.sco_share_pct)) };
  }

  return regions.map(region => {
    const ids = stores.filter(s => s.region === region).map(s => s.id);
    const cur = summarize(ids, currentDates);
    const prev = summarize(ids, previousDates);
    return {
      region,
      storeCount: ids.length,
      availability_pct: Math.round(cur.availability * 10) / 10,
      sco_share_pct: Math.round(cur.sco * 10) / 10,
      availability_trend: Math.round((cur.availability - prev.availability) * 10) / 10,
      sco_share_trend: Math.round((cur.sco - prev.sco) * 10) / 10
    };
  });
}

// GET /api/analytics/hourly?metric=availability|sco_share&scope=&region=&storeId=&hours=168
function hourlySeries(db, query) {
  const hours = Number(query.hours) || 168;
  const metric = query.metric === "sco_share" ? "sco_share_pct" : "availability_pct";
  const ids = storeIdsForScope(db, query.scope, query.region, query.storeId);
  if (!ids.length) return { points: [], trend: [], p95: 0 };
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT ts, ${metric} AS value FROM hourly_metrics WHERE store_id IN (${placeholders}) ORDER BY ts`).all(...ids);
  const byTs = new Map();
  for (const r of rows) {
    if (!byTs.has(r.ts)) byTs.set(r.ts, []);
    byTs.get(r.ts).push(r.value);
  }
  const tsList = [...byTs.keys()].sort().slice(-hours);
  const points = tsList.map(ts => ({ ts, value: Math.round(avg(byTs.get(ts)) * 10) / 10 }));
  // Скользящее среднее (окно 6 точек) в качестве линии тренда.
  const trend = points.map((p, i) => {
    const window = points.slice(Math.max(0, i - 5), i + 1);
    return { ts: p.ts, value: Math.round(avg(window.map(w => w.value)) * 10) / 10 };
  });
  const sorted = [...points.map(p => p.value)].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted.length ? sorted[Math.min(p95Index, sorted.length - 1)] : 0;
  return { points, trend, p95 };
}

// GET /api/registers/:id/history
function registerHistory(db, registerId) {
  const register = db.prepare("SELECT * FROM registers WHERE id = ?").get(registerId);
  if (!register) return null;
  const episodes = db.prepare("SELECT * FROM register_state_history WHERE register_id = ? ORDER BY started_at DESC").all(registerId);
  const now = Date.now();
  const totalsByStatus = {};
  const occurrencesByStatus = {};
  for (const ep of episodes) {
    const durationMin = ep.duration_minutes != null ? ep.duration_minutes : Math.round((now - new Date(ep.started_at).getTime()) / 60000);
    totalsByStatus[ep.status] = (totalsByStatus[ep.status] || 0) + durationMin;
    occurrencesByStatus[ep.status] = (occurrencesByStatus[ep.status] || 0) + 1;
  }
  return { register, episodes, totalsByStatus, occurrencesByStatus };
}

module.exports = { dailySeries, regionsSummary, hourlySeries, registerHistory };
