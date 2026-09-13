// Пересоздает схему и заполняет БД демонстрационными данными.
// Обновлено 2026-09-13: доля SCO, потенциал SCO, нагрузка (чек/нед), скорость обслуживания
// (avg/p95 по каждой кассе) и почасовые/суточные ряды чеков теперь считаются из РЕАЛЬНОГО экспорта
// чеков сети за март 2026 (см. `seed-data/real-transactions-2026-03.json`, посчитан из сырого
// экспорта ~763 тыс. чеков одноразовым скриптом, сам сырой файл в репозиторий не включен из-за
// размера ~140 МБ). Список из 11 реальных номеров магазинов и 99 касс — реальный. Все, для чего в
// исходном экспорте нет данных, остается синтетическим (см. пометки REAL/PLACEHOLDER ниже):
//   - Название/регион/формат/ФИО директора магазина — в экспорте только номер магазина, без
//     мастер-данных. Значения ниже — правдоподобные ЗАГЛУШКИ до реального маппинга от заказчика.
//   - Доступность кассы (availability_pct) — в чеках нет телеметрии "касса работала/не работала",
//     только сами продажи. Остается иллюстративной синтетикой, как и раньше.
//   - Часы работы магазина (opening_hour/closing_hour) — не мастер-данные, а ОЦЕНКА по часам, когда
//     в магазине реально были чеки за март (см. скрипт агрегации).
//   - Текущий статус конкретной кассы (available/no_paper/bank_error/no_connection/"не в
//     эксплуатации") — экспорт чеков историчен (за прошедший март) и не содержит "текущего" состояния
//     оборудования. Наложен поверх реальных показателей нагрузки как синтетический слой на нескольких
//     явно отмеченных кассах — ровно так же, как этот слой был синтетическим и в предыдущей версии
//     прототипа (там весь набор данных был синтетическим целиком).
// Суточные/почасовые ряды: в реальном экспорте только 30 дней (март), а календарь/тренды прототипа
// строятся относительно "сейчас" (последние 60 дней). Реальный 30-дневный цикл переигрывается дважды
// подряд, чтобы окно на 60 дней не пустовало — see cycleReal* ниже. Это решение зафиксировано
// пользователем (не нужно ждать новых выгрузок) в ходе доработки 2026-09-13.
const fs = require("node:fs");
const path = require("node:path");
const { openDb } = require("./db");

const DROP_ALL = `
DROP TABLE IF EXISTS register_state_history;
DROP TABLE IF EXISTS hourly_metrics;
DROP TABLE IF EXISTS daily_summary;
DROP TABLE IF EXISTS usage_stats;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS settings_approval_requests;
DROP TABLE IF EXISTS settings_regional;
DROP TABLE IF EXISTS settings_network;
DROP TABLE IF EXISTS it_tickets;
DROP TABLE IF EXISTS technical_causes;
DROP TABLE IF EXISTS registers;
DROP TABLE IF EXISTS regions;
DROP TABLE IF EXISTS stores;
`;

