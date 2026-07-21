/* Демонстрационные (mock) данные визуального прототипа.
   Не выгрузка из реальной аналитики — синтетические данные, сгенерированные по описанию
   в requirements/ (аналогично прототипу Confluence 6487408709). Используются только клиентской стороной. */

const REGISTER_STATES = {
  available: { ru: "Доступна", badge: "ok" },
  occupied: { ru: "Занята покупателем", badge: "ok" },
  blocked_by_staff: { ru: "Заблокирована сотрудником", badge: "warn" },
  no_paper: { ru: "Нет бумаги", badge: "bad" },
  bank_error: { ru: "Ошибка банка", badge: "bad" },
  scale_error: { ru: "Ошибка весов", badge: "bad" },
  scanner_error: { ru: "Ошибка сканера", badge: "bad" },
  printer_error: { ru: "Ошибка принтера", badge: "bad" },
  service_mode: { ru: "Сервисный режим", badge: "warn" },
  no_connection: { ru: "Нет связи (офлайн)", badge: "info" },
  off: { ru: "Выключена", badge: "bad" },
  unknown: { ru: "Неизвестное состояние", badge: "warn" }
};

// Уточнение офлайн-режима (подтверждено PM 2026-07-21): "no_connection" сам по себе не считается
// недоступностью, если касса функционирует и накапливает данные локально — см. поле offlineButAvailable.

const STORES = [
  { id: "404", number: "№404", name: "Городской", region: "Москва-Запад", format: "Супермаркет",
    availability: 94, scoShare: 12, posLoadWeek: 2800, scoLoadWeek: 750, outlier: true, outlierReason: "business",
    registers: [
      { id: "404-P1", type: "POS", status: "available", p95: 88, checksWeek: 2900, utilization: 78 },
      { id: "404-P2", type: "POS", status: "available", p95: 92, checksWeek: 2750, utilization: 74 },
      { id: "404-P3", type: "POS", status: "occupied", p95: 90, checksWeek: 2820, utilization: 80 },
      { id: "404-P4", type: "POS", status: "available", p95: 95, checksWeek: 2650, utilization: 71 },
      { id: "404-P5", type: "POS", status: "occupied", p95: 89, checksWeek: 2900, utilization: 77 },
      { id: "404-P6", type: "POS", status: "available", p95: 91, checksWeek: 2780, utilization: 75 },
      { id: "404-S1", type: "SCO", status: "available", p95: 64, checksWeek: 780, utilization: 40 },
      { id: "404-S2", type: "SCO", status: "available", p95: 61, checksWeek: 800, utilization: 41 },
      { id: "404-S3", type: "SCO", status: "occupied", p95: 66, checksWeek: 760, utilization: 39 },
      { id: "404-S4", type: "SCO", status: "available", p95: 58, checksWeek: 60, utilization: 2, note: "Технически исправна («Готова к продаже»), 0 вызовов помощника — физически заставлена товаром (см. кейс в requirements/07-scenarios/business-scenarios.md)" }
    ] },
  { id: "112", number: "№112", name: "Северный", region: "Москва-Запад", format: "Супермаркет",
    availability: 97, scoShare: 31, posLoadWeek: 1900, scoLoadWeek: 1850, outlier: false,
    registers: genRegisters("112", 5, 3) },
  { id: "087", number: "№087", name: "Парковый", region: "Москва-Восток", format: "Магазин у дома",
    availability: 71, scoShare: 22, posLoadWeek: 2100, scoLoadWeek: 900, outlier: true, outlierReason: "technical",
    registers: [
      { id: "087-P1", type: "POS", status: "available", p95: 96, checksWeek: 2050, utilization: 70 },
      { id: "087-P2", type: "POS", status: "available", p95: 99, checksWeek: 2000, utilization: 68 },
      { id: "087-S1", type: "SCO", status: "no_paper", p95: null, checksWeek: 300, utilization: 15, offlineButAvailable: false },
      { id: "087-S2", type: "SCO", status: "bank_error", p95: null, checksWeek: 280, utilization: 14, offlineButAvailable: false },
      { id: "087-S3", type: "SCO", status: "available", p95: 70, checksWeek: 620, utilization: 32 }
    ] },
  { id: "215", number: "№215", name: "Центральный", region: "Санкт-Петербург", format: "Гипермаркет",
    availability: 98, scoShare: 34, posLoadWeek: 1950, scoLoadWeek: 1900, outlier: false,
    registers: genRegisters("215", 8, 6) },
  { id: "330", number: "№330", name: "Речной", region: "Москва-Восток", format: "Супермаркет",
    availability: 93, scoShare: 14, posLoadWeek: 2650, scoLoadWeek: 700, outlier: true, outlierReason: "business",
    registers: genRegisters("330", 5, 3) },
  { id: "058", number: "№058", name: "Южный", region: "Санкт-Петербург", format: "Магазин у дома",
    availability: 96, scoShare: 33, posLoadWeek: 1850, scoLoadWeek: 1750, outlier: false,
    registers: genRegisters("058", 4, 2) },
  { id: "501", number: "№501", name: "Восточный", region: "Москва-Восток", format: "Супермаркет",
    availability: 95, scoShare: 29, posLoadWeek: 2000, scoLoadWeek: 1700, outlier: false,
    registers: genRegisters("501", 5, 4) },
  { id: "276", number: "№276", name: "Заречный", region: "Москва-Запад", format: "Магазин у дома",
    availability: 90, scoShare: 27, posLoadWeek: 2950, scoLoadWeek: 1500, outlier: true, outlierReason: "utilization",
    registers: genRegisters("276", 4, 2) },
  { id: "192", number: "№192", name: "Прибрежный", region: "Санкт-Петербург", format: "Супермаркет",
    availability: 97, scoShare: 32, posLoadWeek: 1900, scoLoadWeek: 1800, outlier: false,
    registers: genRegisters("192", 5, 4) },
  { id: "420", number: "№420", name: "Ленинский", region: "Санкт-Петербург", format: "Супермаркет",
    availability: 92, scoShare: 30, posLoadWeek: 2050, scoLoadWeek: 1750, outlier: false, outlierReason: "offline-demo",
    registers: [
      { id: "420-P1", type: "POS", status: "available", p95: 90, checksWeek: 2050, utilization: 72 },
      { id: "420-P2", type: "POS", status: "available", p95: 93, checksWeek: 2000, utilization: 70 },
      { id: "420-S1", type: "SCO", status: "no_connection", p95: 65, checksWeek: 900, utilization: 38, offlineButAvailable: true,
        note: "Офлайн 47 минут (нет связи с сервером), но продолжала обслуживать покупателей — данные накоплены локально и переданы при восстановлении связи. Считается доступной (подтверждено PM, 2026-07-21)." },
      { id: "420-S2", type: "SCO", status: "available", p95: 63, checksWeek: 880, utilization: 37 }
    ] }
];

