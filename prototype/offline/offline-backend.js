// Офлайн-версия backend'а прототипа: те же функции, что в backend/routes/*.js и
// backend/routes/analytics.js, но работают над данными в памяти (window.OFFLINE_DATA,
// встроенными в HTML при сборке — см. build-offline.js) вместо SQLite. Бизнес-правила
// (rules.js) используются БЕЗ ИЗМЕНЕНИЙ — они уже были чистыми функциями без SQL.
// Портировано вручную, 1:1 с server-версией — при изменении backend/routes/*.js
// соответствующую функцию здесь нужно обновить так же (build-offline.js это не проверяет).
(function () {
  const DATA = window.OFFLINE_DATA;
  const { classifyOutlier, isRegisterAvailable, isRegisterStale, staleDays, nextEscalation, effectiveSettings } = window.OfflineRules;

  function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
  function round1(v) { return Math.round(v * 10) / 10; }
  function byIdAsc(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
  function newId(rows) { return rows.length ? Math.max(...rows.map(r => r.id)) + 1 : 1; }

  // ---------- stores.js ----------
  function listStores(query) {
    let scoped = [...DATA.stores].sort((a, b) => (a.number < b.number ? -1 : a.number > b.number ? 1 : 0));
    if (query.scope === "region" && query.region) scoped = scoped.filter(s => s.region === query.region);
    else if (query.scope === "store" && query.storeId) scoped = scoped.filter(s => s.id === query.storeId);
    const settings = getEffectiveSettingsData(query.region || null);
    const topCauses = topCauseByStore();
    const utilByStore = new Map();
    for (const r of DATA.registers) {
      if (!utilByStore.has(r.store_id)) utilByStore.set(r.store_id, []);
      utilByStore.get(r.store_id).push(r.utilization_pct);
    }
    return scoped.map(s => ({ ...s, ...classifyOutlier(s, settings), top_cause: (topCauses.get(s.id) || {}).cause || null,
      utilization_pct: utilByStore.has(s.id) ? round1(avg(utilByStore.get(s.id))) : 0 }));
  }
  function getStore(id) {
    const store = DATA.stores.find(s => s.id === id);
    if (!store) return null;
    const registers = DATA.registers.filter(r => r.store_id === id).sort(byIdAsc)
      .map(r => ({ ...r, is_available: isRegisterAvailable(r), is_stale: isRegisterStale(r), stale_days: isRegisterStale(r) ? staleDays(r) : null }));
    const settings = getEffectiveSettingsData(store.region);
    return { ...store, ...classifyOutlier(store, settings), registers, settings };
  }

  // ---------- causes.js ----------
  function listCauses() { return [...DATA.technical_causes].sort((a, b) => b.hours - a.hours); }
  function createTicket(body) {
    const description = (body.description || "").trim();
    if (!description) return { status: 400, body: { error: "Опишите неисправность" } };
    const ticket = { id: newId(DATA.it_tickets), register_id: body.registerId || null, description, created_at: new Date().toISOString() };
    DATA.it_tickets.push(ticket);
    return { status: 201, body: ticket };
  }
  function listTickets() { return [...DATA.it_tickets].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 20); }

  // ---------- settings.js ----------
  function getEffectiveSettingsData(region) {
    const regional = region ? DATA.settings_regional.find(r => r.region === region) : null;
    return effectiveSettings(DATA.settings_network, regional);
  }
  function getSettings(region) {
    const regional = region ? DATA.settings_regional.find(r => r.region === region) : null;
    return { network: DATA.settings_network, regional: regional || null, effective: effectiveSettings(DATA.settings_network, regional || {}) };
  }
  const NETWORK_FIELDS = new Set(["availability_norm", "sco_share_norm", "p95_pos", "p95_sco", "p95_touch", "p95_hybrid",
    "sco_weekly_norm", "pos_weekly_norm", "pos_upper_overload", "pos_lower_excess_staff", "cashier_hourly_rate"]);
  const REGIONAL_HIGHER_BETTER_FIELDS = new Set(["availability_norm", "sco_share_norm"]);
  const NETWORK_STRING_FIELDS = new Set(["currency"]);
  const SUPPORTED_CURRENCIES = new Set(["RUB", "USD", "EUR"]);
  function updateSettings(body) {
    const { role, region, field, value } = body;
    if (NETWORK_STRING_FIELDS.has(field)) {
      if (role !== "od") return { status: 403, body: { error: "Роль не может изменять настройки" } };
      if (!SUPPORTED_CURRENCIES.has(value)) return { status: 400, body: { error: "Неизвестная валюта" } };
      DATA.settings_network.currency = value;
      return { status: 200, body: { saved: true, field, value, scope: "network" } };
    }
    if (!NETWORK_FIELDS.has(field)) return { status: 400, body: { error: `Неизвестное поле настройки: ${field}` } };
    const numValue = Number(value);
    if (!Number.isFinite(numValue) || numValue < 0) return { status: 400, body: { error: "Некорректное значение — укажите неотрицательное число" } };
    if (role === "od") {
      DATA.settings_network[field] = numValue;
      return { status: 200, body: { saved: true, field, value: numValue, scope: "network" } };
    }
    if (role === "rd") {
      if (!region) return { status: 400, body: { error: "Не указан регион" } };
      if (!REGIONAL_HIGHER_BETTER_FIELDS.has(field)) return { status: 403, body: { error: "РД не может менять это поле — только доступность/долю SCO своего региона" } };
      const networkValue = DATA.settings_network[field];
      if (numValue < networkValue) {
        DATA.settings_approval_requests.push({
          id: newId(DATA.settings_approval_requests), region, field, requested_value: numValue,
          current_network_value: networkValue, status: "pending", created_at: new Date().toISOString(), resolved_at: null
        });
        return { status: 202, body: { approvalRequired: true, message: "Запрос на согласование отправлен Операционному директору (значение ниже сетевого норматива)." } };
      }
      let regional = DATA.settings_regional.find(r => r.region === region);
      if (!regional) { regional = { region }; DATA.settings_regional.push(regional); }
      regional[field] = numValue;
      return { status: 200, body: { saved: true, field, value: numValue, scope: "region", region } };
    }
    return { status: 403, body: { error: "Роль не может изменять настройки" } };
  }
  function listApprovals() { return DATA.settings_approval_requests.filter(r => r.status === "pending").sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); }
  function resolveApproval(id, decision) {
    const req = DATA.settings_approval_requests.find(r => r.id === id);
    if (!req) return { status: 404, body: { error: "Запрос не найден" } };
    req.status = decision; req.resolved_at = new Date().toISOString();
    if (decision === "approved") {
      let regional = DATA.settings_regional.find(r => r.region === req.region);
      if (!regional) { regional = { region: req.region }; DATA.settings_regional.push(regional); }
      regional[req.field] = req.requested_value;
    }
    return { status: 200, body: { resolved: true, decision } };
  }

  // ---------- tasks.js ----------
  function listTasks(storeId) {
    const rows = storeId ? DATA.tasks.filter(t => t.store_id === storeId) : DATA.tasks;
    return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
  function createTask(body) {
    const title = (body.title || "").trim();
    if (!title) return { status: 400, body: { error: "Укажите заголовок задачи" } };
    if (!body.storeId) return { status: 400, body: { error: "Выберите магазин" } };
    const store = DATA.stores.find(s => s.id === body.storeId);
    if (!store) return { status: 400, body: { error: `Магазин «${body.storeId}» не найден` } };
    if (body.registerId) {
      const register = DATA.registers.find(r => r.id === body.registerId && r.store_id === body.storeId);
      if (!register) return { status: 400, body: { error: `Касса «${body.registerId}» не найдена в магазине ${body.storeId}` } };
    }
    if (!body.dueAt) return { status: 400, body: { error: "Укажите срок выполнения" } };
    const id = "T-" + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10));
    const now = new Date().toISOString();
    const assignee = (body.assignee || "").trim() || `${store.director_name} (директор магазина ${store.number})`;
    const task = {
      id, title, store_id: body.storeId, register_id: body.registerId || null, created_by: body.createdBy || "—",
      assignee, status: "new", target_kpi: body.targetKpi || "—", due_at: body.dueAt, escalated: 0, escalated_to: null,
      created_at: now, updated_at: now
    };
    DATA.tasks.push(task);
    return { status: 201, body: task };
  }
  function updateTaskStatus(id, status) {
    if (!["new", "in_progress", "done"].includes(status)) return { status: 400, body: { error: "Некорректный статус" } };
    const task = DATA.tasks.find(t => t.id === id);
    if (!task) return { status: 404, body: { error: "Задача не найдена" } };
    task.status = status; task.updated_at = new Date().toISOString();
    return { status: 200, body: task };
  }
  function escalateTask(id) {
    const task = DATA.tasks.find(t => t.id === id);
    if (!task) return { status: 404, body: { error: "Задача не найдена" } };
    task.escalated = 1; task.escalated_to = nextEscalation(task); task.updated_at = new Date().toISOString();
    return { status: 200, body: task };
  }

  // ---------- misc.js ----------
  function diagnostics(search) {
    const rows = DATA.registers.map(r => {
      const s = DATA.stores.find(st => st.id === r.store_id);
      return { ...r, revenue_week: Math.round(r.checks_week * 780), store_label: `${s.number} «${s.name}»`, sco_share_pct: s.sco_share_pct,
        is_stale: isRegisterStale(r), stale_days: isRegisterStale(r) ? staleDays(r) : null };
    }).sort(byIdAsc);
    if (!search) return rows.slice(0, 20);
    const needle = search.toLowerCase();
    return rows.filter(r => r.id.toLowerCase().includes(needle) || r.store_label.toLowerCase().includes(needle)).slice(0, 20);
  }
  function usageStats() { return [...DATA.usage_stats].sort((a, b) => b.opens - a.opens); }
  const SCRIPTED_ANSWERS = {
    "что сегодня мешает эффективности магазина?": {
      conclusion: "Основная причина снижения эффективности — недоступность КСО в пиковый период.",
      facts: [
        "В 12:00 наблюдалась пиковая нагрузка (20 чеков против среднего 15.4/час)",
        "Доступность КСО за период составила 72%",
        "Простой КСО (110 минут) пришелся на период 12:00–13:00 — совпадает с пиковой нагрузкой"
      ],
      hypothesis: { name: "КСО недоступны в пиковые часы", confidence: 0.91 },
      recommendations: [
        "Проверить причины недоступности КСО: блокировки, ошибки оборудования, бумагу, эквайринг",
        "Обеспечить контроль КСО в часы пик"
      ]
    }
  };
  function askAdvisor(question) {
    const key = (question || "").trim().toLowerCase();
    return SCRIPTED_ANSWERS[key] || {
      conclusion: "Демо поддерживает сценарный ответ только для примера из документации.",
      facts: ["Попробуйте вопрос: «Что сегодня мешает эффективности магазина?»"],
      hypothesis: { name: "—", confidence: 0 }, recommendations: []
    };
  }

  // ---------- analytics.js ----------
  function storeIdsForScope(scope, region, storeId) {
    if (scope === "store" && storeId) return [storeId];
    if (scope === "region" && region) return DATA.stores.filter(s => s.region === region).map(s => s.id);
    return DATA.stores.map(s => s.id);
  }
  const METRIC_FIELDS = {
    availability: { column: "availability_pct", agg: "avg" }, sco_share: { column: "sco_share_pct", agg: "avg" },
    pos_availability: { column: "pos_availability_pct", agg: "avg" }, sco_checks: { column: "sco_checks", agg: "sum" },
    pos_checks: { column: "pos_checks", agg: "sum" }
  };
  function dailySeries(query) {
    const days = Number(query.days) || 30;
    const ids = storeIdsForScope(query.scope, query.region, query.storeId);
    if (!ids.length) return [];
    const rows = DATA.daily_summary.filter(r => ids.includes(r.store_id));
    const byDate = new Map();
    for (const r of rows) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }
    let dates;
    if (query.from && query.to) dates = [...byDate.keys()].filter(d => d >= query.from && d <= query.to).sort();
    else dates = [...byDate.keys()].sort().slice(-days);
    return dates.map(date => {
      const rowsForDate = byDate.get(date);
      return {
        date,
        availability_pct: round1(avg(rowsForDate.map(r => r.availability_pct))),
        sco_share_pct: round1(avg(rowsForDate.map(r => r.sco_share_pct))),
        pos_availability_pct: round1(avg(rowsForDate.map(r => r.pos_availability_pct))),
        sco_checks: Math.round(sum(rowsForDate.map(r => r.sco_checks))),
        pos_checks: Math.round(sum(rowsForDate.map(r => r.pos_checks)))
      };
    });
  }
  // Большая плашка ОД: количество магазинов/POS/КСО/аутсайдеров НА ДАТУ (не агрегат за период) —
  // считается по датам регистрации на кассовом сервере (opened_at/installed_at), не по телеметрии.
  function countsSeries(query) {
    const days = Number(query.days) || 30;
    const ids = storeIdsForScope(query.scope, query.region, query.storeId);
    if (!ids.length) return [];
    const stores = DATA.stores.filter(s => ids.includes(s.id));
    const registers = DATA.registers.filter(r => ids.includes(r.store_id));
    const dailyRows = DATA.daily_summary.filter(r => ids.includes(r.store_id));
    const settings = DATA.settings_network;
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
  function regionsSummary(query) {
    const days = Number(query.days) || 7;
    const regions = [...new Set(DATA.stores.map(s => s.region))];
    const directors = new Map(DATA.regions.map(r => [r.region, r.regional_director]));
    const allDaily = DATA.daily_summary;
    const dates = [...new Set(allDaily.map(r => r.date))].sort();
    const currentDates = new Set(dates.slice(-days));
    const previousDates = new Set(dates.slice(-2 * days, -days));
    const regionByStore = new Map(DATA.stores.map(s => [s.id, s.region]));
    function summarize(storeIds, dateSet) {
      const rows = allDaily.filter(r => storeIds.includes(r.store_id) && dateSet.has(r.date));
      return { availability: avg(rows.map(r => r.availability_pct)), sco: avg(rows.map(r => r.sco_share_pct)) };
    }
    return regions.map(region => {
      const ids = DATA.stores.filter(s => s.region === region).map(s => s.id);
      const cur = summarize(ids, currentDates);
      const prev = summarize(ids, previousDates);
      const utilization = avg(DATA.registers.filter(r => regionByStore.get(r.store_id) === region).map(r => r.utilization_pct));
      return {
        region, regionalDirector: directors.get(region) || "—", storeCount: ids.length,
        availability_pct: round1(cur.availability), sco_share_pct: round1(cur.sco), utilization_pct: round1(utilization),
        availability_trend: round1(cur.availability - prev.availability), sco_share_trend: round1(cur.sco - prev.sco)
      };
    });
  }
  function posSummary(query) {
    const ids = storeIdsForScope(query.scope, query.region, query.storeId);
    if (!ids.length) return { availability_pct: 0, checks_week: 0, causes: [] };
    const regs = DATA.registers.filter(r => r.type === "POS" && ids.includes(r.store_id));
    const availableCount = regs.filter(isRegisterAvailable).length;
    const availability_pct = regs.length ? Math.round((availableCount / regs.length) * 1000) / 10 : 100;
    const checks_week = regs.reduce((s, r) => s + (r.checks_week || 0), 0);
    const causes = [...DATA.technical_causes].filter(c => c.applies_to === "POS").sort((a, b) => b.hours - a.hours);
    return { availability_pct, checks_week, registerCount: regs.length, causes };
  }
  const STATUS_CAUSE_LABELS = {
    no_paper: "Нет бумаги", bank_error: "Ошибка банка", blocked: "Заблокирована сотрудником", scale_error: "Ошибка весов",
    scanner_error: "Ошибка сканера", printer_error: "Ошибка принтера", service_mode: "Сервисный режим", kkt_error: "Ошибка ККТ",
    acquiring_error: "Сбой терминала эквайринга", pos_scanner_error: "Ошибка сканера POS"
  };
  const NON_DOWNTIME_STATUSES = new Set(["available", "occupied", "no_connection"]);
  function topCauseByStore() {
    const now = Date.now();
    const byStore = new Map();
    for (const h of DATA.register_state_history) {
      if (NON_DOWNTIME_STATUSES.has(h.status)) continue;
      const register = DATA.registers.find(r => r.id === h.register_id);
      if (!register) continue;
      const minutes = h.duration_minutes != null ? h.duration_minutes : Math.round((now - new Date(h.started_at).getTime()) / 60000);
      if (!byStore.has(register.store_id)) byStore.set(register.store_id, new Map());
      const byStatus = byStore.get(register.store_id);
      byStatus.set(h.status, (byStatus.get(h.status) || 0) + minutes);
    }
    const result = new Map();
    for (const [storeId, byStatus] of byStore) {
      let bestStatus = null, bestMinutes = -1;
      for (const [status, minutes] of byStatus) if (minutes > bestMinutes) { bestStatus = status; bestMinutes = minutes; }
      result.set(storeId, { cause: STATUS_CAUSE_LABELS[bestStatus] || bestStatus, minutes: bestMinutes });
    }
    return result;
  }
  function hourlySeries(query) {
    const hours = Number(query.hours) || 168;
    const spec = METRIC_FIELDS[query.metric] || METRIC_FIELDS.availability;
    const ids = storeIdsForScope(query.scope, query.region, query.storeId);
    if (!ids.length) return { points: [], trend: null, p95: null };
    const rows = DATA.hourly_metrics.filter(r => ids.includes(r.store_id));
    const byTs = new Map();
    for (const r of rows) { if (!byTs.has(r.ts)) byTs.set(r.ts, []); byTs.get(r.ts).push(r[spec.column]); }
    const tsList = [...byTs.keys()].sort().slice(-hours);
    const points = tsList.map(ts => {
      const values = byTs.get(ts);
      const value = spec.agg === "sum" ? sum(values) : avg(values);
      return { ts, value: round1(value) };
    });
    if (spec.agg !== "avg") return { points, trend: null, p95: null };
    const trend = points.map((p, i) => {
      const w = points.slice(Math.max(0, i - 5), i + 1);
      return { ts: p.ts, value: round1(avg(w.map(x => x.value))) };
    });
    const sorted = [...points.map(p => p.value)].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95 = sorted.length ? sorted[Math.min(p95Index, sorted.length - 1)] : 0;
    return { points, trend, p95 };
  }
  // Портировано 1:1 с backend/routes/analytics.js hourlyLoadProfile (2026-09-13, formula "residual
  // demand" — см. пояснение там же и /Users/aimanov/Downloads/sco capacity/*).
  const TARGET_UTILIZATION = 0.7;
  function hourlyLoadProfile(query) {
    const store = DATA.stores.find(s => s.id === query.storeId);
    if (!store) return { points: [], openingHour: 8, closingHour: 22, posCapacityPerKassa: 0, scoCapacityPerKassa: 0 };
    const registers = DATA.registers.filter(r => r.store_id === store.id && r.avg_seconds != null);
    const avgSeconds = type => { const list = registers.filter(r => r.type === type).map(r => r.avg_seconds); return list.length ? avg(list) : 0; };
    const posCapacityPerKassa = avgSeconds("POS") ? (3600 / avgSeconds("POS")) * TARGET_UTILIZATION : 0;
    const scoCapacityPerKassa = avgSeconds("SCO") ? (3600 / avgSeconds("SCO")) * TARGET_UTILIZATION : 0;

    const rows = [...DATA.hourly_metrics].filter(r => r.store_id === store.id).sort((a, b) => (a.ts < b.ts ? -1 : 1));
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
      posCapacityPerKassa: Math.round(posCapacityPerKassa), scoCapacityPerKassa: Math.round(scoCapacityPerKassa)
    };
  }
  function registerHistory(registerId) {
    const register = DATA.registers.find(r => r.id === registerId);
    if (!register) return null;
    const episodes = [...DATA.register_state_history].filter(h => h.register_id === registerId).sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
    const now = Date.now();
    const totalsByStatus = {}, occurrencesByStatus = {};
    for (const ep of episodes) {
      const durationMin = ep.duration_minutes != null ? ep.duration_minutes : Math.round((now - new Date(ep.started_at).getTime()) / 60000);
      totalsByStatus[ep.status] = (totalsByStatus[ep.status] || 0) + durationMin;
      occurrencesByStatus[ep.status] = (occurrencesByStatus[ep.status] || 0) + 1;
    }
    return { register, episodes, totalsByStatus, occurrencesByStatus };
  }

  window.OfflineBackend = {
    listStores, getStore, listCauses, createTicket, listTickets,
    getSettings, updateSettings, listApprovals, resolveApproval,
    listTasks, createTask, updateTaskStatus, escalateTask,
    diagnostics, usageStats, askAdvisor,
    dailySeries, countsSeries, regionsSummary, hourlySeries, hourlyLoadProfile, registerHistory, posSummary
  };
})();
