-- Схема БД прототипа «Set — Эффективность зоны расчета».
-- Упрощена относительно продуктовой архитектуры (Kafka/POSDWH/ClickHouse) — см. ai-artifacts/07-prototype-report.md,
-- раздел «Упрощения». Хранит агрегированные показатели напрямую, а не сырые события телеметрии.

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  format TEXT NOT NULL,
  availability_pct REAL NOT NULL,
  sco_share_pct REAL NOT NULL,
  pos_load_week INTEGER NOT NULL,
  sco_load_week INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS registers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  type TEXT NOT NULL CHECK (type IN ('POS','SCO','TOUCH','HYBRID')),
  status TEXT NOT NULL,
  p95_seconds INTEGER,
  checks_week INTEGER NOT NULL,
  utilization_pct INTEGER NOT NULL,
  offline_but_available INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

-- Технические причины простоя — сетевой агрегат часов (демо-упрощение, не разбито по магазинам/кассам).
CREATE TABLE IF NOT EXISTS technical_causes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cause TEXT NOT NULL,
  hours INTEGER NOT NULL,
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
  pos_lower_excess_staff INTEGER NOT NULL
);

-- Региональные переопределения нормативов (уровень РД). NULL = наследует сетевое значение.
CREATE TABLE IF NOT EXISTS settings_regional (
  region TEXT PRIMARY KEY,
  availability_norm REAL,
  sco_share_norm REAL
);

-- Очередь согласования: РД пытается занизить норматив своего региона ниже сетевого — требуется решение ОД.
-- requirements/02-system/user-roles-and-functional-blocks.md, раздел «Права доступа по ролям».
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

-- Задачи (MVP2) — requirements/02-system/task-management.md.
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id),
  register_id TEXT,
  created_by TEXT NOT NULL,
  assignee TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done')),
  target_kpi TEXT NOT NULL,
  due_date TEXT NOT NULL,
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