function genRegisters(storeId, posCount, scoCount) {
  const regs = [];
  for (let i = 1; i <= posCount; i++) {
    regs.push({ id: `${storeId}-P${i}`, type: "POS", status: i === 1 ? "occupied" : "available", p95: 85 + rnd(15), checksWeek: 1800 + rnd(500), utilization: 65 + rnd(15) });
  }
  for (let i = 1; i <= scoCount; i++) {
    regs.push({ id: `${storeId}-S${i}`, type: "SCO", status: "available", p95: 55 + rnd(15), checksWeek: 350 + rnd(150), utilization: 35 + rnd(15) });
  }
  return regs;
}
function rnd(max) { return Math.floor(Math.random() * max); }

const TECHNICAL_CAUSES_HOURS = [
  { cause: "Нет бумаги", hours: 18 },
  { cause: "Ошибка банка", hours: 26 },
  { cause: "Заблокирована сотрудником", hours: 14 },
  { cause: "Ошибка весов", hours: 6 },
  { cause: "Ошибка сканера", hours: 4 },
  { cause: "Ошибка принтера", hours: 3 },
  { cause: "Сервисный режим", hours: 9 },
  { cause: "Нет связи (офлайн)", hours: 11, note: "Не учитывается как недоступность при штатной работе — см. уточнение" }
];

// Настраиваемые пороги — вынесены в отдельное приложение настроек (settings.html), хранятся в localStorage.
const DEFAULT_SETTINGS = {
  availabilityNorm: 90,
  scoShareNorm: 30,
  performanceP95: { POS: 95, SCO: 65, TOUCH: 90, HYBRID: 70 },
  utilization: { scoWeeklyNorm: 1800, posWeeklyNorm: 2000, posUpperOverload: 2500, posLowerExcessStaff: 1500 }
};

function getSettings() {
  try {
    const raw = localStorage.getItem("set_settings");
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    return { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...JSON.parse(raw) };
  } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }
}
function saveSettings(s) { localStorage.setItem("set_settings", JSON.stringify(s)); }

// Задачи (MVP2) — подтверждено Product Manager 2026-07-21, см. requirements/02-system/task-management.md
let TASKS = [
  { id: "T-1", title: "Освободить подход к SCO №4", storeId: "404", registerId: "404-S4",
    createdBy: "Региональный директор", assignee: "Директор магазина", status: "new",
    targetKpi: "Доля чеков КСО ≥ 25% к следующему вторнику", due: "2026-07-24", escalated: false },
  { id: "T-2", title: "Проверить установку кассы и камеры", storeId: "087", registerId: "087-S1",
    createdBy: "Операционный директор", assignee: "Директор магазина", status: "in_progress",
    targetKpi: "Доступность КСО ≥ 90%", due: "2026-07-23", escalated: false },
  { id: "T-3", title: "Снизить количество открытых POS в часы низкой нагрузки", storeId: "276", registerId: null,
    createdBy: "Региональный директор", assignee: "Директор магазина", status: "done",
    targetKpi: "Утилизация POS ≤ 2000 чеков/нед", due: "2026-07-18", escalated: false },
  { id: "T-4", title: "Заявка в ИТ на ошибку эквайринга SCO №1", storeId: "087", registerId: "087-S2",
    createdBy: "Технические службы", assignee: "Директор магазина", status: "in_progress",
    targetKpi: "Устранить ошибку банка на кассе", due: "2026-07-19", escalated: true, escalatedTo: "Региональный директор → Операционный директор" }
];

// Пример из requirements/02-system/ai-advisor-concept.md, раздел «11. Полный пример работы» — включено в прототип по решению PM 2026-07-21
const ADVISOR_SUGGESTIONS = [
  "Что сегодня мешает эффективности магазина?",
  "Почему выросли очереди?",
  "Почему доля КСО ниже ожидаемой?"
];

const ADVISOR_SCRIPTED_ANSWER = {
  "что сегодня мешает эффективности магазина?": {
    facts: [
      "В 12:00 наблюдалась пиковая нагрузка (20 чеков против среднего 15.4/час)",
      "Доступность КСО за период составила 72%",
      "Простой КСО (110 минут) пришелся на период 12:00–13:00 — совпадает с пиковой нагрузкой"
    ],
    hypothesis: { name: "КСО недоступны в пиковые часы", confidence: 0.91 },
    recommendations: [
      "Проверить причины недоступности КСО: блокировки, ошибки оборудования, бумагу, эквайринг",
      "Обеспечить контроль КСО в часы пик"
    ],
    conclusion: "Основная причина снижения эффективности — недоступность КСО в пиковый период."
  }
};
