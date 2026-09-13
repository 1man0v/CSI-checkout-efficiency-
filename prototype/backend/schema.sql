-- Схема БД прототипа «Set — Эффективность зоны расчета».
-- Упрощена относительно продуктовой архитектуры (Kafka/POSDWH/ClickHouse) — см. ai-artifacts/07-prototype-report.md,
-- раздел «Упрощения». Хранит агрегированные показатели напрямую, а не сырые события телеметрии.

-- Региональные директора — для сводки регионов на дашборде ОД (контроль РД).
CREATE TABLE IF NOT EXISTS regions (
  region TEXT PRIMARY KEY,
  regional_director TEXT NOT NULL
);

-- opened_at — дата открытия магазина (для динамики "количество магазинов" на большой плашке ОД
-- за выбранный период vs предыдущий период той же длины).
-- opening_hour/closing_hour — часы работы магазина (0-23, closing_hour исключительно, т.е. магазин
-- работает [opening_hour; closing_hour)), для плашки "график потоков по часам" на карточке магазина
-- (добавлено 2026-07-22) — задают диапазон часов, за который строится график, и участвуют в расчете
-- часового норматива чеков (норматив/неделя / (7 × часы работы в день), см. business-rules-and-formulas.md).
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  format TEXT NOT NULL,
  director_name TEXT NOT NULL,
  availability_pct REAL NOT NULL,
  sco_share_pct REAL NOT NULL,
  potential_sco_pct REAL NOT NULL,
  pos_load_week INTEGER NOT NULL,
  sco_load_week INTEGER NOT NULL,
  opened_at TEXT NOT NULL DEFAULT '2025-01-01',
  opening_hour INTEGER NOT NULL DEFAULT 8,
  closing_hour INTEGER NOT NULL DEFAULT 22
);

-- installed_at — дата регистрации кассы на кассовом сервере (мастер-данные, для динамики
-- "количество POS/КСО"). last_seen_at — время последней телеметрии; касса без телеметрии
-- дольше 30 дней считается "не в эксплуатации" (серая плашка "офлайн N дней" — см. rules.js
-- isRegisterStale) — отдельное понятие от кратковременного "нет связи" (offline_but_available).
-- avg_seconds — среднее время обслуживания чека (в отличие от p95_seconds — персентиля).
CREATE TABLE IF NOT EXISTS registers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  type TEXT NOT NULL CHECK (type IN ('POS','SCO','TOUCH','HYBRID')),
  status TEXT NOT NULL,
  p95_seconds INTEGER,
  avg_seconds INTEGER,
  checks_week INTEGER NOT NULL,
  utilization_pct INTEGER NOT NULL,
  offline_but_available INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  installed_at TEXT NOT NULL DEFAULT '2025-01-01',
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Технические причины простоя. applies_to различает SCO/POS/ALL — пункт 7 замечаний по прототипу
-- (в блоке "причины простоя" не было информации по POS).
CREATE TABLE IF NOT EXISTS technical_causes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cause TEXT NOT NULL,
  hours INTEGER NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'SCO' CHECK (applies_to IN ('SCO','POS','ALL')),
  note TEXT
);

-- Заявки в ИТ, создаваемые из экрана «Доступность» (SCR-06, кнопка CreateITTicket).
CREATE TABLE IF NOT EXISTS it_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  register_id TEXT,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Нормативы и пороги сети (уровень ОД) — ровно одна строка. SCR-08, requirements/02-system/business-rules-and-formulas.md.
CREATE TABLE IF NOT EXISTS settings_network (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  availability_norm REAL NOT NULL,
  sco_share_norm REAL NOT NULL,
  p95_pos INTEGER NOT NULL,
  p95_sco INTEGER NOT NULL,
  p95_touch INTEGER NOT NULL,
  p95_hybrid INTEGER NOT NULL,
  sco_weekly_norm INTEGER NOT NULL,
  pos_weekly_norm INTEGER NOT NULL,
  pos_upper_overload INTEGER NOT NULL,
  pos_lower_excess_staff INTEGER NOT NULL,
  -- Для расчета "Потенциальная экономия" (дашборд ОД, группа "Прочее"): ставка часа кассира и
  -- валюта, в которой она задана и в которой показывается сумма экономии. Валюта — код (RUB/USD/EUR),
  -- символ/подпись берутся из ключей локализации (currency.<код>), не хардкодятся в коде экрана.
  cashier_hourly_rate REAL NOT NULL DEFAULT 350,
  currency TEXT NOT NULL DEFAULT 'RUB' CHECK (currency IN ('RUB', 'USD', 'EUR'))
);

