// Аналитика по времени: суточные тренды (регион/сеть, календарь периода) и почасовые графики
// для drill-down по KPI-плашкам и кассам. Пункты 1, 3, 4, 5, 6, 8, 11, 12 замечаний к прототипу.

function storeIdsForScope(db, scope, region, storeId) {
  if (scope === "store" && storeId) return [storeId];
  const rows = db.prepare("SELECT id, region FROM stores").all();
  if (scope === "region" && region) return rows.filter(r => r.region === region).map(r => r.id);
  return rows.map(r => r.id);
}

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

// Метрики, доступные для drill-down графиков (KPI-плашки → почасовой/суточный/недельный график).
// agg определяет способ агрегации при объединении нескольких магазинов в один период:
// проценты/доли — среднее, счетчики чеков — сумма (иначе "нагрузка сети" была бы средней по
// магазину вместо суммарной).
const METRIC_FIELDS = {
  availability: { column: "availability_pct", agg: "avg" },
  sco_share: { column: "sco_share_pct", agg: "avg" },
  pos_availability: { column: "pos_availability_pct", agg: "avg" },
  sco_checks: { column: "sco_checks", agg: "sum" },
  pos_checks: { column: "pos_checks", agg: "sum" }
};

// GET /api/analytics/daily?scope=&region=&storeId=&days=30&from=YYYY-MM-DD&to=YYYY-MM-DD
// from/to (если заданы) задают явный период календаря (замечание №1: реальный выбор диапазона
// дат, а не только пресеты) — days остается запасным вариантом для обратной совместимости.
function dailySeries(db, query) {
  const days = Number(query.days) || 30;
  const ids = storeIdsForScope(db, query.scope, query.region, query.storeId);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT date, availability_pct, sco_share_pct, pos_availability_pct, sco_checks, pos_checks
    FROM daily_summary WHERE store_id IN (${placeholders}) ORDER BY date`).all(...ids);
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  let dates;
  if (query.from && query.to) {
    dates = [...byDate.keys()].filter(d => d >= query.from && d <= query.to).sort();
  } else {
    dates = [...byDate.keys()].sort().slice(-days);
  }
  return dates.map(date => {
    const rowsForDate = byDate.get(date);
    return {
      date,
      availability_pct: Math.round(avg(rowsForDate.map(r => r.availability_pct)) * 10) / 10,
      sco_share_pct: Math.round(avg(rowsForDate.map(r => r.sco_share_pct)) * 10) / 10,
      pos_availability_pct: Math.round(avg(rowsForDate.map(r => r.pos_availability_pct)) * 10) / 10,
      sco_checks: Math.round(sum(rowsForDate.map(r => r.sco_checks))),
      pos_checks: Math.round(sum(rowsForDate.map(r => r.pos_checks)))
    };
  });
}

// GET /api/analytics/regions?days=7 — сводка по регионам с трендом (текущий период vs предыдущий)
// и именем регионального директора (замечание №5: нужна для контроля РД).
function regionsSummary(db, query) {
  const days = Number(query.days) || 7;
  const stores = db.prepare("SELECT id, region FROM stores").all();
  const regions = [...new Set(stores.map(s => s.region))];
  const directors = new Map(db.prepare("SELECT region, regional_director FROM regions").all().map(r => [r.region, r.regional_director]));
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
      regionalDirector: directors.get(region) || "—",
      storeCount: ids.length,
      availability_pct: Math.round(cur.availability * 10) / 10,
      sco_share_pct: Math.round(cur.sco * 10) / 10,
      availability_trend: Math.round((cur.availability - prev.availability) * 10) / 10,
      sco_share_trend: Math.round((cur.sco - prev.sco) * 10) / 10
    };
  });
}

// GET /api/analytics/pos?scope=&region=&storeId= — сводка по POS (замечание №4): доступность,
// количество чеков за неделю, технические сбои (без "кадровых" причин вроде перерыва кассира).
function posSummary(db, query) {
  const { isRegisterAvailable } = require("../rules");
  const ids = storeIdsForScope(db, query.scope, query.region, query.storeId);
  if (!ids.length) return { availability_pct: 0, checks_week: 0, causes: [] };
  const placeholders = ids.map(() => "?").join(",");
  const regs = db.prepare(`SELECT * FROM registers WHERE type = 'POS' AND store_id IN (${placeholders})`).all(...ids);
  const availableCount = regs.filter(isRegisterAvailable).length;
  const availability_pct = regs.length ? Math.round((availableCount / regs.length) * 1000) / 10 : 100;
  const checks_week = regs.reduce((sum, r) => sum + (r.checks_week || 0), 0);
  const causes = db.prepare("SELECT cause, hours, note FROM technical_causes WHERE applies_to = 'POS' ORDER BY hours DESC").all();
  return { availability_pct, checks_week, registerCount: regs.length, causes };
}

// Коды состояний касс -> отображаемое название причины (для верхней причины простоя магазина, замечание №6).
const STATUS_CAUSE_LABELS = {
  no_paper: "Нет бумаги",
  bank_error: "Ошибка банка",
  blocked: "Заблокирована сотрудником",
  scale_error: "Ошибка весов",
  scanner_error: "Ошибка сканера",
  printer_error: "Ошибка принтера",
  service_mode: "Сервисный режим",
  kkt_error: "Ошибка ККТ",
  acquiring_error: "Сбой терминала эквайринга",
  pos_scanner_error: "Ошибка сканера POS"
};
// Состояния, не считающиеся простоем (доступна/занята/офлайн-но-работает — см. business-rules).
const NON_DOWNTIME_STATUSES = new Set(["available", "occupied", "no_connection"]);

// Для каждого магазина — реальная причина простоя, забравшая больше всего времени (не общая
// категория "технический/бизнес-фактор", а конкретное название). Возвращает Map<storeId, {cause, minutes}>.
function topCauseByStore(db) {
  const rows = db.prepare(`
    SELECT r.store_id AS store_id, h.status AS status, h.duration_minutes AS duration_minutes,
           h.started_at AS started_at, h.ended_at AS ended_at
    FROM register_state_history h
    JOIN registers r ON r.id = h.register_id
  `).all();
  const now = Date.now();
  const byStore = new Map();
  for (const row of rows) {
    if (NON_DOWNTIME_STATUSES.has(row.status)) continue;
    const minutes = row.duration_minutes != null ? row.duration_minutes
      : Math.round((now - new Date(row.started_at).getTime()) / 60000);
    if (!byStore.has(row.store_id)) byStore.set(row.store_id, new Map());
    const byStatus = byStore.get(row.store_id);
    byStatus.set(row.status, (byStatus.get(row.status) || 0) + minutes);
  }
  const result = new Map();
  for (const [storeId, byStatus] of byStore) {
    let bestStatus = null, bestMinutes = -1;
    for (const [status, minutes] of byStatus) {
      if (minutes > bestMinutes) { bestStatus = status; bestMinutes = minutes; }
    }
    result.set(storeId, { cause: STATUS_CAUSE_LABELS[bestStatus] || bestStatus, minutes: bestMinutes });
  }
  return result;
}

// GET /api/analytics/hourly?metric=availability|sco_share|pos_availability|sco_checks|pos_checks&scope=&region=&storeId=&hours=168
function hourlySeries(db, query) {
  const hours = Number(query.hours) || 168;
  const spec = METRIC_FIELDS[query.metric] || METRIC_FIELDS.availability;
  const ids = storeIdsForScope(db, query.scope, query.region, query.storeId);
  if (!ids.length) return { points: [], trend: null, p95: null };
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT ts, ${spec.column} AS value FROM hourly_metrics WHERE store_id IN (${placeholders}) ORDER BY ts`).all(...ids);
  const byTs = new Map();
  for (const r of rows) {
    if (!byTs.has(r.ts)) byTs.set(r.ts, []);
    byTs.get(r.ts).push(r.value);
  }
  const tsList = [...byTs.keys()].sort().slice(-hours);
  const points = tsList.map(ts => {
    const values = byTs.get(ts);
    const value = spec.agg === "sum" ? sum(values) : avg(values);
    return { ts, value: Math.round(value * 10) / 10 };
  });
  // Скользящее среднее (окно 6 точек) и p95 имеют смысл только для процентных метрик
  // (для счетчиков чеков нагрузка отображается столбчатой диаграммой без тренда/персентиля).
  if (spec.agg !== "avg") return { points, trend: null, p95: null };
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

module.exports = { dailySeries, regionsSummary, hourlySeries, registerHistory, posSummary, topCauseByStore };
