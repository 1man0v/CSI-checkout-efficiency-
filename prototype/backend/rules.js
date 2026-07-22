// Бизнес-правила из requirements/02-system/business-rules-and-formulas.md и
// requirements/06-system-scenarios/system-scenarios.md, применяемые на бэкенде.

// KPI, где рост показателя — хорошо (доступность, доля SCO): статус зависит от отношения factical/target.
function kpiStatusHigherBetter(value, target) {
  const ratio = target > 0 ? value / target : 1;
  if (ratio >= 1) return "good";
  if (ratio >= 0.85) return "warn";
  return "bad";
}

// Является ли магазин аутсайдером и по какой причине (упрощенная классификация для прототипа):
// технический фактор — низкая доступность; бизнес-фактор — доступность в норме, но низкая доля SCO;
// утилизация — перегруз POS выше верхнего порога.
function classifyOutlier(store, settings) {
  if (store.availability_pct < settings.availability_norm) {
    return { outlier: true, reason: "technical" };
  }
  if (store.sco_share_pct < settings.sco_share_norm) {
    return { outlier: true, reason: "business" };
  }
  if (store.pos_load_week > settings.pos_upper_overload) {
    return { outlier: true, reason: "utilization" };
  }
  return { outlier: false, reason: null };
}

// Уточнение офлайн-режима (подтверждено Product Manager, 2026-07-21): "no_connection" сам по себе
// не считается недоступностью, если касса продолжает функционировать (offline_but_available=1).
const UNAVAILABLE_STATUSES = new Set([
  "no_paper", "bank_error", "scale_error", "scanner_error", "printer_error", "off", "unknown"
]);
function isRegisterAvailable(register) {
  if (register.status === "no_connection") return !!register.offline_but_available;
  if (register.status === "blocked_by_staff" || register.status === "service_mode") return false;
  return !UNAVAILABLE_STATUSES.has(register.status);
}

// Касса не в эксплуатации (подтверждено Product Manager, 2026-07-22): зарегистрирована на кассовом
// сервере (мастер-данные — заводится вместе с магазином/кассой), но телеметрия от нее не поступала
// дольше 30 дней. Отдельное понятие от "no_connection"/offline_but_available (кратковременная
// потеря связи у работающей кассы) — здесь касса считается фактически выведенной из эксплуатации,
// хотя формально остается в счете "количество POS/КСО" (кассовый сервер не удаляет ее из реестра).
const STALE_THRESHOLD_DAYS = 30;
function daysSince(isoDate, now = Date.now()) { return (now - new Date(isoDate).getTime()) / 86400000; }
function isRegisterStale(register, now = Date.now()) {
  return daysSince(register.last_seen_at, now) > STALE_THRESHOLD_DAYS;
}
function staleDays(register, now = Date.now()) { return Math.floor(daysSince(register.last_seen_at, now)); }

// Маршрут эскалации задачи (подтверждено Product Manager, 2026-07-21): РД -> ОД.
function nextEscalation(task) {
  if (!task.escalated) return "Региональный директор";
  if (task.escalated_to === "Региональный директор") return "Региональный директор → Операционный директор";
  return task.escalated_to; // уже эскалировано до ОД — предел цепочки
}

// Эффективные настройки региона: региональное значение, если задано, иначе сетевое (наследование).
function effectiveSettings(network, regional) {
  return {
    availability_norm: regional && regional.availability_norm != null ? regional.availability_norm : network.availability_norm,
    sco_share_norm: regional && regional.sco_share_norm != null ? regional.sco_share_norm : network.sco_share_norm,
    p95_pos: network.p95_pos,
    p95_sco: network.p95_sco,
    p95_touch: network.p95_touch,
    p95_hybrid: network.p95_hybrid,
    sco_weekly_norm: network.sco_weekly_norm,
    pos_weekly_norm: network.pos_weekly_norm,
    pos_upper_overload: network.pos_upper_overload,
    pos_lower_excess_staff: network.pos_lower_excess_staff,
    cashier_hourly_rate: network.cashier_hourly_rate,
    currency: network.currency
  };
}

module.exports = { kpiStatusHigherBetter, classifyOutlier, isRegisterAvailable, isRegisterStale, staleDays, nextEscalation, effectiveSettings, STALE_THRESHOLD_DAYS };
