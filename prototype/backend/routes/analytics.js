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

// GET /api/analytics/counts?scope=&region=&storeId=&days=30&from=&to= — большая плашка ОД: количество
// магазинов/POS/КСО/аутсайдеров НА ДАТУ (не агрегат за период) — для тренда "текущий период vs
// предыдущий период той же длины" и для drill-down графиков по этим 4 показателям. Количество
// POS/КСО считается по дате регистрации на кассовом сервере (registers.installed_at) — касса
// остается в счете, даже если телеметрия не поступает 30+ дней (см. rules.js isRegisterStale,
// отдельное понятие). Количество аутсайдеров — упрощенно, только по доступности/доле SCO
// (историческая недельная нагрузка POS по дням не хранится, поэтom ветка "утилизация" правила
// classifyOutlier не воспроизводится день-в-день).
function countsSeries(db, query) {
  const days = Number(query.days) || 30;
  const ids = storeIdsForScope(db, query.scope, query.region, query.storeId);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const stores = db.prepare(`SELECT id, opened_at FROM stores WHERE id IN (${placeholders})`).all(...ids);
  const registers = db.prepare(`SELECT type, store_id, installed_at FROM registers WHERE store_id IN (${placeholders})`).all(...ids);
  const dailyRows = db.prepare(`SELECT store_id, date, availability_pct, sco_share_pct FROM daily_summary WHERE store_id IN (${placeholders})`).all(...ids);
  const settings = db.prepare("SELECT * FROM settings_network WHERE id = 1").get();
  const dailyByKey = new Map(dailyRows.map(r => [r.store_id + "|" + r.date, r]));

  const allDates = [...new Set(dailyRows.map(r => r.date))].sort();
  let dates;
  if (query.from && query.to) dates = allDates.filter(d => d >= query.from && d <= query.to);
  else dates = allDates.slice(-days);

  return dates.map(date => {
    const store_count = stores.filter(s => s.opened_at <= date).length;
    const pos_count = registers.filter(r => r.type === "POS" && r.installed_at <= date).length;
    const sco_count = registers.filter(r => r.type === "SCO" && r.installed_at <= date).length;
    let outlier_count = 0;
    for (const s of stores) {
      const row = dailyByKey.get(s.id + "|" + date);
      if (!row) continue;
      if (row.availability_pct < settings.availability_norm || row.sco_share_pct < settings.sco_share_norm) outlier_count++;
    }
    const outlier_pct = stores.length ? Math.round((outlier_count / stores.length) * 1000) / 10 : 0;
    return { date, store_count, pos_count, sco_count, outlier_count, outlier_pct };
  });
}

