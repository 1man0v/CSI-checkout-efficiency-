const crypto = require("node:crypto");
const { nextEscalation } = require("../rules");

function listTasks(db, storeId) {
  const rows = storeId
    ? db.prepare("SELECT * FROM tasks WHERE store_id = ? ORDER BY created_at DESC").all(storeId)
    : db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all();
  return rows;
}

// POST /api/tasks — валидация обязательного поля title (демонстрирует validationError с реального бэкенда)
function createTask(db, body) {
  const title = (body.title || "").trim();
  if (!title) return { status: 400, body: { error: "Укажите заголовок задачи" } };
  if (!body.storeId) return { status: 400, body: { error: "Укажите магазин" } };
  const store = db.prepare("SELECT id FROM stores WHERE id = ?").get(body.storeId);
  if (!store) return { status: 400, body: { error: "Магазин не найден" } };

  const id = "T-" + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO tasks (id, title, store_id, register_id, created_by, assignee, status, target_kpi, due_date, escalated, escalated_to, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, 0, NULL, ?, ?)`)
    .run(id, title, body.storeId, body.registerId || null, body.createdBy || "—", "Директор магазина", body.targetKpi || "—", body.dueDate || "—", now, now);
  return { status: 201, body: db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) };
}

// PATCH /api/tasks/:id  { status }
function updateTaskStatus(db, id, status) {
  if (!["new", "in_progress", "done"].includes(status)) return { status: 400, body: { error: "Некорректный статус" } };
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!task) return { status: 404, body: { error: "Задача не найдена" } };
  db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
  return { status: 200, body: db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) };
}

// POST /api/tasks/:id/escalate — маршрут эскалации РД -> ОД (requirements/07-scenarios/business-scenarios.md)
function escalateTask(db, id) {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!task) return { status: 404, body: { error: "Задача не найдена" } };
  const escalatedTo = nextEscalation(task);
  db.prepare("UPDATE tasks SET escalated = 1, escalated_to = ?, updated_at = ? WHERE id = ?")
    .run(escalatedTo, new Date().toISOString(), id);
  return { status: 200, body: db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) };
}

module.exports = { listTasks, createTask, updateTaskStatus, escalateTask };