-- Региональные переопределения нормативов (уровень РД). NULL = наследует сетевое значение.
CREATE TABLE IF NOT EXISTS settings_regional (
  region TEXT PRIMARY KEY,
  availability_norm REAL,
  sco_share_norm REAL
);

-- Очередь согласования: РД пытается занизить норматив своего региона ниже сетевого — требуется решение ОД.
CREATE TABLE IF NOT EXISTS settings_approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region TEXT NOT NULL,
  field TEXT NOT NULL,
  requested_value REAL NOT NULL,
  current_network_value REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

-- Задачи (MVP1, перенесено из MVP2 решением Product Manager 2026-07-22) — requirements/02-system/task-management.md.
-- due_at хранит полную дату-время (не только дату) — пункт 15 замечаний по прототипу.
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id),
  register_id TEXT,
  created_by TEXT NOT NULL,
  assignee TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done')),
  target_kpi TEXT NOT NULL,
  due_at TEXT NOT NULL,
  escalated INTEGER NOT NULL DEFAULT 0,
  escalated_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Демо-статистика использования отчетов (SCR-12, продуктовые команды).
CREATE TABLE IF NOT EXISTS usage_stats (
  report TEXT PRIMARY KEY,
  opens INTEGER NOT NULL
);

-- Суточные агрегаты по магазину — для календаря выбора периода (превью доступности/доли SCO по дате
-- без ожидания подгрузки, пункт 3 замечаний) и для расчета тренда регион/сеть (пункт 8).
-- pos_availability_pct/sco_checks/pos_checks добавлены для drill-down графиков по POS-метрикам
-- и нагрузке (замечание про недостающие графики по "Доступность POS"/"Нагрузка SCO"/"Нагрузка POS").
CREATE TABLE IF NOT EXISTS daily_summary (
  store_id TEXT NOT NULL REFERENCES stores(id),
  date TEXT NOT NULL,
  availability_pct REAL NOT NULL,
  sco_share_pct REAL NOT NULL,
  pos_availability_pct REAL NOT NULL DEFAULT 100,
  sco_checks INTEGER NOT NULL DEFAULT 0,
  pos_checks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, date)
);

-- Почасовые точки за последние 7 дней — для графиков при клике на KPI-плашку (пункт 11).
-- pos_potential_checks/pos_open_count/sco_open_count (добавлено 2026-09-13) — из реального экспорта
-- чеков (см. seed-data/hourly-capacity-2026-03.json), для графика "Загрузка кассовой линии" на карточке
-- магазина: pos_potential_checks — чеки POS за этот час, подходящие под перехват КСО (≤10 товаров,
-- без нала); pos_open_count/sco_open_count — число различных касс данного типа, на которых был хотя бы
-- один чек в этот час (прокси "открыта/используется", отдельного события открытия смены в источнике нет).
CREATE TABLE IF NOT EXISTS hourly_metrics (
  store_id TEXT NOT NULL REFERENCES stores(id),
  ts TEXT NOT NULL,
  availability_pct REAL NOT NULL,
  sco_share_pct REAL NOT NULL,
  pos_availability_pct REAL NOT NULL DEFAULT 100,
  sco_checks INTEGER NOT NULL DEFAULT 0,
  pos_checks INTEGER NOT NULL DEFAULT 0,
  pos_potential_checks INTEGER NOT NULL DEFAULT 0,
  pos_open_count INTEGER NOT NULL DEFAULT 0,
  sco_open_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, ts)
);

-- История состояний кассы — сколько времени касса провела в каждом состоянии и как часто в нем
-- оказывалась (пункт 12: таблица касс "не отражает сколько времени касса висит в такой ошибке").
CREATE TABLE IF NOT EXISTS register_state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  register_id TEXT NOT NULL REFERENCES registers(id),
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_minutes INTEGER
);
