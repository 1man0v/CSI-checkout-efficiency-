const { effectiveSettings } = require("../rules");

function getEffectiveSettings(db, region) {
  const network = db.prepare("SELECT * FROM settings_network WHERE id = 1").get();
  const regional = region ? db.prepare("SELECT * FROM settings_regional WHERE region = ?").get(region) : null;
  return effectiveSettings(network, regional);
}

// GET /api/settings?region=..  (role=od -> region omitted; role=rd -> region provided)
function getSettings(db, region) {
  const network = db.prepare("SELECT * FROM settings_network WHERE id = 1").get();
  const regional = region ? db.prepare("SELECT * FROM settings_regional WHERE region = ?").get(region) : null;
  return { network, regional: regional || null, effective: effectiveSettings(network, regional || {}) };
}

// PUT /api/settings  { role: 'od'|'rd', region, field, value }
// Бизнес-правило (requirements/02-system/user-roles-and-functional-blocks.md):
// РД может менять нормативы своего региона, но снижение ниже сетевого требует согласования ОД.
const NETWORK_FIELDS = new Set(["availability_norm", "sco_share_norm", "p95_pos", "p95_sco", "p95_touch", "p95_hybrid",
  "sco_weekly_norm", "pos_weekly_norm", "pos_upper_overload", "pos_lower_excess_staff", "cashier_hourly_rate"]);
const REGIONAL_HIGHER_BETTER_FIELDS = new Set(["availability_norm", "sco_share_norm"]);
// "Валюта" — не число, отдельная ветка валидации (сетевой параметр, недоступен РД, как и остальные
// нормативы вне REGIONAL_HIGHER_BETTER_FIELDS). Символ/подпись валюты берутся из ключей
// локализации (currency.<код>) на фронтенде, здесь только код.
const NETWORK_STRING_FIELDS = new Set(["currency"]);
const SUPPORTED_CURRENCIES = new Set(["RUB", "USD", "EUR"]);

function updateSettings(db, body) {
  const { role, region, field, value } = body;
  if (NETWORK_STRING_FIELDS.has(field)) {
    if (role !== "od") return { status: 403, body: { error: "Роль не может изменять настройки" } };
    if (!SUPPORTED_CURRENCIES.has(value)) return { status: 400, body: { error: "Неизвестная валюта" } };
    db.prepare(`UPDATE settings_network SET currency = ? WHERE id = 1`).run(value);
    return { status: 200, body: { saved: true, field, value, scope: "network" } };
  }
  if (!NETWORK_FIELDS.has(field)) {
    return { status: 400, body: { error: `Неизвестное поле настройки: ${field}` } };
  }
  const numValue = Number(value);
  if (!Number.isFinite(numValue) || numValue < 0) {
    return { status: 400, body: { error: "Некорректное значение — укажите неотрицательное число" } };
  }

  if (role === "od") {
    db.prepare(`UPDATE settings_network SET ${field} = ? WHERE id = 1`).run(numValue);
    return { status: 200, body: { saved: true, field, value: numValue, scope: "network" } };
  }

  if (role === "rd") {
    if (!region) return { status: 400, body: { error: "Не указан регион" } };
    if (!REGIONAL_HIGHER_BETTER_FIELDS.has(field)) {
      return { status: 403, body: { error: "РД не может менять это поле — только доступность/долю SCO своего региона" } };
    }
    const network = db.prepare("SELECT * FROM settings_network WHERE id = 1").get();
    const networkValue = network[field];
    if (numValue < networkValue) {
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO settings_approval_requests (region, field, requested_value, current_network_value, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)`).run(region, field, numValue, networkValue, now);
      return { status: 202, body: { approvalRequired: true, message: "Запрос на согласование отправлен Операционному директору (значение ниже сетевого норматива)." } };
    }
    db.prepare(`INSERT INTO settings_regional (region, ${field}) VALUES (?, ?)
      ON CONFLICT(region) DO UPDATE SET ${field} = excluded.${field}`).run(region, numValue);
    return { status: 200, body: { saved: true, field, value: numValue, scope: "region", region } };
  }

  return { status: 403, body: { error: "Роль не может изменять настройки" } };
}

// GET /api/settings/approvals — очередь согласования для ОД
function listApprovals(db) {
  return db.prepare("SELECT * FROM settings_approval_requests WHERE status = 'pending' ORDER BY created_at DESC").all();
}

// POST /api/settings/approvals/:id  { decision: 'approved'|'rejected' }
function resolveApproval(db, id, decision) {
  const req = db.prepare("SELECT * FROM settings_approval_requests WHERE id = ?").get(id);
  if (!req) return { status: 404, body: { error: "Запрос не найден" } };
  const now = new Date().toISOString();
  db.prepare("UPDATE settings_approval_requests SET status = ?, resolved_at = ? WHERE id = ?").run(decision, now, id);
  if (decision === "approved") {
    db.prepare(`INSERT INTO settings_regional (region, ${req.field}) VALUES (?, ?)
      ON CONFLICT(region) DO UPDATE SET ${req.field} = excluded.${req.field}`).run(req.region, req.requested_value);
  }
  return { status: 200, body: { resolved: true, decision } };
}

module.exports = { getEffectiveSettings, getSettings, updateSettings, listApprovals, resolveApproval };
