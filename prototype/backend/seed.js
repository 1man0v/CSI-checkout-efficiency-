// Пересоздает схему и заполняет БД демонстрационными данными.
// Синтетические данные — не выгрузка из реальной аналитики. Обновлено 2026-07-22 по замечаниям
// к прототипу: реалистичные задачи, ФИО директоров, потенциал перетока на SCO, почасовые/суточные
// ряды для графиков, история состояний касс, причины простоя POS.
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

// Детерминированный псевдослучайный генератор — посев воспроизводим между запусками.
let seedValue = 42;
function rnd(max) { seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff; return seedValue % max; }
function rndFloat() { return rnd(10000) / 10000; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function isoHoursAgo(h) { return new Date(Date.now() - h * 3600 * 1000).toISOString(); }
function isoDaysAgo(d) { return new Date(Date.now() - d * 86400 * 1000).toISOString(); }
function dateDaysAgo(d) { return isoDaysAgo(d).slice(0, 10); }

function genRegisters(storeId, posCount, scoCount) {
  const regs = [];
  for (let i = 1; i <= posCount; i++) {
    regs.push({ id: `${storeId}-P${i}`, type: "POS", status: i === 1 ? "occupied" : "available",
      p95_seconds: 85 + rnd(15), checks_week: 1800 + rnd(500), utilization_pct: 65 + rnd(15), offline_but_available: 0, note: null });
  }
  for (let i = 1; i <= scoCount; i++) {
    regs.push({ id: `${storeId}-S${i}`, type: "SCO", status: "available",
      p95_seconds: 55 + rnd(15), checks_week: 350 + rnd(150), utilization_pct: 35 + rnd(15), offline_but_available: 0, note: null });
  }
  return regs;
}

function seed() {
  const db = openDb();
  db.exec(DROP_ALL);
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

  const stores = [
    { id: "404", number: "№404", name: "Городской", region: "Москва-Запад", format: "Супермаркет", director_name: "Смирнова Елена Викторовна",
      availability_pct: 94, sco_share_pct: 12, potential_sco_pct: 23, pos_load_week: 2800, sco_load_week: 750, trend: "up",
      registers: [
        { id: "404-P1", type: "POS", status: "available", p95_seconds: 88, checks_week: 2900, utilization_pct: 78 },
        { id: "404-P2", type: "POS", status: "available", p95_seconds: 92, checks_week: 2750, utilization_pct: 74 },
        { id: "404-P3", type: "POS", status: "occupied", p95_seconds: 90, checks_week: 2820, utilization_pct: 80 },
        { id: "404-P4", type: "POS", status: "available", p95_seconds: 95, checks_week: 2650, utilization_pct: 71 },
        { id: "404-P5", type: "POS", status: "occupied", p95_seconds: 89, checks_week: 2900, utilization_pct: 77 },
        { id: "404-P6", type: "POS", status: "available", p95_seconds: 91, checks_week: 2780, utilization_pct: 75 },
        { id: "404-S1", type: "SCO", status: "available", p95_seconds: 64, checks_week: 780, utilization_pct: 40 },
        { id: "404-S2", type: "SCO", status: "available", p95_seconds: 61, checks_week: 800, utilization_pct: 41 },
        { id: "404-S3", type: "SCO", status: "occupied", p95_seconds: 66, checks_week: 760, utilization_pct: 39 },
        { id: "404-S4", type: "SCO", status: "available", p95_seconds: 58, checks_week: 60, utilization_pct: 2,
          note: "Технически исправна и включена, но фактически не используется покупателями — вероятная причина: физически перекрыт подход (например, паллетой с товаром). Вызовов помощника за последние 14 дней: 0." }
      ] },
    { id: "112", number: "№112", name: "Северный", region: "Москва-Запад", format: "Супермаркет", director_name: "Ковалев Дмитрий Александрович",
      availability_pct: 97, sco_share_pct: 31, potential_sco_pct: 4, pos_load_week: 1900, sco_load_week: 1850, trend: "flat", registers: genRegisters("112", 5, 3) },
    { id: "087", number: "№087", name: "Парковый", region: "Москва-Восток", format: "Магазин у дома", director_name: "Никитин Сергей Петрович",
      availability_pct: 71, sco_share_pct: 22, potential_sco_pct: 14, pos_load_week: 2100, sco_load_week: 900, trend: "down",
      registers: [
        { id: "087-P1", type: "POS", status: "available", p95_seconds: 96, checks_week: 2050, utilization_pct: 70 },
        { id: "087-P2", type: "POS", status: "available", p95_seconds: 99, checks_week: 2000, utilization_pct: 68 },
        { id: "087-S1", type: "SCO", status: "no_paper", p95_seconds: null, checks_week: 300, utilization_pct: 15 },
        { id: "087-S2", type: "SCO", status: "bank_error", p95_seconds: null, checks_week: 280, utilization_pct: 14 },
        { id: "087-S3", type: "SCO", status: "available", p95_seconds: 70, checks_week: 620, utilization_pct: 32 }
      ] },
    { id: "215", number: "№215", name: "Центральный", region: "Санкт-Петербург", format: "Гипермаркет", director_name: "Орлова Татьяна Игоревна",
      availability_pct: 98, sco_share_pct: 34, potential_sco_pct: 3, pos_load_week: 1950, sco_load_week: 1900, trend: "flat", registers: genRegisters("215", 8, 6) },
    { id: "330", number: "№330", name: "Речной", region: "Москва-Восток", format: "Супермаркет", director_name: "Волков Андрей Николаевич",
      availability_pct: 93, sco_share_pct: 14, potential_sco_pct: 20, pos_load_week: 2650, sco_load_week: 700, trend: "down", registers: genRegisters("330", 5, 3) },
    { id: "058", number: "№058", name: "Южный", region: "Санкт-Петербург", format: "Магазин у дома", director_name: "Соколова Марина Юрьевна",
      availability_pct: 96, sco_share_pct: 33, potential_sco_pct: 4, pos_load_week: 1850, sco_load_week: 1750, trend: "up", registers: genRegisters("058", 4, 2) },
    { id: "501", number: "№501", name: "Восточный", region: "Москва-Восток", format: "Супермаркет", director_name: "Морозов Игорь Константинович",
      availability_pct: 95, sco_share_pct: 29, potential_sco_pct: 8, pos_load_week: 2000, sco_load_week: 1700, trend: "flat", registers: genRegisters("501", 5, 4) },
    { id: "276", number: "№276", name: "Заречный", region: "Москва-Запад", format: "Магазин у дома", director_name: "Лебедева Ольга Владимировна",
      availability_pct: 90, sco_share_pct: 27, potential_sco_pct: 9, pos_load_week: 2950, sco_load_week: 1500, trend: "down", registers: genRegisters("276", 4, 2) },
    { id: "192", number: "№192", name: "Прибрежный", region: "Санкт-Петербург", format: "Супермаркет", director_name: "Захаров Роман Сергеевич",
      availability_pct: 97, sco_share_pct: 32, potential_sco_pct: 5, pos_load_week: 1900, sco_load_week: 1800, trend: "flat", registers: genRegisters("192", 5, 4) },
    { id: "420", number: "№420", name: "Ленинский", region: "Санкт-Петербург", format: "Супермаркет", director_name: "Кузнецова Наталья Андреевна",
      availability_pct: 92, sco_share_pct: 30, potential_sco_pct: 7, pos_load_week: 2050, sco_load_week: 1750, trend: "up",
      registers: [
        { id: "420-P1", type: "POS", status: "available", p95_seconds: 90, checks_week: 2050, utilization_pct: 72 },
        { id: "420-P2", type: "POS", status: "available", p95_seconds: 93, checks_week: 2000, utilization_pct: 70 },
        { id: "420-S1", type: "SCO", status: "no_connection", p95_seconds: 65, checks_week: 900, utilization_pct: 38, offline_but_available: 1,
          note: "Временная потеря связи с сервером — касса продолжала обслуживать покупателей и накапливать данные локально; при восстановлении связи данные переданы без потерь. Считается доступной." },
        { id: "420-S2", type: "SCO", status: "available", p95_seconds: 63, checks_week: 880, utilization_pct: 37 }
      ] }
  ];

  // Часы работы магазина — иллюстративные значения по формату (не подтверждено Product Manager):
  // гипермаркет работает дольше, магазин у дома — короче, супермаркет — стандартный интервал.
  const STORE_HOURS_BY_FORMAT = { "Гипермаркет": [7, 23], "Супермаркет": [8, 22], "Магазин у дома": [8, 23] };

  const insertStore = db.prepare(`INSERT INTO stores (id, number, name, region, format, director_name, availability_pct, sco_share_pct, potential_sco_pct, pos_load_week, sco_load_week, opened_at, opening_hour, closing_hour)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertRegister = db.prepare(`INSERT INTO registers (id, store_id, type, status, p95_seconds, avg_seconds, checks_week, utilization_pct, offline_but_available, note, installed_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  // Все магазины "всегда существовали" (>1 года назад) — динамика "количества магазинов" на
  // большой плашке ОД корректно остается плоской (0), реалистично для розничной сети за 7-30 дней.
  const STORE_OPENED_AT = dateDaysAgo(400);
  // Кассы по умолчанию: зарегистрированы на кассовом сервере давно, телеметрия недавняя (в сети).
  const REGISTER_DEFAULT_INSTALLED_AT = dateDaysAgo(400);
  // Точечные исключения — демонстрируют механику пунктов 1.2/1.3 (динамика количества POS/КСО и за
  // 7, и за 30 дней) и "касса не в эксплуатации >30 дней" (серая плашка везде, где показан статус
  // кассы). Замечание пользователя: "количество POS/КСО — по кассовому серверу, даже если касса
  // не была онлайн 30+ дней". Две пары дат: ~3 дня назад — видно уже в 7-дневном сравнении;
  // ~18 дней назад — видно только в 30-дневном (за пределами 7-дневного окна с обеих сторон).
  const REGISTER_OVERRIDES = {
    "058-P4": { installedDaysAgo: 3 }, // только что зарегистрированная касса POS (видно в 7-дневной динамике)
    "058-S2": { installedDaysAgo: 3 }, // только что зарегистрированная касса КСО
    "215-P8": { installedDaysAgo: 18 }, // зарегистрирована 18 дней назад (видно только в 30-дневной динамике)
    "192-S4": { installedDaysAgo: 18 },
    "330-P5": { lastSeenDaysAgo: 38, note: "Телеметрия не поступает 38 дней — касса числится в реестре кассового сервера, но фактически не в эксплуатации." }
  };

  for (const s of stores) {
    const [openingHour, closingHour] = STORE_HOURS_BY_FORMAT[s.format] || [8, 22];
    insertStore.run(s.id, s.number, s.name, s.region, s.format, s.director_name, s.availability_pct, s.sco_share_pct, s.potential_sco_pct, s.pos_load_week, s.sco_load_week, STORE_OPENED_AT, openingHour, closingHour);
    for (const r of s.registers) {
      const override = REGISTER_OVERRIDES[r.id] || {};
      const installedAt = override.installedDaysAgo != null ? dateDaysAgo(override.installedDaysAgo) : REGISTER_DEFAULT_INSTALLED_AT;
      const lastSeenAt = override.lastSeenDaysAgo != null ? isoDaysAgo(override.lastSeenDaysAgo) : isoHoursAgo(rnd(3));
      const note = override.note || r.note || null;
      // avg_seconds — среднее время обслуживания чека, отличное от p95 (персентиль); статистически
      // ниже p95 для правостороннего распределения времени обслуживания.
      const avgSeconds = r.p95_seconds != null ? Math.round(r.p95_seconds * (0.58 + rndFloat() * 0.08)) : null;
      insertRegister.run(r.id, s.id, r.type, r.status, r.p95_seconds, avgSeconds, r.checks_week, r.utilization_pct, r.offline_but_available ? 1 : 0, note, installedAt, lastSeenAt);
    }
  }

  // --- Региональные директора (для сводки регионов ОД — контроль РД, замечание №5) ---
  const insertRegion = db.prepare("INSERT INTO regions (region, regional_director) VALUES (?, ?)");
  insertRegion.run("Москва-Запад", "Быкова Анна Сергеевна");
  insertRegion.run("Москва-Восток", "Гришин Павел Олегович");
  insertRegion.run("Санкт-Петербург", "Данилова Ирина Владимировна");

  // --- Технические причины простоя SCO (как раньше). POS-причины см. ниже — только "технические
  // сбои", без операционных/кадровых причин (замечание №4: "нет такого понятия как технический
  // перерыв кассира", интересует именно доступность/нагрузка/технические сбои POS). ---
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

  db.prepare(`INSERT INTO settings_network (id, availability_norm, sco_share_norm, p95_pos, p95_sco, p95_touch, p95_hybrid,
      sco_weekly_norm, pos_weekly_norm, pos_upper_overload, pos_lower_excess_staff, cashier_hourly_rate, currency)
      VALUES (1, 90, 30, 95, 65, 90, 70, 1800, 2000, 2500, 1500, 350, 'RUB')`).run();

  // --- Задачи: реалистичные формулировки и корректные ссылки на существующие кассы (пункт 14, 16) ---
  const tasks = [
    { id: "T-1", title: "SCO №4: освободить подход к кассе (перекрыт товаром)", store_id: "404", register_id: "404-S4",
      created_by: "Региональный директор", assignee: "Смирнова Елена Викторовна (директор магазина №404)", status: "new",
      target_kpi: "Доля чеков КСО по магазину ≥ 25% к 24.07.2026 18:00", due_at: "2026-07-24T18:00:00.000Z", escalated: 0, escalated_to: null, created_days_ago: 1 },
    { id: "T-2", title: "087-S1: заменить чековую ленту (нет бумаги)", store_id: "087", register_id: "087-S1",
      created_by: "Операционный директор", assignee: "Никитин Сергей Петрович (директор магазина №087)", status: "in_progress",
      target_kpi: "Устранить простой SCO №1 по причине «нет бумаги»", due_at: "2026-07-23T12:00:00.000Z", escalated: 0, escalated_to: null, created_days_ago: 2 },
    { id: "T-3", title: "Снизить количество открытых POS в часы низкой нагрузки", store_id: "276", register_id: null,
      created_by: "Региональный директор", assignee: "Лебедева Ольга Владимировна (директор магазина №276)", status: "done",
      target_kpi: "Утилизация POS ≤ 2000 чеков/нед", due_at: "2026-07-18T18:00:00.000Z", escalated: 0, escalated_to: null, created_days_ago: 6 },
    { id: "T-4", title: "087-S2: устранить ошибку эквайринга (сбой связи с банком)", store_id: "087", register_id: "087-S2",
      created_by: "Технические службы", assignee: "Никитин Сергей Петрович (директор магазина №087)", status: "in_progress",
      target_kpi: "Восстановить оплату картой на кассе 087-S2", due_at: "2026-07-19T18:00:00.000Z", escalated: 1, escalated_to: "Региональный директор → Операционный директор", created_days_ago: 3 }
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

  // Дневная (Вс..Сб) и часовая (0..23) кривые нагрузки — для распределения недельных итогов
  // (sco_load_week/pos_load_week) по дням/часам в графиках "Нагрузка SCO"/"Нагрузка POS"/"Чеков POS".
  const WEEKDAY_MULT = [0.85, 0.95, 1.0, 1.0, 1.05, 1.2, 1.15]; // Вс, Пн, Вт, Ср, Чт, Пт, Сб
  const HOUR_WEIGHTS = [0.5, 0.3, 0.2, 0.2, 0.3, 0.6, 1.2, 2.0, 2.8, 3.2, 3.5, 3.8, 4.2, 3.6, 3.2, 3.4, 3.8, 4.5, 5.0, 4.6, 3.8, 2.8, 1.8, 1.0];
  const HOUR_WEIGHT_SUM = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);

  // --- Суточные агрегаты за 60 дней (для календаря периода и тренда региона/сети — пункты 3, 8;
  // pos_availability_pct/sco_checks/pos_checks — для drill-down графиков POS-метрик и нагрузки).
  // 60, а не 30: тренд "выбранный период vs предыдущий период той же длины" для 30-дневного
  // пресета сравнивает последние 30 дней с ПРЕДЫДУЩИМИ 30 — нужны все 60 дней истории, иначе
  // "предыдущий период" был бы пуст (реальный баг, найден при проверке большой плашки ОД:
  // 30-дневный тренд считался от нулевой базы, давая бессмысленно большую дельту). ---
  const insertDaily = db.prepare(`INSERT INTO daily_summary
    (store_id, date, availability_pct, sco_share_pct, pos_availability_pct, sco_checks, pos_checks) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  // trendOffset растет с "d" (сколько дней назад) — при d=0 (сегодня) значение равно базовому
  // (актуальному) показателю магазина; "up" означает, что в прошлом было хуже (рост к сегодня),
  // "down" — что в прошлом было лучше (спад к сегодня).
  const TREND_STEP = { up: 0.35, down: -0.35, flat: 0 };
  for (const s of stores) {
    for (let d = 59; d >= 0; d--) {
      const trendOffset = TREND_STEP[s.trend] * d;
      const noise = (rndFloat() - 0.5) * 4;
      const availability = clamp(s.availability_pct - trendOffset + noise, 40, 100);
      const scoShare = clamp(s.sco_share_pct - trendOffset * 0.4 + (rndFloat() - 0.5) * 3, 5, 60);
      const posAvailability = clamp(98 - (s.trend === "down" ? trendOffset * 0.15 : 0) + (rndFloat() - 0.5) * 3, 85, 100);
      const date = dateDaysAgo(d);
      const dow = new Date(date + "T00:00:00Z").getUTCDay();
      const wMult = WEEKDAY_MULT[dow] * (0.9 + rndFloat() * 0.2);
      const scoChecks = Math.round((s.sco_load_week / 7) * wMult);
      const posChecks = Math.round((s.pos_load_week / 7) * wMult);
      insertDaily.run(s.id, date, Math.round(availability * 10) / 10, Math.round(scoShare * 10) / 10,
        Math.round(posAvailability * 10) / 10, scoChecks, posChecks);
    }
  }

  // --- Почасовые точки за 60 дней (для графика при клике на KPI-плашку — пункт 11; расширено с 7
  // до 60 дней 2026-07-22 для плашки "график потоков по часам" на карточке магазина, которая
  // усредняет чеки по часу дня за произвольный выбранный период — неделю/месяц/диапазон дат, а не
  // только за последние 7 дней) ---
  // Учитывает дневной паттерн с проседанием доступности в обеденный пик (12:00-14:00),
  // как в примере ИИ-консультанта (requirements/02-system/ai-advisor-concept.md), часовую кривую
  // нагрузки (HOUR_WEIGHTS) для распределения дневного количества чеков по часам, и ту же деградацию
  // показателя по дням (trendOffset), что и daily_summary выше — иначе исторические часовые точки
  // выглядели бы "плоскими" на фоне трендового daily_summary при усреднении за долгий период.
  const insertHourly = db.prepare(`INSERT INTO hourly_metrics
    (store_id, ts, availability_pct, sco_share_pct, pos_availability_pct, sco_checks, pos_checks) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const s of stores) {
    for (let h = 24 * 60 - 1; h >= 0; h--) {
      const ts = new Date(Date.now() - h * 3600 * 1000);
      const hourOfDay = ts.getUTCHours();
      const daysAgo = h / 24;
      const trendOffset = TREND_STEP[s.trend] * daysAgo;
      const lunchDip = (hourOfDay >= 12 && hourOfDay <= 14) ? (s.trend === "down" ? 18 : 8) : 0;
      const availability = clamp(s.availability_pct - trendOffset - lunchDip + (rndFloat() - 0.5) * 6, 30, 100);
      const scoShare = clamp(s.sco_share_pct - trendOffset * 0.4 + (rndFloat() - 0.5) * 5, 3, 60);
      const posAvailability = clamp(98 - (s.trend === "down" ? trendOffset * 0.15 : 0) - lunchDip * 0.2 + (rndFloat() - 0.5) * 4, 80, 100);
      const hourFrac = HOUR_WEIGHTS[hourOfDay] / HOUR_WEIGHT_SUM;
      const scoChecks = Math.round((s.sco_load_week / 7) * hourFrac * (0.85 + rndFloat() * 0.3));
      const posChecks = Math.round((s.pos_load_week / 7) * hourFrac * (0.85 + rndFloat() * 0.3));
      insertHourly.run(s.id, ts.toISOString(), Math.round(availability * 10) / 10, Math.round(scoShare * 10) / 10,
        Math.round(posAvailability * 10) / 10, scoChecks, posChecks);
    }
  }

  // --- История состояний касс (пункт 12) ---
  const insertHistory = db.prepare(`INSERT INTO register_state_history (register_id, status, started_at, ended_at, duration_minutes) VALUES (?, ?, ?, ?, ?)`);
  function addHistoryEpisodes(registerId, episodes) {
    for (const ep of episodes) insertHistory.run(registerId, ep.status, ep.started_at, ep.ended_at, ep.duration_minutes);
  }
  // 087-S1: повторяющиеся эпизоды "нет бумаги" за последние 5 дней + текущий открытый эпизод.
  for (let i = 5; i >= 1; i--) {
    const start = isoDaysAgo(i);
    const durMin = 30 + rnd(60);
    addHistoryEpisodes("087-S1", [{ status: "no_paper", started_at: start, ended_at: new Date(new Date(start).getTime() + durMin * 60000).toISOString(), duration_minutes: durMin }]);
  }
  addHistoryEpisodes("087-S1", [{ status: "no_paper", started_at: isoHoursAgo(6), ended_at: null, duration_minutes: null }]);
  // 087-S2: ошибка банка — единственный длительный текущий эпизод (эскалированная заявка).
  addHistoryEpisodes("087-S2", [
    { status: "available", started_at: isoDaysAgo(10), ended_at: isoDaysAgo(3), duration_minutes: 7 * 24 * 60 },
    { status: "bank_error", started_at: isoDaysAgo(3), ended_at: null, duration_minutes: null }
  ]);
  // 404-S4: технически доступна непрерывно, но почти не используется — контекст без "мусорного" текста (пункт 18).
  addHistoryEpisodes("404-S4", [{ status: "available", started_at: isoDaysAgo(14), ended_at: null, duration_minutes: null }]);
  // 420-S1: единичный офлайн-эпизод 47 минут, как описано в карточке.
  addHistoryEpisodes("420-S1", [
    { status: "available", started_at: isoDaysAgo(3), ended_at: isoHoursAgo(5), duration_minutes: (3 * 24 * 60) - 300 },
    { status: "no_connection", started_at: isoHoursAgo(5), ended_at: isoHoursAgo(4.22), duration_minutes: 47 },
    { status: "available", started_at: isoHoursAgo(4.22), ended_at: null, duration_minutes: null }
  ]);
  // Остальные кассы: минимум одна запись "текущее состояние с такого-то времени", чтобы drill-down работал для любой кассы.
  for (const s of stores) {
    for (const r of s.registers) {
      if (["087-S1", "087-S2", "404-S4", "420-S1"].includes(r.id)) continue;
      addHistoryEpisodes(r.id, [{ status: r.status, started_at: isoDaysAgo(7 + rnd(7)), ended_at: null, duration_minutes: null }]);
    }
  }

  db.close();
  console.log("Посев данных завершен:", require("./db").DB_PATH);
}

seed();
module.exports = { seed };
