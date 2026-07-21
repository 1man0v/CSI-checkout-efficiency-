// Пересоздает схему и заполняет БД демонстрационными данными.
// Синтетические данные — не выгрузка из реальной аналитики (как и visual-prototype/data.js,
// которому этот набор данных сознательно соответствует для трассируемости между этапами).
// Запуск: node backend/seed.js  (см. package.json: npm run seed)
const fs = require("node:fs");
const path = require("node:path");
const { openDb } = require("./db");

const DROP_ALL = `
DROP TABLE IF EXISTS usage_stats;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS settings_approval_requests;
DROP TABLE IF EXISTS settings_regional;
DROP TABLE IF EXISTS settings_network;
DROP TABLE IF EXISTS it_tickets;
DROP TABLE IF EXISTS technical_causes;
DROP TABLE IF EXISTS registers;
DROP TABLE IF EXISTS stores;
`;

function genRegisters(storeId, posCount, scoCount, rnd) {
  const regs = [];
  for (let i = 1; i <= posCount; i++) {
    regs.push({ id: `${storeId}-P${i}`, store_id: storeId, type: "POS", status: i === 1 ? "occupied" : "available",
      p95_seconds: 85 + rnd(15), checks_week: 1800 + rnd(500), utilization_pct: 65 + rnd(15), offline_but_available: 0, note: null });
  }
  for (let i = 1; i <= scoCount; i++) {
    regs.push({ id: `${storeId}-S${i}`, store_id: storeId, type: "SCO", status: "available",
      p95_seconds: 55 + rnd(15), checks_week: 350 + rnd(150), utilization_pct: 35 + rnd(15), offline_but_available: 0, note: null });
  }
  return regs;
}