// Детерминированный псевдослучайный генератор — посев воспроизводим между запусками. Используется
// только там, где данных в реальном экспорте нет (доступность, шум по дням/часам).
let seedValue = 42;
function rnd(max) { seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff; return seedValue % max; }
function rndFloat() { return rnd(10000) / 10000; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function isoHoursAgo(h) { return new Date(Date.now() - h * 3600 * 1000).toISOString(); }
function isoDaysAgo(d) { return new Date(Date.now() - d * 86400 * 1000).toISOString(); }
function dateDaysAgo(d) { return isoDaysAgo(d).slice(0, 10); }

const REAL = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-data", "real-transactions-2026-03.json"), "utf8"));
// Целевые чеки КСО и число различных касс с хотя бы одним чеком за час (2026-09-13, "график потоков" —
// см. /Users/aimanov/Downloads/sco capacity/prompt_dashboard_sco.md) — отдельный файл, т.к. посчитан
// другим проходом по тому же сырому экспорту (не входил в первоначальную агрегацию).
const CAPACITY = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-data", "hourly-capacity-2026-03.json"), "utf8"));
// Реальные календарные даты марта, по возрастанию (обычно 30 штук — 01..30.03.2026).
const REAL_DATES = Object.keys(REAL.stores["121"].daily).sort();
const REAL_DAYS_N = REAL_DATES.length;

// d=0 — "сегодня" (самая свежая дата в 60-дневном синтетическом окне) -> последняя реальная дата
// марта; d=29 -> первая реальная дата; d=30..59 — тот же цикл повторяется.
function realDateForOffset(d) { return REAL_DATES[REAL_DATES.length - 1 - (d % REAL_DAYS_N)]; }

// --- ЗАГЛУШКИ мастер-данных для 11 реальных номеров магазинов (нет в источнике — см. пояснение
// в шапке файла). Формат "Супермаркет" — не мастер-данные, а грубая оценка по числу касс (7-10 на
// магазин: слишком много для "магазина у дома", слишком мало для гипермаркета). ---
const STORE_PLACEHOLDERS = {
  "121": { name: "Северный", region: "Регион 1", director_name: "Егорова Мария Владимировна" },
  "134": { name: "Лесной", region: "Регион 3", director_name: "Тарасов Виктор Николаевич" },
  "291": { name: "Заводской", region: "Регион 1", director_name: "Белова Светлана Игоревна" },
  "352": { name: "Первомайский", region: "Регион 1", director_name: "Романов Дмитрий Сергеевич" },
  "375": { name: "Солнечный", region: "Регион 2", director_name: "Кириллова Наталья Андреевна" },
  "378": { name: "Троицкий", region: "Регион 2", director_name: "Фомин Алексей Петрович" },
  "458": { name: "Юбилейный", region: "Регион 2", director_name: "Гаврилова Ольга Дмитриевна" },
  "483": { name: "Центральный", region: "Регион 2", director_name: "Мельников Игорь Юрьевич" },
  "531": { name: "Полевой", region: "Регион 3", director_name: "Сафонова Екатерина Романовна" },
  "537": { name: "Озёрный", region: "Регион 3", director_name: "Жуков Павел Викторович" },
  "66": { name: "Вокзальный", region: "Регион 3", director_name: "Абрамова Инна Олеговна" }
};

// Доступность и тренд — синтетические (см. шапку файла): 375 и 531 намеренно ниже норматива 90%,
// чтобы у обоих был содержательный повод оказаться в списке аутсайдеров (это же две кассы с
// синтетическими техническими статусами ниже — bank_error и "не в эксплуатации").
const STORE_SYNTHETIC = {
  "121": { availability_pct: 96, trend: "flat" },
  "134": { availability_pct: 93, trend: "flat" },
  "291": { availability_pct: 95, trend: "flat" },
  "352": { availability_pct: 97, trend: "flat" },
  "375": { availability_pct: 88, trend: "down" },
  "378": { availability_pct: 94, trend: "flat" },
  "458": { availability_pct: 96, trend: "flat" },
  "483": { availability_pct: 98, trend: "up" },
  "531": { availability_pct: 83, trend: "down" },
  "537": { availability_pct: 91, trend: "up" },
  "66": { availability_pct: 90, trend: "flat" }
};

// Синтетический слой "текущего" статуса кассы поверх реальных показателей нагрузки конкретных касс
// (нет аналога в экспорте чеков — см. шапку файла). offline_but_available отражает тот же кейс
// "нет связи, но касса продолжала работать", что и раньше.
const REGISTER_STATUS_OVERRIDES = {
  "121-23": { status: "no_paper" },
  "375-2": { status: "bank_error" },
  "66-26": { status: "no_connection", offline_but_available: 1,
    note: "Временная потеря связи с сервером — касса продолжала обслуживать покупателей и накапливать данные локально; при восстановлении связи данные переданы без потерь. Считается доступной." },
  "531-1": { staleDaysAgo: 38, note: "Телеметрия не поступает 38 дней — касса числится в реестре кассового сервера, но фактически не в эксплуатации." }
};
// Кассы, недавно зарегистрированные на кассовом сервере — для проверки динамики "количество POS/КСО"
// на большой плашке ОД в 7- и 30-дневном окне (см. пояснение в исходной версии сида).
const REGISTER_INSTALL_OVERRIDES = {
  "291-4": { installedDaysAgo: 3 }, "291-25": { installedDaysAgo: 3 },
  "458-3": { installedDaysAgo: 18 }, "458-24": { installedDaysAgo: 18 }
};
// Пара POS в паре магазинов — исключительно косметика для таблицы касс (не влияет на расчеты).
const OCCUPIED_REGISTERS = new Set(["483-5", "375-5"]);

// Единственное умышленное искажение реальных чисел в этом наборе данных (2026-09-13): ни один из
// реальных магазинов не демонстрирует классический кейс "низкая доля SCO при нормальной доступности"
// (business-outlier, методология Confluence SCO/6133710853, кейс "магазин №404") — в реальной выборке
// доля SCO везде уже выше норматива 30%. Магазин 134 «Лесной» (реально доля SCO 53.7%, checks_week по
// SCO 21..26: 1148/1175/1635/1603/1282/1075, итого 7917 при pos_load_week=6833) занижен до ~12.3% доли
// SCO, чтобы диагностика (см. app.js renderDiagnosis) была на чем показать обе её ветки для business-
// причины: касса 134-26 занижена сильнее сестринских — "технически исправна, но почти не используется"
// (как SCO №4 в кейсе методологии), 134-21..25 занижены пропорционально слабее — иллюстрируют системную
// недогрузку. avg_seconds/p95_seconds остаются реальными — искажен только объем (checks_week), не
// скорость обслуживания. daily_summary/hourly_metrics для этого магазина масштабируют реальный
// sco_checks тем же общим коэффициентом, чтобы график "доля чеков КСО" тоже показывал ровные ~12-13%
// (не только KPI-плашка), а не расходился с ней.
const SCO_SHARE_DEMO_OVERRIDE = {
  "134": {
    registers: { "21": 150, "22": 155, "23": 220, "24": 215, "25": 175, "26": 40 },
    dailyHourlyScale: 955 / 7917
  }
};

function seed() {
  const db = openDb();
  db.exec(DROP_ALL);
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

  const storeIds = Object.keys(REAL.stores).sort();

  const insertStore = db.prepare(`INSERT INTO stores (id, number, name, region, format, director_name, availability_pct, sco_share_pct, potential_sco_pct, pos_load_week, sco_load_week, opened_at, opening_hour, closing_hour)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertRegister = db.prepare(`INSERT INTO registers (id, store_id, type, status, p95_seconds, avg_seconds, checks_week, utilization_pct, offline_but_available, note, installed_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  // Все магазины "всегда существовали" (>1 года назад) — динамика "количества магазинов" на
  // большой плашке ОД корректно остается плоской (0), реалистично для розничной сети за 7-30 дней.
  const STORE_OPENED_AT = dateDaysAgo(400);
  const REGISTER_DEFAULT_INSTALLED_AT = dateDaysAgo(400);

  for (const id of storeIds) {
    const real = REAL.stores[id];
    const ph = STORE_PLACEHOLDERS[id];
    const syn = STORE_SYNTHETIC[id];
    const scoDemo = SCO_SHARE_DEMO_OVERRIDE[id];
    // Если для магазина задан демо-оверрайд доли SCO — sco_load_week и sco_share_pct пересчитываются
    // из суммы переопределенных checks_week по кассам SCO (см. SCO_SHARE_DEMO_OVERRIDE выше), а не
    // берутся из реального агрегата.
    const scoLoadWeek = scoDemo ? Object.values(scoDemo.registers).reduce((a, b) => a + b, 0) : real.sco_load_week;
    const scoSharePct = scoDemo ? Math.round((scoLoadWeek / (scoLoadWeek + real.pos_load_week)) * 1000) / 10 : real.sco_share_pct;
    insertStore.run(id, `№${id}`, ph.name, ph.region, "Супермаркет", ph.director_name,
      syn.availability_pct, scoSharePct, real.potential_sco_pct, real.pos_load_week, scoLoadWeek,
      STORE_OPENED_AT, real.opening_hour, real.closing_hour);

    const dayHours = Math.max(1, real.closing_hour - real.opening_hour);
    for (const kassa of Object.keys(real.registers).sort()) {
      const reg = real.registers[kassa];
      const regId = `${id}-${kassa}`;
      const override = REGISTER_STATUS_OVERRIDES[regId] || {};
      const installOverride = REGISTER_INSTALL_OVERRIDES[regId] || {};
      const status = override.status || (OCCUPIED_REGISTERS.has(regId) ? "occupied" : "available");
      const checksWeek = (scoDemo && scoDemo.registers[kassa] != null) ? scoDemo.registers[kassa] : reg.checks_week;
      // Утилизация — доля времени в продаже от времени работы магазина (нет данных по фактической
      // доступности конкретной кассы, поэтому знаменатель — часы работы магазина, а не простой кассы).
      const utilizationPct = clamp(Math.round((reg.avg_seconds * checksWeek) / (3600 * 7 * dayHours) * 100), 0, 100);
      const installedAt = installOverride.installedDaysAgo != null ? dateDaysAgo(installOverride.installedDaysAgo) : REGISTER_DEFAULT_INSTALLED_AT;
      const lastSeenAt = override.staleDaysAgo != null ? isoDaysAgo(override.staleDaysAgo) : isoHoursAgo(rnd(3));
      insertRegister.run(regId, id, reg.type, status, reg.p95_seconds, reg.avg_seconds, checksWeek, utilizationPct,
        override.offline_but_available || 0, override.note || null, installedAt, lastSeenAt);
    }
  }

  // --- Региональные директора (заглушки — см. шапку файла) ---
  const insertRegion = db.prepare("INSERT INTO regions (region, regional_director) VALUES (?, ?)");
  insertRegion.run("Регион 1", "Воронцова Алина Сергеевна");
  insertRegion.run("Регион 2", "Рыбаков Максим Андреевич");
  insertRegion.run("Регион 3", "Козлова Татьяна Игоревна");

  // --- Технические причины простоя (синтетика, как и раньше — в экспорте чеков нет причин простоя) ---
  const causes = [
    ["Нет бумаги", 18, "SCO", null],
    ["Ошибка банка", 26, "SCO", null],
    ["Заблокирована сотрудником", 14, "SCO", null],
    ["Ошибка весов", 6, "SCO", null],
    ["Ошибка сканера", 4, "SCO", null],
    ["Ошибка принтера", 3, "SCO", null],
    ["Сервисный режим", 9, "SCO", null],
    ["Нет связи (офлайн)", 11, "SCO", "Не учитывается как недоступность при штатной работе кассы"],
    ["Ошибка ККТ", 8, "POS", null],
    ["Сбой терминала эквайринга", 7, "POS", null],
    ["Ошибка сканера POS", 5, "POS", null]
  ];
  const insertCause = db.prepare("INSERT INTO technical_causes (cause, hours, applies_to, note) VALUES (?, ?, ?, ?)");
  for (const c of causes) insertCause.run(...c);

  // p95/нагрузочные нормативы пересчитаны под масштаб реальных чеков (см. seed-data/*.json) —
  // старые значения (p95_sco=65, pos_upper_overload=2500 и т.д.) были откалиброваны под синтетический
  // прототип на порядок меньшего масштаба и на реальных данных отмечали бы почти каждый магазин как
  // проблемный. availability_norm/sco_share_norm — не пересчитаны, это целевые KPI сети из
  // requirements/02-system/business-rules-and-formulas.md, а не производные от одной мартовской выборки.
  db.prepare(`INSERT INTO settings_network (id, availability_norm, sco_share_norm, p95_pos, p95_sco, p95_touch, p95_hybrid,
      sco_weekly_norm, pos_weekly_norm, pos_upper_overload, pos_lower_excess_staff, cashier_hourly_rate, currency)
      VALUES (1, 90, 30, 115, 230, 90, 70, 8000, 6500, 9000, 2000, 350, 'RUB')`).run();

  // --- Задачи: две привязаны к синтетическим статусам касс выше, одна — к реальной аномалии нагрузки
  // (66-1: 188 чеков/нед против 2000+ у соседних POS того же магазина), одна — бизнес-задача по
  // реальному показателю (531: доля КСО 31.1%, всего 1.1 п.п. над нормативом 30%) ---
  const tasks = [
    { id: "T-1", title: "66-1: проверить причину аномально низкой нагрузки POS (188 чеков/нед против 2000+ на соседних POS)", store_id: "66", register_id: "66-1",
      created_by: "Региональный директор", assignee: "Абрамова Инна Олеговна (директор магазина №66)", status: "new",
      target_kpi: "Выяснить причину простоя/низкой нагрузки POS №1", due_at: "2026-09-20T18:00:00.000Z", escalated: 0, escalated_to: null, created_days_ago: 1 },
    { id: "T-2", title: "121-23: заменить чековую ленту (нет бумаги)", store_id: "121", register_id: "121-23",
      created_by: "Операционный директор", assignee: "Егорова Мария Владимировна (директор магазина №121)", status: "in_progress",
      target_kpi: "Устранить простой SCO №23 по причине «нет бумаги»", due_at: "2026-09-16T12:00:00.000Z", escalated: 0, escalated_to: null, created_days_ago: 2 },
    { id: "T-3", title: "375-2: устранить ошибку эквайринга (сбой связи с банком)", store_id: "375", register_id: "375-2",
      created_by: "Технические службы", assignee: "Кириллова Наталья Андреевна (директор магазина №375)", status: "in_progress",
      target_kpi: "Восстановить оплату картой на кассе 375-2", due_at: "2026-09-14T18:00:00.000Z", escalated: 1, escalated_to: "Региональный директор → Операционный директор", created_days_ago: 3 },
    { id: "T-4", title: "Увеличить запас по доле чеков КСО в магазине №531 (31.1% при нормативе 30%)", store_id: "531", register_id: null,
      created_by: "Региональный директор", assignee: "Сафонова Екатерина Романовна (директор магазина №531)", status: "done",
      target_kpi: "Доля чеков КСО по магазину ≥ 35%", due_at: "2026-09-09T18:00:00.000Z", escalated: 0, escalated_to: null, created_days_ago: 6 }
  ];
  const insertTask = db.prepare(`INSERT INTO tasks (id, title, store_id, register_id, created_by, assignee, status, target_kpi, due_at, escalated, escalated_to, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const t of tasks) {
    const createdAt = isoDaysAgo(t.created_days_ago);
    insertTask.run(t.id, t.title, t.store_id, t.register_id, t.created_by, t.assignee, t.status, t.target_kpi, t.due_at, t.escalated, t.escalated_to, createdAt, createdAt);
  }

  const usage = [["Дашборд сети", 412], ["Аутсайдеры", 356], ["Доступность касс", 298], ["Задачи", 145], ["Утилизация ресурсов", 121], ["ИИ-консультант", 64]];
  const insertUsage = db.prepare("INSERT INTO usage_stats (report, opens) VALUES (?, ?)");
  for (const u of usage) insertUsage.run(...u);

  // --- Суточные агрегаты за 60 дней: sco_checks/pos_checks — РЕАЛЬНЫЕ (цикл 30 реальных дней марта
  // переигран дважды подряд, см. realDateForOffset). availability_pct/pos_availability_pct — по-прежнему
  // синтетические (нет данных), с тем же трендом/шумом, что и раньше. sco_share_pct — считается из
  // реальных sco_checks/pos_checks ЭТОГО дня (не из синтетического тренда). ---
  const insertDaily = db.prepare(`INSERT INTO daily_summary
    (store_id, date, availability_pct, sco_share_pct, pos_availability_pct, sco_checks, pos_checks) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const TREND_STEP = { up: 0.35, down: -0.35, flat: 0 };
  for (const id of storeIds) {
    const real = REAL.stores[id];
    const syn = STORE_SYNTHETIC[id];
    const scoScale = SCO_SHARE_DEMO_OVERRIDE[id] ? SCO_SHARE_DEMO_OVERRIDE[id].dailyHourlyScale : 1;
    for (let d = 59; d >= 0; d--) {
      const trendOffset = TREND_STEP[syn.trend] * d;
      const noise = (rndFloat() - 0.5) * 4;
      const availability = clamp(syn.availability_pct - trendOffset + noise, 40, 100);
      const posAvailability = clamp(98 - (syn.trend === "down" ? trendOffset * 0.15 : 0) + (rndFloat() - 0.5) * 3, 85, 100);
      const realDay = real.daily[realDateForOffset(d)] || { sco_checks: 0, pos_checks: 0 };
      const scoChecks = Math.round(realDay.sco_checks * scoScale), posChecks = realDay.pos_checks;
      const total = scoChecks + posChecks;
      const scoShare = total ? (scoChecks / total) * 100 : real.sco_share_pct;
      const date = dateDaysAgo(d);
      insertDaily.run(id, date, Math.round(availability * 10) / 10, Math.round(scoShare * 10) / 10,
        Math.round(posAvailability * 10) / 10, scoChecks, posChecks);
    }
  }

  // --- Почасовые точки за 60 дней: sco_checks/pos_checks — РЕАЛЬНЫЕ по часу дня (тот же цикл 30
  // реальных дней, час суток берется из самой временной метки, чтобы форма графика "потоки по часам"
  // была подлинной). availability/pos_availability — синтетические (обеденный провал, тренд, шум),
  // как и раньше. ---
  const insertHourly = db.prepare(`INSERT INTO hourly_metrics
    (store_id, ts, availability_pct, sco_share_pct, pos_availability_pct, sco_checks, pos_checks, pos_potential_checks, pos_open_count, sco_open_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const id of storeIds) {
    const real = REAL.stores[id];
    const syn = STORE_SYNTHETIC[id];
    const capacity = CAPACITY.stores[id] || {};
    const scoScale = SCO_SHARE_DEMO_OVERRIDE[id] ? SCO_SHARE_DEMO_OVERRIDE[id].dailyHourlyScale : 1;
    for (let h = 24 * 60 - 1; h >= 0; h--) {
      const ts = new Date(Date.now() - h * 3600 * 1000);
      const hourOfDay = ts.getUTCHours();
      const daysAgo = h / 24;
      const trendOffset = TREND_STEP[syn.trend] * daysAgo;
      const lunchDip = (hourOfDay >= 12 && hourOfDay <= 14) ? (syn.trend === "down" ? 18 : 8) : 0;
      const availability = clamp(syn.availability_pct - trendOffset - lunchDip + (rndFloat() - 0.5) * 6, 30, 100);
      const posAvailability = clamp(98 - (syn.trend === "down" ? trendOffset * 0.15 : 0) - lunchDip * 0.2 + (rndFloat() - 0.5) * 4, 80, 100);
      const dayIndex = Math.floor(h / 24);
      const realDate = realDateForOffset(dayIndex);
      const realHour = (real.hourly[realDate] && real.hourly[realDate][String(hourOfDay)]) || { sco_checks: 0, pos_checks: 0 };
      const scoChecks = Math.round(realHour.sco_checks * scoScale), posChecks = realHour.pos_checks;
      const total = scoChecks + posChecks;
      const scoShare = total ? (scoChecks / total) * 100 : real.sco_share_pct;
      // Целевые чеки КСО и число активных касс — из отдельного файла (см. CAPACITY выше), тот же цикл
      // реальных дат. sco_open_count для демо-магазина 134 НЕ масштабируется — по замыслу все КСО
      // "технически доступны и посчитаны как открытые", просто почти не используются (см. диагноз).
      const realCap = (capacity[realDate] && capacity[realDate][String(hourOfDay)]) || { pos_potential_checks: 0, pos_open_count: 0, sco_open_count: 0 };
      insertHourly.run(id, ts.toISOString(), Math.round(availability * 10) / 10, Math.round(scoShare * 10) / 10,
        Math.round(posAvailability * 10) / 10, scoChecks, posChecks,
        realCap.pos_potential_checks, realCap.pos_open_count, realCap.sco_open_count);
    }
  }

  // --- История состояний касс: только для касс с синтетическим статусом (см. REGISTER_STATUS_OVERRIDES)
  // + минимальная запись "текущее состояние с такого-то времени" для остальных, чтобы drill-down
  // работал для любой кассы. ---
  const insertHistory = db.prepare(`INSERT INTO register_state_history (register_id, status, started_at, ended_at, duration_minutes) VALUES (?, ?, ?, ?, ?)`);
  function addHistoryEpisodes(registerId, episodes) {
    for (const ep of episodes) insertHistory.run(registerId, ep.status, ep.started_at, ep.ended_at, ep.duration_minutes);
  }
  // 121-23: повторяющиеся эпизоды "нет бумаги" за последние 5 дней + текущий открытый эпизод.
  for (let i = 5; i >= 1; i--) {
    const start = isoDaysAgo(i);
    const durMin = 30 + rnd(60);
    addHistoryEpisodes("121-23", [{ status: "no_paper", started_at: start, ended_at: new Date(new Date(start).getTime() + durMin * 60000).toISOString(), duration_minutes: durMin }]);
  }
  addHistoryEpisodes("121-23", [{ status: "no_paper", started_at: isoHoursAgo(6), ended_at: null, duration_minutes: null }]);
  // 375-2: ошибка банка — единственный длительный текущий эпизод (эскалированная заявка).
  addHistoryEpisodes("375-2", [
    { status: "available", started_at: isoDaysAgo(10), ended_at: isoDaysAgo(3), duration_minutes: 7 * 24 * 60 },
    { status: "bank_error", started_at: isoDaysAgo(3), ended_at: null, duration_minutes: null }
  ]);
  // 66-26: единичный офлайн-эпизод 47 минут, как описано в карточке.
  addHistoryEpisodes("66-26", [
    { status: "available", started_at: isoDaysAgo(3), ended_at: isoHoursAgo(5), duration_minutes: (3 * 24 * 60) - 300 },
    { status: "no_connection", started_at: isoHoursAgo(5), ended_at: isoHoursAgo(4.22), duration_minutes: 47 },
    { status: "available", started_at: isoHoursAgo(4.22), ended_at: null, duration_minutes: null }
  ]);
  const SPECIAL_HISTORY = new Set(["121-23", "375-2", "66-26"]);
  for (const id of storeIds) {
    for (const kassa of Object.keys(REAL.stores[id].registers)) {
      const regId = `${id}-${kassa}`;
      if (SPECIAL_HISTORY.has(regId)) continue;
      const status = REGISTER_STATUS_OVERRIDES[regId] ? "available" : (OCCUPIED_REGISTERS.has(regId) ? "occupied" : "available");
      addHistoryEpisodes(regId, [{ status, started_at: isoDaysAgo(7 + rnd(7)), ended_at: null, duration_minutes: null }]);
    }
  }

  db.close();
  console.log("Посев данных завершен:", require("./db").DB_PATH);
}

seed();
module.exports = { seed };