// GET /api/analytics/regions?days=7 — сводка по регионам с трендом (текущий период vs предыдущий)
// и именем регионального директора (замечание №5: нужна для контроля РД).
// utilization_pct (добавлено 2026-07-22) — средняя утилизация касс региона (POS+SCO вместе), для
// плашки "рейтинг региона" (СМ. business-rules-and-formulas.md, "14. Рейтинг региона/магазина").
function regionsSummary(db, query) {
  const days = Number(query.days) || 7;
  const stores = db.prepare("SELECT id, region FROM stores").all();
  const regions = [...new Set(stores.map(s => s.region))];
  const directors = new Map(db.prepare("SELECT region, regional_director FROM regions").all().map(r => [r.region, r.regional_director]));
  const allDaily = db.prepare("SELECT store_id, date, availability_pct, sco_share_pct FROM daily_summary ORDER BY date").all();
  const dates = [...new Set(allDaily.map(r => r.date))].sort();
  const currentDates = new Set(dates.slice(-days));
  const previousDates = new Set(dates.slice(-2 * days, -days));
  const registerUtil = db.prepare(`SELECT s.region AS region, r.utilization_pct AS utilization_pct FROM registers r JOIN stores s ON s.id = r.store_id`).all();

  function summarize(storeIds, dateSet) {
    const rows = allDaily.filter(r => storeIds.includes(r.store_id) && dateSet.has(r.date));
    return { availability: avg(rows.map(r => r.availability_pct)), sco: avg(rows.map(r => r.sco_share_pct)) };
  }

  return regions.map(region => {
    const ids = stores.filter(s => s.region === region).map(s => s.id);
    const cur = summarize(ids, currentDates);
    const prev = summarize(ids, previousDates);
    const utilization = avg(registerUtil.filter(r => r.region === region).map(r => r.utilization_pct));
    return {
      region,
      regionalDirector: directors.get(region) || "—",
      storeCount: ids.length,
      availability_pct: Math.round(cur.availability * 10) / 10,
      sco_share_pct: Math.round(cur.sco * 10) / 10,
      utilization_pct: Math.round(utilization * 10) / 10,
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

// GET /api/analytics/hourly-load?storeId=&days=7&from=&to= — плашка "Загрузка кассовой линии" на
// карточке магазина. Переписано 2026-09-13 по спецификации из
// /Users/aimanov/Downloads/sco capacity/prompt_dashboard_sco.md (формула "residual demand" — раздел
// "пропускная способность POS с учетом КСО"): пропускная способность POS считается по остатку спроса
// после того, как КСО забрала свою часть потока, а не изолированно. Если выбран один конкретный день
// (from === to) — фактические значения этого дня; если период длиннее — среднее по каждому часу дня
// за период. Часы вне [opening_hour; closing_hour) магазина не возвращаются.
//
// Входные величины по насыщенным интервалам заменены на среднее время чека по кассам магазина
// (registers.avg_seconds) — упрощенный вариант формулы (без регрессии время_чека = A + B×N_товаров,
// см. пометку в исходном промте — переходить на нее, когда будет накоплено достаточно транзакций).
// targetUtilization = 0.7 — та же константа, что уже использовалась для порога перегрузки ранее.
const TARGET_UTILIZATION = 0.7;
function hourlyLoadProfile(db, query) {
  const store = db.prepare("SELECT * FROM stores WHERE id = ?").get(query.storeId);
  if (!store) return { points: [], openingHour: 8, closingHour: 22, posCapacityPerKassa: 0, scoCapacityPerKassa: 0 };
  const registers = db.prepare("SELECT type, avg_seconds FROM registers WHERE store_id = ? AND avg_seconds IS NOT NULL").all(store.id);
  const avgSeconds = type => { const list = registers.filter(r => r.type === type).map(r => r.avg_seconds); return list.length ? avg(list) : 0; };
  // Эффективная пропускная способность ОДНОЙ кассы/терминала данного типа, чек/час, с учетом целевой
  // загрузки 70% (не 100% — иначе на графике никогда не было бы визуального "запаса" до предела).
  const posCapacityPerKassa = avgSeconds("POS") ? (3600 / avgSeconds("POS")) * TARGET_UTILIZATION : 0;
  const scoCapacityPerKassa = avgSeconds("SCO") ? (3600 / avgSeconds("SCO")) * TARGET_UTILIZATION : 0;

  const rows = db.prepare(`SELECT ts, pos_checks, sco_checks, pos_potential_checks, pos_open_count, sco_open_count
    FROM hourly_metrics WHERE store_id = ? ORDER BY ts`).all(store.id);
  const allDates = [...new Set(rows.map(r => r.ts.slice(0, 10)))].sort();
  let dateFrom, dateTo;
  if (query.from && query.to) { dateFrom = query.from; dateTo = query.to; }
  else {
    const days = Number(query.days) || 7;
    dateTo = allDates[allDates.length - 1];
    dateFrom = allDates[Math.max(0, allDates.length - days)];
  }
  const singleDay = dateFrom === dateTo;
  const filtered = rows.filter(r => { const d = r.ts.slice(0, 10); return d >= dateFrom && d <= dateTo; });
  const byHour = new Map();
  for (const r of filtered) {
    const hour = new Date(r.ts).getUTCHours();
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour).push(r);
  }
  const pick = (list, field) => list.length ? (singleDay ? list[list.length - 1][field] : avg(list.map(r => r[field]))) : 0;
  const points = [];
  for (let hour = store.opening_hour; hour < store.closing_hour; hour++) {
    const list = byHour.get(hour) || [];
    const posChecks = Math.round(pick(list, "pos_checks"));
    const scoChecks = Math.round(pick(list, "sco_checks"));
    const posPotential = Math.round(pick(list, "pos_potential_checks"));
    const posOpenCount = Math.round(pick(list, "pos_open_count"));
    const scoOpenCount = Math.round(pick(list, "sco_open_count"));

    const totalDemand = posChecks + scoChecks;
    const scoThroughput = Math.round(scoOpenCount * scoCapacityPerKassa);
    const residualForPos = Math.max(0, totalDemand - scoThroughput);
    const requiredKassCount = posCapacityPerKassa > 0 ? Math.ceil(residualForPos / posCapacityPerKassa) : 0;
    const posCapacity = Math.round(posOpenCount * posCapacityPerKassa);
    const isExcessPos = posOpenCount > requiredKassCount;
    // Обратный случай — открытых POS МЕНЬШЕ, чем требуется под остаток спроса после КСО: риск очередей
    // (в отличие от isExcessPos — переизбытка касс, спец нигде явно не вводит отдельный флаг для этого
    // случая, но он нужен отдельно от isExcessPos для честной диагностики магазинов-аутсайдеров по
    // причине "utilization" — там речь именно про перегрузку, а не про избыток персонала).
    const isUnderstaffed = posOpenCount < requiredKassCount;

    points.push({
      hour, pos_checks: posChecks, sco_checks: scoChecks, pos_potential_checks: posPotential,
      pos_open_count: posOpenCount, sco_open_count: scoOpenCount,
      pos_capacity: posCapacity, sco_throughput: scoThroughput,
      required_kass_count: requiredKassCount, is_excess_pos: isExcessPos, is_understaffed: isUnderstaffed
    });
  }
  return {
    points, openingHour: store.opening_hour, closingHour: store.closing_hour,
    posCapacityPerKassa: Math.round(posCapacityPerKassa), scoCapacityPerKassa: Math.round(scoCapacityPerKassa),
    dateFrom, dateTo, singleDay
  };
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

module.exports = { dailySeries, countsSeries, regionsSummary, hourlySeries, hourlyLoadProfile, registerHistory, posSummary, topCauseByStore };