function seed() {
  const db = openDb();
  db.exec(DROP_ALL);
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);

  // Детерминированный псевдослучайный генератор, чтобы посев был воспроизводим.
  let seedValue = 42;
  function rnd(max) { seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff; return seedValue % max; }

  const stores = [
    { id: "404", number: "№404", name: "Городской", region: "Москва-Запад", format: "Супермаркет",
      availability_pct: 94, sco_share_pct: 12, pos_load_week: 2800, sco_load_week: 750,
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
          note: "Технически исправна («Готова к продаже»), 0 вызовов помощника — физически заставлена товаром (см. кейс в requirements/07-scenarios/business-scenarios.md)" }
      ] },
    { id: "112", number: "№112", name: "Северный", region: "Москва-Запад", format: "Супермаркет",
      availability_pct: 97, sco_share_pct: 31, pos_load_week: 1900, sco_load_week: 1850, registers: genRegisters("112", 5, 3, rnd) },
    { id: "087", number: "№087", name: "Парковый", region: "Москва-Восток", format: "Магазин у дома",
      availability_pct: 71, sco_share_pct: 22, pos_load_week: 2100, sco_load_week: 900,
      registers: [
        { id: "087-P1", type: "POS", status: "available", p95_seconds: 96, checks_week: 2050, utilization_pct: 70 },
        { id: "087-P2", type: "POS", status: "available", p95_seconds: 99, checks_week: 2000, utilization_pct: 68 },
        { id: "087-S1", type: "SCO", status: "no_paper", p95_seconds: null, checks_week: 300, utilization_pct: 15 },
        { id: "087-S2", type: "SCO", status: "bank_error", p95_seconds: null, checks_week: 280, utilization_pct: 14 },
        { id: "087-S3", type: "SCO", status: "available", p95_seconds: 70, checks_week: 620, utilization_pct: 32 }
      ] },
    { id: "215", number: "№215", name: "Центральный", region: "Санкт-Петербург", format: "Гипермаркет",
      availability_pct: 98, sco_share_pct: 34, pos_load_week: 1950, sco_load_week: 1900, registers: genRegisters("215", 8, 6, rnd) },
    { id: "330", number: "№330", name: "Речной", region: "Москва-Восток", format: "Супермаркет",
      availability_pct: 93, sco_share_pct: 14, pos_load_week: 2650, sco_load_week: 700, registers: genRegisters("330", 5, 3, rnd) },
    { id: "058", number: "№058", name: "Южный", region: "Санкт-Петербург", format: "Магазин у дома",
      availability_pct: 96, sco_share_pct: 33, pos_load_week: 1850, sco_load_week: 1750, registers: genRegisters("058", 4, 2, rnd) },
    { id: "501", number: "№501", name: "Восточный", region: "Москва-Восток", format: "Супермаркет",
      availability_pct: 95, sco_share_pct: 29, pos_load_week: 2000, sco_load_week: 1700, registers: genRegisters("501", 5, 4, rnd) },
    { id: "276", number: "№276", name: "Заречный", region: "Москва-Запад", format: "Магазин у дома",
      availability_pct: 90, sco_share_pct: 27, pos_load_week: 2950, sco_load_week: 1500, registers: genRegisters("276", 4, 2, rnd) },
    { id: "192", number: "№192", name: "Прибрежный", region: "Санкт-Петербург", format: "Супермаркет",
      availability_pct: 97, sco_share_pct: 32, pos_load_week: 1900, sco_load_week: 1800, registers: genRegisters("192", 5, 4, rnd) },
    { id: "420", number: "№420", name: "Ленинский", region: "Санкт-Петербург", format: "Супермаркет",
      availability_pct: 92, sco_share_pct: 30, pos_load_week: 2050, sco_load_week: 1750,
      registers: [
        { id: "420-P1", type: "POS", status: "available", p95_seconds: 90, checks_week: 2050, utilization_pct: 72 },
        { id: "420-P2", type: "POS", status: "available", p95_seconds: 93, checks_week: 2000, utilization_pct: 70 },
        { id: "420-S1", type: "SCO", status: "no_connection", p95_seconds: 65, checks_week: 900, utilization_pct: 38, offline_but_available: 1,
          note: "Офлайн 47 минут (нет связи с сервером), но продолжала обслуживать покупателей — данные накоплены локально и переданы при восстановлении связи. Считается доступной (подтверждено PM, 2026-07-21)." },
        { id: "420-S2", type: "SCO", status: "available", p95_seconds: 63, checks_week: 880, utilization_pct: 37 }
      ] }
  ];

  const insertStore = db.prepare(`INSERT INTO stores (id, number, name, region, format, availability_pct, sco_share_pct, pos_load_week, sco_load_week)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertRegister = db.prepare(`INSERT INTO registers (id, store_id, type, status, p95_seconds, checks_week, utilization_pct, offline_but_available, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (const s of stores) {
    insertStore.run(s.id, s.number, s.name, s.region, s.format, s.availability_pct, s.sco_share_pct, s.pos_load_week, s.sco_load_week);
    for (const r of s.registers) {
      insertRegister.run(r.id, s.id, r.type, r.status, r.p95_seconds, r.checks_week, r.utilization_pct, r.offline_but_available ? 1 : 0, r.note || null);
    }
  }

  const causes = [
    ["Нет бумаги", 18, null],
    ["Ошибка банка", 26, null],
    ["Заблокирована сотрудником", 14, null],
    ["Ошибка весов", 6, null],
    ["Ошибка сканера", 4, null],
    ["Ошибка принтера", 3, null],
    ["Сервисный режим", 9, null],
    ["Нет связи (офлайн)", 11, "Не учитывается как недоступность при штатной работе — см. requirements/06-system-scenarios/system-scenarios.md"]
  ];
  const insertCause = db.prepare("INSERT INTO technical_causes (cause, hours, note) VALUES (?, ?, ?)");
  for (const c of causes) insertCause.run(...c);

  db.prepare(`INSERT INTO settings_network (id, availability_norm, sco_share_norm, p95_pos, p95_sco, p95_touch, p95_hybrid,
      sco_weekly_norm, pos_weekly_norm, pos_upper_overload, pos_lower_excess_staff)
      VALUES (1, 90, 30, 95, 65, 90, 70, 1800, 2000, 2500, 1500)`).run();

  const now = new Date().toISOString();
  const tasks = [
    ["T-1", "Освободить подход к SCO №4", "404", "404-S4", "Региональный директор", "Директор магазина", "new", "Доля чеков КСО ≥ 25% к следующему вторнику", "2026-07-24", 0, null],
    ["T-2", "Проверить установку кассы и камеры", "087", "087-S1", "Операционный директор", "Директор магазина", "in_progress", "Доступность КСО ≥ 90%", "2026-07-23", 0, null],
    ["T-3", "Снизить количество открытых POS в часы низкой нагрузки", "276", null, "Региональный директор", "Директор магазина", "done", "Утилизация POS ≤ 2000 чеков/нед", "2026-07-18", 0, null],
    ["T-4", "Заявка в ИТ на ошибку эквайринга SCO №1", "087", "087-S2", "Технические службы", "Директор магазина", "in_progress", "Устранить ошибку банка на кассе", "2026-07-19", 1, "Региональный директор → Операционный директор"]
  ];
  const insertTask = db.prepare(`INSERT INTO tasks (id, title, store_id, register_id, created_by, assignee, status, target_kpi, due_date, escalated, escalated_to, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const t of tasks) insertTask.run(...t, now, now);

  const usage = [["Дашборд сети", 412], ["Аутсайдеры", 356], ["Доступность касс", 298], ["Задачи (MVP2)", 145], ["Утилизация ресурсов", 121], ["ИИ-консультант", 64]];
  const insertUsage = db.prepare("INSERT INTO usage_stats (report, opens) VALUES (?, ?)");
  for (const u of usage) insertUsage.run(...u);

  db.close();
  console.log("Посев данных завершен:", require("./db").DB_PATH);
}

seed();
module.exports = { seed };
