/* Прототип «Set — Эффективность зоны расчета». Обновлено 2026-07-22 по замечаниям к прототипу
   (нумерация комментариев соответствует пунктам замечаний пользователя). */

let currentRole = localStorage.getItem("set_role") || "od";
const RD_REGION = "Москва-Восток";
const DM_STORE_ID = "404";
let screenStateOverride = {}; // п.5: один общий контрол в сайдбаре, не по экрану
let sortState = {};
let filterState = {};
let quickFilter = {}; // screenId -> 'worst'|'best'|'low_availability'|'low_sco'|'high_potential'|null
let renderToken = 0;
let periodState = { days: 7, mode: "7d" }; // п.3
// Метка периода вычисляется динамически по periodState.mode, а не хранится как застывшая строка —
// иначе при переключении языка (п.2) подписи вроде "Последние 7 дней" оставались бы на прежнем
// языке до следующей смены периода пользователем.
function periodLabel() {
  if (periodState.mode === "custom") return periodState.customLabel;
  const key = { realtime: "action.realtime", "7d": "action.last7d", "30d": "action.last30d" }[periodState.mode] || "action.last7d";
  return t(key);
}

function setRole(role) {
  currentRole = role;
  localStorage.setItem("set_role", role);
  if (role === "dm") location.hash = `#/store/${DM_STORE_ID}`;
  else location.hash = "#/network";
  render();
}
function regionForRole() { return currentRole === "rd" ? RD_REGION : null; }
function scopeParamsForRole() { return currentRole === "rd" ? { scope: "region", region: RD_REGION } : {}; }

const NAV_ITEMS = [
  { id: "SCR-01", route: "network", key: "nav.network", roles: ["od", "rd"] },
  { id: "SCR-02", route: "outliers", key: "nav.outliers", roles: ["od", "rd"] },
  { id: "SCR-04", route: "performance", key: "nav.performance", roles: ["od", "rd", "dm"] },
  { id: "SCR-05", route: "potential", key: "nav.potential", roles: ["od", "rd", "dm"] },
  { id: "SCR-06", route: "availability", key: "nav.availability", roles: ["od", "rd", "dm"] },
  { id: "SCR-07", route: "utilization", key: "nav.utilization", roles: ["od", "rd", "dm"] },
  { id: "SCR-09", route: "tasks", key: "nav.tasks", roles: ["od", "rd", "dm"] }
];
const SECONDARY_NAV_ITEMS = [
  { id: "SCR-11", route: "diagnostics", key: "nav.diagnostics" },
  { id: "SCR-12", route: "product-analytics", key: "nav.product_analytics" },
  { id: "SCR-13", route: "advisor", key: "nav.advisor" }
];
function nav(route) { location.hash = "#/" + route; }
function currentRoute() { return location.hash.replace(/^#\//, "") || "network"; }
function currentScreenId() {
  const base = currentRoute().split("/")[0];
  const found = [...NAV_ITEMS, ...SECONDARY_NAV_ITEMS].find(i => i.route === base);
  return found ? found.id : (base === "store" ? "SCR-03" : "SCR-01");
}
function el(id) { return document.getElementById(id); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function kpiClassFor(value, target, direction) {
  const ratio = direction === "higher-better" ? value / target : target / value;
  if (ratio >= 1) return "kpi-good";
  if (ratio >= 0.85) return "kpi-warn";
  return "kpi-bad";
}
function trendArrow(delta, unit) {
  const suffix = unit ? ` ${unit}` : "";
  if (delta == null || Math.abs(delta) < 0.05) return `<span class="kpi-trend">→ 0${suffix}</span>`;
  const cls = delta > 0 ? "trend-up" : "trend-down";
  const arrow = delta > 0 ? "↑" : "↓";
  return `<span class="kpi-trend ${cls}">${arrow} ${Math.abs(delta).toFixed(1)}${suffix}</span>`;
}
function formatDate(d) { const dt = typeof d === "string" ? new Date(d) : d; return String(dt.getDate()).padStart(2, "0") + "." + String(dt.getMonth() + 1).padStart(2, "0") + "." + dt.getFullYear(); }
function formatDateTime(d) { const dt = typeof d === "string" ? new Date(d) : d; return formatDate(dt) + ", " + String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0"); }
function formatDateTimeShort(d) { const dt = typeof d === "string" ? new Date(d) : d; return String(dt.getDate()).padStart(2, "0") + "." + String(dt.getMonth() + 1).padStart(2, "0") + " " + String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0"); }
// dateStr в формате YYYY-MM-DD (как приходит из API) -> dd.mm.yyyy, без создания Date (без риска сдвига по часовому поясу).
function formatDateShort(dateStr) { const [y, m, d] = dateStr.split("-"); return `${d}.${m}.${y}`; }
function kpiCard(opts) {
  // opts: {label, value, sub, cls, onClick, trend, tooltip}
  const clickable = opts.onClick ? "clickable" : "";
  const tip = opts.tooltip ? `<span class="info-tip">i<span class="info-tip-bubble">${opts.tooltip}</span></span>` : "";
  return `<div class="card kpi-card ${opts.cls || ""} ${clickable}" ${opts.onClick ? `onclick="${opts.onClick}"` : ""}>
    <div class="kpi-label">${opts.label}${tip}</div>
    <div class="kpi-value mono">${opts.value}${opts.trend != null ? trendArrow(opts.trend) : ""}</div>
    ${opts.sub ? `<div class="kpi-delta">${opts.sub}</div>` : ""}
  </div>`;
}
const REGISTER_BADGES = {
  available: "ok", occupied: "ok", blocked_by_staff: "warn", no_paper: "bad", bank_error: "bad",
  scale_error: "bad", scanner_error: "bad", printer_error: "bad", service_mode: "warn", no_connection: "info",
  off: "bad", unknown: "warn"
};
function registerLabel(status) { return t("reg." + status) !== "reg." + status ? t("reg." + status) : t("reg.unknown"); }
function statusBadge(status) { const badge = REGISTER_BADGES[status] || REGISTER_BADGES.unknown; return `<span class="status-dot ${badge}"></span>${registerLabel(status)}`; }
function outlierLabel(reason) { return { technical: t("outlier.technical"), business: t("outlier.business"), utilization: t("outlier.utilization") }[reason] || t("outlier.none"); }
// Причины простоя приходят из БД на русском (справочник technical_causes) — сопоставляем с ключом
// перевода по значению; ФИО/названия регионов из этого правила исключены явно (не переводятся).
const CAUSE_KEY_BY_RU = {
  "Нет бумаги": "cause.no_paper", "Ошибка банка": "cause.bank_error", "Заблокирована сотрудником": "cause.blocked",
  "Ошибка весов": "cause.scale_error", "Ошибка сканера": "cause.scanner_error", "Ошибка принтера": "cause.printer_error",
  "Сервисный режим": "cause.service_mode", "Нет связи (офлайн)": "cause.no_connection", "Ошибка ККТ": "cause.kkt_error",
  "Сбой терминала эквайринга": "cause.acquiring_error", "Ошибка сканера POS": "cause.pos_scanner_error"
};
function causeDisplayName(causeRu) { const key = CAUSE_KEY_BY_RU[causeRu]; return key ? t(key) : causeRu; }
function barRow(label, value, total) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${label}</span><span class="mono">${value} ${t("unit.hours")}</span></div>
    <div style="background:var(--color-bg);border-radius:4px;height:8px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--color-accent)"></div></div></div>`;
}
function toast(msg) {
  let host = el("toast-host");
  if (!host) { host = document.createElement("div"); host.id = "toast-host"; host.className = "toast-host"; document.body.appendChild(host); }
  const item = document.createElement("div"); item.className = "toast"; item.textContent = msg;
  host.appendChild(item); setTimeout(() => item.remove(), 2600);
}
function openOverlay(html, kind) {
  closeOverlay();
  const overlay = document.createElement("div");
  overlay.className = "overlay" + (kind === "drawer" ? " drawer-overlay" : "");
  overlay.id = "active-overlay"; overlay.innerHTML = html;
  overlay.addEventListener("click", e => { if (e.target === overlay) closeOverlay(); });
  document.body.appendChild(overlay);
}
function closeOverlay() { const o = el("active-overlay"); if (o) o.remove(); }

// --- Экспорт CSV (п.4: "что конкретно делает кнопка экспорт?" — теперь реально скачивает файл) ---
function exportCsv(filename, rows) {
  if (!rows || !rows.length) { toast(t("toast.no_export_data")); return; }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(";")].concat(rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(";"))).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  toast(t("toast.export"));
}

// --- Состояние экрана: единый контрол в сайдбаре (п.5) ---
function stateWrapper(screenId, contentFn) {
  const state = screenStateOverride[screenId];
  if (state === "loading") return skeletonHtml();
  if (state === "empty") return `<div class="state-panel"><div class="state-icon">—</div><p>${t("state.no_data")}</p></div>`;
  if (state === "serverError") return `<div class="state-panel"><div class="state-icon">!</div><p>${t("state.server_error_demo")}</p><button class="btn" onclick="render()">${t("state.retry")}</button></div>`;
  return contentFn();
}
async function withState(screenId, contentEl, loaderFn, renderFn, isEmptyFn) {
  const override = screenStateOverride[screenId];
  if (override && override !== "auto") { contentEl.innerHTML = stateWrapper(screenId, () => ""); return; }
  contentEl.innerHTML = skeletonHtml();
  const myToken = ++renderToken;
  try {
    const data = await loaderFn();
    if (myToken !== renderToken) return;
    if (isEmptyFn && isEmptyFn(data)) { contentEl.innerHTML = `<div class="state-panel"><div class="state-icon">—</div><p>${t("state.no_data")}</p></div>`; return; }
    contentEl.innerHTML = renderFn(data);
  } catch (e) {
    if (myToken !== renderToken) return;
    contentEl.innerHTML = `<div class="state-panel"><div class="state-icon">!</div><p>${escapeHtml(e.message || t("state.server_error_demo"))}</p><button class="btn" onclick="render()">${t("state.retry")}</button></div>`;
  }
}
function skeletonHtml() {
  return `<div class="grid grid-kpi">${[1, 2, 3].map(() => `<div class="skeleton skeleton-kpi"></div>`).join("")}</div>
    <div class="card"><div class="skeleton skeleton-line" style="width:40%"></div><div class="skeleton skeleton-line" style="width:90%"></div></div>`;
}
function setScreenState(value) { screenStateOverride[currentScreenId()] = value === "auto" ? undefined : value; render(); }

// --- Период (п.1, п.3): пресеты + календарь-подсказка (аналог выбора дат при бронировании
// авиабилетов) с реальным выбором ДИАПАЗОНА (клик по началу, затем по концу периода) и единым
// европейским форматом дат (dd.mm.yyyy) везде, включая ярлык периода и подсказки календаря. ---
let periodCalendarMonth = new Date();
let periodDailyCache = null;
let periodRangeStart = null; // dateStr (YYYY-MM-DD) начала диапазона, пока не выбран конец
function periodButtonLabel() { return periodLabel(); }
function togglePeriodPanel() {
  const panel = el("period-panel");
  if (panel) { panel.remove(); return; }
  openPeriodPanel();
}
async function openPeriodPanel() {
  periodRangeStart = null;
  const host = el("period-picker-host");
  const div = document.createElement("div");
  div.className = "period-panel"; div.id = "period-panel";
  div.innerHTML = `<div class="period-presets">
      <button onclick="applyPeriodPreset('realtime')">${t("action.realtime")}</button>
      <button onclick="applyPeriodPreset('7d')">${t("action.last7d")}</button>
      <button onclick="applyPeriodPreset('30d')">${t("action.last30d")}</button>
    </div>
    <div id="period-calendar"></div>
    <div class="form-help" id="period-range-hint"></div>
    <div class="period-actions"><button class="btn btn-sm" onclick="closePeriodPanel()">${t("action.close")}</button></div>`;
  host.appendChild(div);
  await renderPeriodCalendar();
  setTimeout(() => document.addEventListener("click", periodOutsideClick), 0);
}
function periodOutsideClick(e) {
  const panel = el("period-panel"); const btn = el("period-btn");
  if (panel && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePeriodPanel();
}
function closePeriodPanel() { const p = el("period-panel"); if (p) p.remove(); periodRangeStart = null; document.removeEventListener("click", periodOutsideClick); }
function applyPeriodPreset(preset) {
  const map = { realtime: { days: 1 }, "7d": { days: 7 }, "30d": { days: 30 } };
  periodState = { mode: preset, ...map[preset] };
  closePeriodPanel(); render();
}
async function renderPeriodCalendar() {
  const host = el("period-calendar");
  if (!host) return;
  const month = periodCalendarMonth;
  const year = month.getFullYear(), mon = month.getMonth();
  const first = new Date(year, mon, 1);
  const startOffset = (first.getDay() + 6) % 7; // понедельник — первый день недели
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  if (!periodDailyCache) {
    try { periodDailyCache = await api.getDailySeries({ scope: "network", days: 60 }); } catch (e) { periodDailyCache = []; }
  }
  const byDate = new Map(periodDailyCache.map(d => [d.date, d]));
  const monthLabel = month.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
  const weekdays = ["weekday.mon", "weekday.tue", "weekday.wed", "weekday.thu", "weekday.fri", "weekday.sat", "weekday.sun"];
  let cells = `<div class="period-calendar-header"><button onclick="changePeriodMonth(event,-1)">←</button><span>${monthLabel}</span><button onclick="changePeriodMonth(event,1)">→</button></div>
    <div class="period-calendar-grid">${weekdays.map(k => `<div class="dow">${t(k)}</div>`).join("")}`;
  for (let i = 0; i < startOffset; i++) cells += `<div class="period-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const info = byDate.get(dateStr);
    const dotColor = info ? (info.availability_pct >= 90 ? "var(--color-green)" : info.availability_pct >= 80 ? "var(--color-yellow)" : "var(--color-red)") : "transparent";
    const tooltip = info ? `${t("period.availability")}: ${info.availability_pct}%, ${t("period.sco_share")}: ${info.sco_share_pct}%` : t("period.no_data");
    const isEdge = periodRangeStart === dateStr;
    cells += `<div class="period-day ${isEdge ? "range-edge" : ""}" onmouseenter="showDayTooltip(event,'${dateStr}','${tooltip}')" onmouseleave="hideDayTooltip()" onclick="selectPeriodDate(event,'${dateStr}')">
      ${d}<span class="dot" style="background:${dotColor}"></span></div>`;
  }
  cells += `</div>`;
  host.innerHTML = cells;
  const hint = el("period-range-hint");
  if (hint) hint.textContent = periodRangeStart ? t("period.hint.picked_start", { date: formatDateShort(periodRangeStart) }) : t("period.hint.start");
}
// event.stopPropagation() необходим: клик пересоздает DOM ячеек/шапки календаря синхронно внутри
// обработчика, из-за чего исходный e.target отсоединяется от документа ДО того, как событие
// всплывет до document-обработчика periodOutsideClick — тот видит panel.contains(detached)===false
// и закрывает панель, как будто клик был снаружи. Без остановки всплытия календарь схлопывался бы
// при каждом клике по дню/стрелке месяца.
function changePeriodMonth(event, delta) { event.stopPropagation(); periodCalendarMonth = new Date(periodCalendarMonth.getFullYear(), periodCalendarMonth.getMonth() + delta, 1); renderPeriodCalendar(); }
function showDayTooltip(e, dateStr, text) {
  hideDayTooltip();
  const bubble = document.createElement("div");
  bubble.className = "period-day-tooltip"; bubble.id = "day-tooltip"; bubble.textContent = text;
  e.currentTarget.appendChild(bubble);
}
function hideDayTooltip() { const b = el("day-tooltip"); if (b) b.remove(); }
function selectPeriodDate(event, dateStr) {
  event.stopPropagation();
  if (!periodRangeStart) { periodRangeStart = dateStr; renderPeriodCalendar(); return; }
  let from = periodRangeStart, to = dateStr;
  if (from > to) [from, to] = [to, from];
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
  periodState = { mode: "custom", customLabel: `${formatDateShort(from)}–${formatDateShort(to)}`, days, from, to };
  periodRangeStart = null;
  closePeriodPanel(); render();
}

// --- График: линия или столбцы, с динамическими осями. Правки по замечанию: на оси X не было
// подписей вовсе (только 3 фиксированные точки), на оси Y — не было промежуточных значений (только
// верх/низ). Теперь: "красивые" шаги по Y с гридлайнами и подписями, адаптивная плотность подписей
// и приглушенные вертикальные гридлайны по X. ---
function niceStep(range, targetTicks) {
  if (!isFinite(range) || range <= 0) return 1;
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * mag;
}
function niceTicks(min, max, targetTicks = 4) {
  if (min === max) { min -= 1; max += 1; }
  const step = niceStep(max - min, targetTicks) || 1;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}
function renderChart({ points, trendPoints, refValue, refLabel, formatX, kind = "line", width = 680, height = 240, valueSuffix = "" }) {
  if (!points || !points.length) return `<p style="color:var(--color-text-muted)">${t("chart.no_data")}</p>`;
  const values = points.map(p => p.value).concat(trendPoints ? trendPoints.map(p => p.value) : []).concat(refValue != null ? [refValue] : []);
  const dataMin = Math.min(...values), dataMax = Math.max(...values);
  const rawMin = kind === "bar" ? Math.min(0, dataMin) : dataMin;
  const rawMax = kind === "bar" ? Math.max(0, dataMax) : dataMax;
  const ticks = niceTicks(rawMin, rawMax, 4);
  const min = ticks[0], max = ticks[ticks.length - 1];
  const padL = 46, padB = 26, padT = 12, padR = 14;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  // Для столбцов используем полосовую раскладку (центр столбца — середина его полосы), а не
  // раскладку "точка на линии от края до края" линейного графика — иначе первый/последний столбец
  // выходят за пределы области построения и перекрывают подписи оси Y (реальный баг, найден
  // при проверке в браузере: столбец начинался левее самой оси и закрывал текст "50"/"100").
  const xFor = kind === "bar"
    ? i => padL + (plotW / points.length) * (i + 0.5)
    : i => padL + (i / Math.max(1, points.length - 1)) * plotW;
  const yFor = v => padT + plotH - ((v - min) / (max - min || 1)) * plotH;
  const linePath = pts => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`).join(" ");
  const refY = refValue != null ? yFor(refValue) : null;

  // Не более одной подписи примерно на каждые 56px ширины графика — иначе подписи слипаются.
  const maxLabels = Math.max(2, Math.floor(plotW / 56));
  const step = Math.max(1, Math.ceil(points.length / maxLabels));
  const labelIdxs = [];
  for (let i = 0; i < points.length; i += step) labelIdxs.push(i);
  if (labelIdxs[labelIdxs.length - 1] !== points.length - 1) labelIdxs.push(points.length - 1);

  // --color-border уже очень светлый (oklch 88%) — при stroke-opacity 0.5 линии по Y были
  // практически невидимы (замечание "по оси Y их просто мало"). По Y гридлайны должны быть хорошо
  // читаемы, по X — наоборот, приглушенные ("постарайся сделать их менее яркими").
  const yGrid = ticks.map(v => `
    <line x1="${padL}" y1="${yFor(v).toFixed(1)}" x2="${width - padR}" y2="${yFor(v).toFixed(1)}" stroke="var(--color-text-muted)" stroke-opacity="0.3" />
    <text x="${padL - 6}" y="${(yFor(v) + 3).toFixed(1)}" font-size="10" fill="var(--color-text-muted)" text-anchor="end">${v}${valueSuffix}</text>`).join("");
  const xGrid = labelIdxs.map(i => `<line x1="${xFor(i).toFixed(1)}" y1="${padT}" x2="${xFor(i).toFixed(1)}" y2="${padT + plotH}" stroke="var(--color-text-muted)" stroke-opacity="0.12" />`).join("");
  const xLabels = labelIdxs.map(i => `<text x="${xFor(i).toFixed(1)}" y="${height - 6}" font-size="9" fill="var(--color-text-muted)" text-anchor="middle">${formatX(points[i].ts)}</text>`).join("");

  let dataMarkup;
  if (kind === "bar") {
    const barW = Math.max(2, (plotW / points.length) * 0.6);
    dataMarkup = points.map((p, i) => {
      const x = xFor(i) - barW / 2, y = yFor(p.value);
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + plotH - y).toFixed(1)}" fill="var(--color-accent)" rx="1.5" />`;
    }).join("");
  } else {
    dataMarkup = `<path d="${linePath(points)}" fill="none" stroke="var(--color-accent)" stroke-width="2" />
      ${trendPoints ? `<path d="${linePath(trendPoints)}" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5" stroke-dasharray="5 3" />` : ""}`;
  }

  return `<div class="chart-svg-wrap"><svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px">
    ${yGrid}
    ${xGrid}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="var(--color-border)" />
    <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" stroke="var(--color-border)" />
    ${refY != null ? `<line x1="${padL}" y1="${refY.toFixed(1)}" x2="${width - padR}" y2="${refY.toFixed(1)}" stroke="var(--color-yellow)" stroke-dasharray="4 3" />
      <text x="${width - padR}" y="${(refY - 4).toFixed(1)}" font-size="10" fill="var(--color-yellow)" text-anchor="end">${refLabel}</text>` : ""}
    ${dataMarkup}
    ${xLabels}
  </svg></div>
  <div class="chart-legend-row">
    ${kind === "bar"
      ? `<span class="legend-item"><span class="swatch" style="background:var(--color-accent)"></span>${t("chart.actual_value")}</span>`
      : `<span class="legend-item"><span class="swatch-line" style="background:var(--color-accent)"></span>${t("chart.actual_value")}</span>
    ${trendPoints ? `<span class="legend-item"><span class="swatch-line" style="background:var(--color-text-muted)"></span>${t("chart.trend_ma")}</span>` : ""}`}
    ${refValue != null ? `<span class="legend-item"><span class="swatch-line" style="background:var(--color-yellow)"></span>${refLabel}</span>` : ""}
  </div>`;
}
function formatHourLabel(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2, "0") + ":00 " + String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0"); }
function formatDayLabel(ts) { const d = new Date(ts); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0"); }
function formatWeekLabel(ts) { return t("chart.week_prefix") + " " + formatDayLabel(ts); }

// --- Динамическая гранулярность оси времени по выбранному периоду: день -> часы, неделя -> дни,
// месяц и более -> недели. ---
function chartGranularity() {
  const days = periodState.days || 7;
  if (periodState.mode === "realtime" || days <= 1) return "hour";
  if (days <= 12) return "day";
  return "week";
}
function isoWeekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // понедельник = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function groupWeekly(rows, field, agg) {
  const byWeek = new Map();
  for (const r of rows) {
    const wk = isoWeekStart(r.date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push(r[field]);
  }
  const weeks = [...byWeek.keys()].sort();
  return weeks.map(wk => {
    const vals = byWeek.get(wk);
    const value = agg === "sum" ? vals.reduce((a, b) => a + b, 0) : avg(vals);
    return { ts: wk, value: Math.round(value * 10) / 10 };
  });
}
const METRIC_DAILY_FIELD = { availability: "availability_pct", sco_share: "sco_share_pct", pos_availability: "pos_availability_pct", sco_checks: "sco_checks", pos_checks: "pos_checks" };
const METRIC_AGG = { availability: "avg", sco_share: "avg", pos_availability: "avg", sco_checks: "sum", pos_checks: "sum" };
const COUNT_METRICS = new Set(["sco_checks", "pos_checks"]);
function metricKind(metric) { return COUNT_METRICS.has(metric) ? "bar" : "line"; }
function metricUnit(metric) { return COUNT_METRICS.has(metric) ? "" : "%"; }

async function fetchMetricChartData(scopeParams, metric) {
  const granularity = chartGranularity();
  if (granularity === "hour") {
    const hours = Math.min((periodState.days || 1) * 24, 168) || 24;
    const series = await api.getHourlySeries({ metric, hours, ...scopeParams });
    return { points: series.points, trendPoints: series.trend, refValue: series.p95, formatX: formatHourLabel };
  }
  const params = { ...scopeParams };
  if (periodState.from && periodState.to) { params.from = periodState.from; params.to = periodState.to; }
  else params.days = Math.max(periodState.days || 30, granularity === "week" ? 30 : 7);
  const daily = await api.getDailySeries(params);
  const field = METRIC_DAILY_FIELD[metric];
  if (granularity === "day") return { points: daily.map(d => ({ ts: d.date, value: d[field] })), formatX: formatDayLabel };
  return { points: groupWeekly(daily, field, METRIC_AGG[metric]), formatX: formatWeekLabel };
}

// --- Drill-down по KPI-плашке (любой экран, любая метрика с реальным временным рядом): единая
// точка входа, гранулярность и тип графика (линия/столбцы) выбираются автоматически по метрике
// и выбранному периоду. refOverride позволяет заменить p95-подсказку на целевое значение (например,
// потенциал перевода на SCO вместо p95). ---
function openMetricChart(scopeParams, metric, label, refOverride) {
  const kind = metricKind(metric);
  const suffix = metricUnit(metric);
  openOverlay(`<div class="drawer drawer-wide">
    <div class="drawer-header"><h2>${label} (${periodLabel()})</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <div id="metric-chart-body"><div class="skeleton skeleton-line" style="width:90%"></div></div>
  </div>`, "drawer");
  (async () => {
    try {
      const { points, trendPoints, refValue, formatX } = await fetchMetricChartData(scopeParams, metric);
      const finalRef = refOverride ? refOverride.value : refValue;
      const finalRefLabel = refOverride ? refOverride.label : (refValue != null ? `p95 = ${refValue}${suffix}` : undefined);
      const body = el("metric-chart-body");
      if (body) body.innerHTML = renderChart({ points, trendPoints: kind === "bar" ? null : trendPoints, refValue: finalRef, refLabel: finalRefLabel, formatX, kind, valueSuffix: suffix });
    } catch (e) {
      const body = el("metric-chart-body");
      if (body) body.innerHTML = `<p style="color:var(--color-red)">${escapeHtml(e.message)}</p>`;
    }
  })();
}

// --- Столбчатая диаграмма по категориям (не по времени) — для метрик без временного ряда в модели
// данных прототипа: p95/утилизация хранятся как текущее значение на кассу, а не история, поэтому
// вместо линии по времени показываем сравнение по кассам. ---
function openCategoryBarChart(points, label, unitSuffix) {
  openOverlay(`<div class="drawer drawer-wide">
    <div class="drawer-header"><h2>${label}</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <div>${renderChart({ points, formatX: v => v, kind: "bar", valueSuffix: unitSuffix })}</div>
  </div>`, "drawer");
}

// --- Drill-down по кассе: история состояний (п.12), доступно для любой роли ---
function openRegisterHistory(registerId) {
  openOverlay(`<div class="drawer">
    <div class="drawer-header"><h2>${t("register.history_title", { id: registerId })}</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <div id="register-history-body"><div class="skeleton skeleton-line" style="width:90%"></div></div>
  </div>`, "drawer");
  (async () => {
    try {
      const data = await api.getRegisterHistory(registerId);
      const body = el("register-history-body");
      const total = Object.values(data.totalsByStatus).reduce((a, b) => a + b, 0) || 1;
      const rows = Object.entries(data.totalsByStatus).sort((a, b) => b[1] - a[1]);
      body.innerHTML = `
        <p style="color:var(--color-text-muted);font-size:13px">${t("register.type_label")}: ${data.register.type} · ${t("register.current_state")}: ${statusBadge(data.register.status)}</p>
        <h3 style="margin-top:16px">${t("register.total_time_by_state")}</h3>
        ${rows.map(([status, minutes]) => barRow(`${registerLabel(status)} (${data.occurrencesByStatus[status]}×)`, Math.round(minutes / 6) / 10, Math.round(total / 6) / 10)).join("")}
        <h3 style="margin-top:16px">${t("register.episode_log")}</h3>
        <table><thead><tr><th>${t("th.state")}</th><th>${t("th.start")}</th><th class="mono">${t("th.duration")}</th></tr></thead>
        <tbody>${data.episodes.map(ep => `<tr><td>${statusBadge(ep.status)}</td><td class="mono">${formatDateTime(ep.started_at)}</td>
          <td class="mono">${ep.ended_at ? formatDuration(ep.duration_minutes) : t("duration.ongoing")}</td></tr>`).join("")}</tbody></table>`;
    } catch (e) {
      el("register-history-body").innerHTML = `<p style="color:var(--color-red)">${escapeHtml(e.message)}</p>`;
    }
  })();
}
function formatDuration(minutes) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h} ${t("unit.h")} ${m} ${t("unit.min")}` : `${m} ${t("unit.min")}`;
}
function elapsedSince(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${min} ${t("unit.min")}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${t("unit.h")}`;
  return `${Math.floor(h / 24)} ${t("unit.d")} ${h % 24} ${t("unit.h")}`;
}

// ---------- Каркас ----------
function renderShell() {
  el("sidebar").innerHTML = `
    <div class="sidebar-brand">${t("brand.name")}<small>${t("brand.subtitle")}</small></div>
    <div class="role-switcher"><div class="role-switcher-label">${t("role.label")}</div>
      <div class="role-toggle">${roleButton("od")}${roleButton("rd")}${roleButton("dm")}</div></div>
    <nav class="nav">${NAV_ITEMS.filter(i => i.roles.includes(currentRole)).map(navItemHtml).join("")}</nav>
    <div class="nav-secondary"><div class="nav-secondary-label">${t("nav.other_views")}</div>
      ${SECONDARY_NAV_ITEMS.map(navItemHtml).join("")}
      <a class="settings-link" href="settings.html" target="_blank">⚙ ${t("nav.settings")}</a>
      <div class="sidebar-dev-control"><label>${t("state.label")}</label>
        <select onchange="setScreenState(this.value)">
          <option value="auto">${t("state.auto")}</option>
          <option value="loading" ${screenStateOverride[currentScreenId()] === "loading" ? "selected" : ""}>${t("state.loading")}</option>
          <option value="empty" ${screenStateOverride[currentScreenId()] === "empty" ? "selected" : ""}>${t("state.empty")}</option>
          <option value="validationError" ${screenStateOverride[currentScreenId()] === "validationError" ? "selected" : ""}>${t("state.validationError")}</option>
          <option value="serverError" ${screenStateOverride[currentScreenId()] === "serverError" ? "selected" : ""}>${t("state.serverError")}</option>
        </select></div>
    </div>`;
  renderTopbarShell();
}
function roleButton(role) {
  const active = currentRole === role ? "active" : "";
  return `<button class="${active}" onclick="setRole('${role}')">${t("role." + role)}<span class="scope">${t("role." + role + ".scope")}</span></button>`;
}
function navItemHtml(item) {
  const active = currentRoute() === item.route || currentRoute().startsWith(item.route + "/") ? "active" : "";
  return `<div class="nav-item ${active}" onclick="nav('${item.route}')"><span>${t(item.key)}</span></div>`;
}
// п.2: слева — контекст (что смотрю сейчас), справа — часы 24ч + период + язык (не дублирующие подписи)
function renderTopbarShell() {
  el("topbar-tools-right").innerHTML = `
    <div class="period-picker" id="period-picker-host">
      <button class="btn btn-sm period-btn" id="period-btn" onclick="togglePeriodPanel()">📅 ${periodButtonLabel()}</button>
    </div>
    <span class="topbar-clock mono" id="live-clock"></span>
    <select class="lang-select" onchange="setLang(this.value)">${LANGUAGES.map(l => `<option value="${l.code}" ${l.code === currentLang ? "selected" : ""}>${l.label}</option>`).join("")}</select>`;
  updateClock();
}
function updateClock() {
  const el2 = el("live-clock");
  if (!el2) return;
  const now = new Date();
  const time = now.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  el2.textContent = `${formatDate(now)} ${time}`;
}
setInterval(updateClock, 1000);

function renderTopbar(crumbs) {
  // crumbs: [{label, route?}] — последний элемент активный (текущий контекст: сеть/регион/магазин)
  el("topbar-context").innerHTML = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1;
    return `<span class="crumb ${isLast ? "current" : ""}">${c.route ? `<a onclick="nav('${c.route}')">${c.label}</a>` : c.label}</span>${!isLast ? '<span class="crumb">/</span>' : ""}`;
  }).join("");
}
function scopeCrumb() {
  if (currentRole === "od") return { label: t("scope.network") };
  if (currentRole === "rd") return { label: `${t("scope.region")}: ${RD_REGION}` };
  return { label: `${t("scope.store")} №${DM_STORE_ID}` };
}

// ---------- Роутер ----------
function render() {
  renderShell();
  const route = currentRoute();
  const [base, param] = route.split("/");
  if (currentRole === "dm" && (base === "network" || base === "outliers")) { location.hash = `#/store/${DM_STORE_ID}`; return; }
  const routes = {
    network: renderNetworkDashboard, outliers: renderOutliers, store: () => renderStoreCard(param || DM_STORE_ID),
    performance: renderPerformance, potential: renderPotential, availability: renderAvailability, utilization: renderUtilization,
    tasks: renderTasks, diagnostics: renderDiagnostics, "product-analytics": renderProductAnalytics, advisor: renderAdvisor
  };
  (routes[base] || renderNetworkDashboard)();
}

// ================= SCR-01: Дашборд сети (перестроен по п.7, п.8) =================
function renderNetworkDashboard() {
  renderTopbar([{ label: currentRole === "od" ? t("nav.network") : `${scopeCrumb().label} — ${t("nav.network")}` }]); // п.2: не повторять "вся сеть"/"дашборд сети" дважды
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.network")}</h1>
    <button class="btn" onclick="exportNetworkCsv()">${t("action.export")}</button></div><div id="scr01-body"></div>`;
  withState("SCR-01", el("scr01-body"),
    async () => {
      const scopeParams = scopeParamsForRole();
      const [storesList, causes, regions, pos] = await Promise.all([
        api.getStores(scopeParams), api.getTechnicalCauses(), api.getRegionsSummary({ days: periodState.days }), api.getPosSummary(scopeParams)
      ]);
      return { storesList, causes, regions: currentRole === "rd" ? regions.filter(r => r.region === RD_REGION) : regions, pos };
    },
    ({ storesList, causes, regions, pos }) => {
      const scopeParams = scopeParamsForRole();
      const scopeParamsAttr = JSON.stringify(scopeParams).replace(/"/g, "&quot;");
      const availability = avg(storesList.map(s => s.availability_pct));
      const scoShare = avg(storesList.map(s => s.sco_share_pct));
      const attention = storesList.filter(s => s.outlier);
      const scoCauses = causes.filter(c => c.applies_to !== "POS");
      const scoTotal = scoCauses.reduce((a, c) => a + c.hours, 0);
      const posTotal = pos.causes.reduce((a, c) => a + c.hours, 0);
      const attentionIdsAttr = JSON.stringify(attention.map(s => s.id)).replace(/"/g, "&quot;");

      return `
        <div class="section"><h3>${t("section.general_info")}</h3>
        <div class="grid grid-kpi">
          ${kpiCard({ label: t("kpi.availability"), value: availability.toFixed(0) + "%", sub: t("kpi.norm_prefix") + "90%",
            cls: kpiClassFor(availability, 90, "higher-better"), onClick: `openMetricChart(${scopeParamsAttr}, 'availability', '${t("kpi.availability")}')` })}
          ${kpiCard({ label: t("kpi.sco_share"), value: scoShare.toFixed(0) + "%", sub: t("kpi.norm_prefix") + "30%",
            cls: kpiClassFor(scoShare, 30, "higher-better"), onClick: `openMetricChart(${scopeParamsAttr}, 'sco_share', '${t("kpi.sco_share")}')` })}
          ${kpiCard({ label: t("kpi.pos_availability"), value: pos.availability_pct + "%", cls: kpiClassFor(pos.availability_pct, 95, "higher-better"),
            onClick: `openMetricChart(${scopeParamsAttr}, 'pos_availability', '${t("kpi.pos_availability")}')` })}
          ${kpiCard({ label: t("kpi.pos_checks"), value: pos.checks_week.toLocaleString(dateLocale()),
            onClick: `openMetricChart(${scopeParamsAttr}, 'pos_checks', '${t("kpi.pos_checks")}')` })}
          ${kpiCard({ label: t("kpi.stores_on_control"), value: attention.length + " " + t("scope.of") + " " + storesList.length, sub: t("kpi.attention_sub"), cls: attention.length ? "kpi-warn" : "kpi-good",
            onClick: attention.length ? `openAttentionTasks(${attentionIdsAttr})` : null })}
        </div></div>

        <div class="section"><div class="section-header"><h2>${t("section.regions_trend")}${periodLabel().toLowerCase()}</h2></div>
          <div class="card"><table><thead><tr><th>${t("th.region")}</th><th>${t("th.stores_count")}</th><th>${t("th.regional_director")}</th><th class="mono">${t("th.availability")}</th><th class="mono">${t("th.trend")}</th><th class="mono">${t("th.sco_share")}</th><th class="mono">${t("th.trend")}</th></tr></thead>
          <tbody>${regions.map(r => `<tr class="clickable-row region-row" onclick="filterState.networkRegion='${r.region}'; renderNetworkDashboard()">
            <td>${r.region}</td><td class="mono">${r.storeCount}</td><td>${r.regionalDirector}</td>
            <td class="mono">${r.availability_pct}%</td><td>${trendArrow(r.availability_trend, t("unit.pp"))}</td>
            <td class="mono">${r.sco_share_pct}%</td><td>${trendArrow(r.sco_share_trend, t("unit.pp"))}</td>
          </tr>`).join("")}</tbody></table></div>
        </div>

        <div class="section"><h3>${t("section.info_sco")}</h3><div class="card">${scoCauses.map(c => barRow(causeDisplayName(c.cause) + (c.note ? " ⓘ" : ""), c.hours, scoTotal)).join("")}</div></div>
        <div class="section"><h3>${t("section.info_pos")}</h3>
          <div class="card">${pos.causes.length ? pos.causes.map(c => barRow(causeDisplayName(c.cause), c.hours, posTotal)).join("") : `<p style="color:var(--color-text-muted)">${t("section.no_pos_causes")}</p>`}</div>
        </div>

        <div class="section"><div class="section-header"><h2>${t("section.attention_problems")}</h2><a onclick="nav('outliers')">${t("section.all_outliers")}</a></div>
          ${renderStoreQuickFilters("SCR-01")}
          <div class="card">${renderSortableStoreTable(applyQuickFilter(attention.filter(s => !filterState.networkRegion || s.region === filterState.networkRegion), "SCR-01"), "SCR-01")}</div>
        </div>`;
    });
}
function exportNetworkCsv() {
  api.getStores(scopeParamsForRole()).then(list => exportCsv("set-network-stores.csv", list.map(s => ({
    [t("th.store")]: s.number, [t("th.name")]: s.name, [t("th.region")]: s.region, [t("th.format")]: s.format, [t("th.director")]: s.director_name,
    [t("th.availability")]: s.availability_pct, [t("th.sco_share")]: s.sco_share_pct, [t("th.potential")]: s.potential_sco_pct,
    [t("th.cause")]: s.outlier ? outlierLabel(s.reason) : t("outlier.none")
  }))));
}

// --- Общая таблица магазинов: сортировка по всем столбцам + быстрые фильтры (п.9, п.10) ---
function renderStoreQuickFilters(screenId) {
  const current = quickFilter[screenId];
  const btn = (key, labelKey) => `<button class="${current === key ? "active" : ""}" onclick="setQuickFilter('${screenId}','${key}')">${t(labelKey)}</button>`;
  return `<div class="quick-filters">${btn("worst", "action.worst_first")}${btn("best", "action.best_first")}${btn("low_availability", "action.low_availability")}${btn("low_sco", "action.low_sco")}${btn("high_potential", "action.high_potential")}</div>`;
}
// Сохраняет позицию прокрутки вокруг ре-рендера экрана (п.6): клик по фильтру/заголовку столбца
// раньше визуально "выбрасывал" пользователя наверх страницы, хотя данные пересортировывались
// корректно — это и читалось как "сортировка/фильтры не работают".
function withScrollPreserved(fn) {
  const y = window.scrollY;
  fn();
  const restore = () => window.scrollTo(0, y);
  requestAnimationFrame(restore);
  setTimeout(restore, 60);
  setTimeout(restore, 220);
}
// Экраны, использующие renderSortableStoreTable (карта screenId -> функция ре-рендера экрана).
// SCR-05 (Потенциал SCO) отсутствовал здесь — клик по заголовку столбца или быстрому фильтру на
// этом экране падал с TypeError (screenId не найден в карте), найдено при проверке в браузере.
function screenRenderFn(screenId) { return { "SCR-01": renderNetworkDashboard, "SCR-02": renderOutliers, "SCR-05": renderPotential }[screenId]; }
function setQuickFilter(screenId, key) {
  quickFilter[screenId] = quickFilter[screenId] === key ? null : key;
  withScrollPreserved(() => screenRenderFn(screenId)());
}
function applyQuickFilter(list, screenId) {
  // Быстрые фильтры теперь только задают порядок сортировки (п.11) — не сужают список магазинов:
  // "низкая доступность" раньше отфильтровывала до одного магазина вместо сортировки от низкой
  // к высокой по всем магазинам, что и читалось как "фильтр не работает".
  const key = quickFilter[screenId];
  if (key === "worst" || key === "low_availability") sortState[screenId] = { col: "availability_pct", dir: 1 };
  else if (key === "best") sortState[screenId] = { col: "availability_pct", dir: -1 };
  else if (key === "low_sco") sortState[screenId] = { col: "sco_share_pct", dir: 1 };
  else if (key === "high_potential") sortState[screenId] = { col: "potential_sco_pct", dir: -1 };
  return [...list];
}
function renderSortableStoreTable(list, screenId) {
  const rows = list.map(s => ({ ...s, causeLabel: s.outlier ? (s.top_cause ? causeDisplayName(s.top_cause) : outlierLabel(s.reason)) : t("outlier.none") }));
  const sort = sortState[screenId] || { col: "availability_pct", dir: 1 };
  const sorted = [...rows].sort((a, b) => (a[sort.col] > b[sort.col] ? 1 : a[sort.col] < b[sort.col] ? -1 : 0) * sort.dir);
  const arrow = col => (sortState[screenId] && sortState[screenId].col === col) ? (sortState[screenId].dir === 1 ? "▲" : "▼") : "";
  const th = (col, label) => `<th class="sortable" onclick="sortStoreTable('${screenId}','${col}')">${label} <span class="sort-arrow">${arrow(col)}</span></th>`;
  return `<table><thead><tr>
    ${th("number", t("th.store"))}${th("region", t("th.region"))}${th("format", t("th.format"))}${th("director_name", t("th.director"))}
    ${th("availability_pct", t("th.availability"))}${th("sco_share_pct", t("th.sco_share"))}${th("potential_sco_pct", t("th.potential"))}${th("causeLabel", t("th.cause"))}</tr></thead>
    <tbody>${sorted.map(s => `<tr class="clickable-row" onclick="nav('store/${s.id}')">
      <td>${s.number} «${s.name}»</td><td>${s.region}</td><td>${s.format}</td><td>${s.director_name}</td>
      <td class="mono">${s.availability_pct}%</td><td class="mono">${s.sco_share_pct}%</td><td class="mono">+${s.potential_sco_pct}%</td>
      <td><span class="badge badge-warn">${s.causeLabel}</span></td>
    </tr>`).join("") || `<tr><td colspan="8">${t("th.no_stores_filtered")}</td></tr>`}</tbody></table>`;
}
function sortStoreTable(screenId, col) {
  const s = sortState[screenId] || { col, dir: 1 };
  sortState[screenId] = { col, dir: s.col === col ? -s.dir : 1 };
  quickFilter[screenId] = null; // п.11: ручная сортировка сбрасывает активный быстрый фильтр
  withScrollPreserved(() => screenRenderFn(screenId)());
}

// ================= SCR-02: Аутсайдеры =================
function renderOutliers() {
  renderTopbar([scopeCrumb(), { label: t("nav.network"), route: "network" }, { label: t("nav.outliers") }]);
  const content = el("content");
  const fs = filterState["SCR-02"] || { region: "all" };
  filterState["SCR-02"] = fs;
  content.innerHTML = `<div class="section-header"><h1>${t("nav.outliers")}</h1></div><div id="scr02-body"></div>`;
  withState("SCR-02", el("scr02-body"), () => api.getStores(scopeParamsForRole()),
    (storesList) => {
      let list = storesList.filter(s => s.outlier);
      if (fs.region !== "all") list = list.filter(s => s.region === fs.region);
      list = applyQuickFilter(list, "SCR-02");
      const regions = [...new Set(storesList.map(s => s.region))];
      return `
        <div class="filter-bar"><div><label>${t("th.region")}</label><select onchange="filterState['SCR-02'].region=this.value; renderOutliers()">
          <option value="all">${t("filter.all")}</option>${regions.map(r => `<option value="${r}" ${fs.region === r ? "selected" : ""}>${r}</option>`).join("")}</select></div></div>
        ${renderStoreQuickFilters("SCR-02")}
        <div class="card">${renderSortableStoreTable(list, "SCR-02")}</div>`;
    });
}

// ================= SCR-03: Карточка магазина =================
function renderStoreCard(storeId) {
  // п.2: не дублировать контекст — для ДМ показываем только "Магазин №X", для ОД/РД — единственная
  // ступень пути (уровень + название магазина), без повторения одного и того же контекста дважды.
  renderTopbar(currentRole !== "dm" ? [{ label: scopeCrumb().label, route: "network" }, { label: `${t("scope.store")} ${storeId}` }] : [{ label: `${t("scope.store")} №${storeId}` }]);
  const content = el("content");
  content.innerHTML = `<div id="scr03-header"></div><div id="scr03-body"></div>`;
  withState("SCR-03", el("scr03-body"),
    async () => { const store = await api.getStore(storeId); const tasks = await api.getTasks(storeId); return { store, tasks }; },
    ({ store, tasks }) => {
      if (currentRole !== "dm") renderTopbar([{ label: scopeCrumb().label, route: "network" }, { label: `${store.number} «${store.name}»` }]);
      else renderTopbar([{ label: `${store.number} «${store.name}»` }]);
      el("scr03-header").innerHTML = `<div class="section-header"><h1>${store.number} «${store.name}» <span style="font-weight:400;color:var(--color-text-muted);font-size:14px">— ${store.region}, ${store.format} · ${t("th.director").toLowerCase()}: ${store.director_name}</span></h1></div>`;
      const s = store.settings;
      const scopeParams = { scope: "store", storeId: store.id };
      const scopeParamsAttr = JSON.stringify(scopeParams).replace(/"/g, "&quot;");
      return `
        <div class="grid grid-kpi">
          ${kpiCard({ label: t("kpi.availability"), value: store.availability_pct + "%", sub: t("kpi.norm_prefix") + s.availability_norm + "%",
            cls: kpiClassFor(store.availability_pct, s.availability_norm, "higher-better"), onClick: `openMetricChart(${scopeParamsAttr}, 'availability', '${t("kpi.availability")}')` })}
          ${kpiCard({ label: t("kpi.sco_share"), value: store.sco_share_pct + "%", sub: t("kpi.norm_prefix") + s.sco_share_norm + "%",
            cls: kpiClassFor(store.sco_share_pct, s.sco_share_norm, "higher-better"), onClick: `openMetricChart(${scopeParamsAttr}, 'sco_share', '${t("kpi.sco_share")}')` })}
          ${kpiCard({ label: t("kpi.sco_load"), value: store.sco_load_week + " " + t("unit.checks_week"), sub: t("kpi.norm_below_prefix") + s.sco_weekly_norm, cls: store.sco_load_week < s.sco_weekly_norm ? "kpi-info" : "kpi-good",
            onClick: `openMetricChart(${scopeParamsAttr}, 'sco_checks', '${t("kpi.sco_load")}')` })}
          ${kpiCard({ label: t("kpi.pos_load"), value: store.pos_load_week + " " + t("unit.checks_week"), sub: t("kpi.norm_below_prefix") + s.pos_weekly_norm, cls: store.pos_load_week > s.pos_upper_overload ? "kpi-bad" : "kpi-good",
            onClick: `openMetricChart(${scopeParamsAttr}, 'pos_checks', '${t("kpi.pos_load")}')` })}
        </div>
        <p style="color:var(--color-text-muted);font-size:12px">${t("store.drilldown_hint")}${periodLabel().toLowerCase()}.</p>
        <div class="section"><div class="section-header"><h2>${t("section.store_registers")}</h2></div><div class="card">
          <table><thead><tr><th>${t("th.register")}</th><th>${t("th.type")}</th><th>${t("th.state")}</th>
            <th class="mono">${t("th.p95_sec")} <span class="info-tip">i<span class="info-tip-bubble">${t("kpi.p95_tooltip")}</span></span></th><th class="mono">${t("th.utilization")}</th></tr></thead>
          <tbody>${store.registers.map(r => `<tr class="clickable-row" onclick="openRegisterHistory('${r.id}')"><td class="mono">${r.id}</td><td>${r.type}</td>
            <td>${statusBadge(r.status)}${r.status === "no_connection" && r.is_available ? ` <span class="badge badge-info">${t("reg.offline_available_badge")}</span>` : ""}</td>
            <td class="mono">${r.p95_seconds ?? "—"}</td><td class="mono">${r.utilization_pct}%</td></tr>
            ${r.note ? `<tr><td></td><td colspan="4" style="color:var(--color-text-muted);font-size:12px;padding-top:0">${r.note}</td></tr>` : ""}`).join("")}</tbody></table>
          <p style="color:var(--color-text-muted);font-size:12px;margin-top:8px">${t("store.register_click_hint")}</p>
        </div></div>
        <div class="section"><div class="section-header"><h2>${t("section.store_tasks")}</h2>${currentRole !== "dm" ? `<button class="btn btn-primary" onclick="openCreateTaskModal('${store.id}')">${t("action.create_task")}</button>` : ""}</div>
          <div class="card">${tasks.length ? tasks.map(taskRow).join("") : `<p style="color:var(--color-text-muted)">${t("store.no_active_tasks")}</p>`}</div></div>`;
    });
}
function taskRow(tk) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--color-border)">
    <div><div style="font-weight:600">${escapeHtml(tk.title)}</div><div style="font-size:12px;color:var(--color-text-muted)">${escapeHtml(tk.target_kpi)} · ${t("task.deadline")} ${formatDateTime(tk.due_at)} · ${t("task.assignee")}: ${escapeHtml(tk.assignee)}</div>
    <div class="task-elapsed">${t("task.in_progress_since")}: ${elapsedSince(tk.created_at)}</div></div>
    <span class="badge ${statusBadgeClass(tk.status)}">${statusLabel(tk.status)}</span></div>`;
}

// ================= SCR-04: Производительность =================
function renderPerformance() {
  renderTopbar([scopeCrumb(), { label: t("nav.performance") }]);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.performance")}</h1><button class="btn" onclick="toast(t('toast.export'))">${t("action.export")}</button></div><div id="scr04-body"></div>`;
  withState("SCR-04", el("scr04-body"),
    async () => { const list = await api.getStores(scopeParamsForRole()); const settings = await api.getSettings(regionForRole()); const details = await Promise.all(list.map(s => api.getStore(s.id))); return { details, settings }; },
    ({ details, settings }) => {
      const allRegs = details.flatMap(s => s.registers.map(r => ({ ...r, storeName: `${s.number} «${s.name}»` })));
      const byType = ["POS", "SCO"].map(type => {
        const regs = allRegs.filter(r => r.type === type && r.p95_seconds);
        const p95 = regs.length ? Math.max(...regs.map(r => r.p95_seconds)) : 0;
        return { type, p95, norm: settings.effective["p95_" + type.toLowerCase()], regs };
      });
      const problems = allRegs.filter(r => r.p95_seconds && r.p95_seconds > settings.effective["p95_" + r.type.toLowerCase()] * 1.05);
      return `
        <div class="grid grid-kpi">${byType.map(b => {
          const points = JSON.stringify(b.regs.map(r => ({ ts: r.id, value: r.p95_seconds }))).replace(/"/g, "&quot;");
          return kpiCard({ label: `p95 ${b.type}`, value: b.p95 + " " + t("unit.sec"), sub: t("kpi.norm_below_prefix") + b.norm + " " + t("unit.sec"), cls: kpiClassFor(b.norm, b.p95, "higher-better"), tooltip: t("kpi.p95_tooltip"),
            onClick: `openCategoryBarChart(${points}, 'p95 ${b.type}', ' ${t("unit.sec")}')` });
        }).join("")}</div>
        <div class="section"><div class="section-header"><h2>${t("section.problem_registers")}</h2></div>
          <div class="card"><table><thead><tr><th>${t("th.store")}</th><th>${t("th.register")}</th><th>${t("th.type")}</th><th class="mono">${t("th.p95_sec")}</th></tr></thead>
          <tbody>${problems.map(r => `<tr class="clickable-row" onclick="openRegisterHistory('${r.id}')"><td>${r.storeName}</td><td class="mono">${r.id}</td><td>${r.type}</td><td class="mono">${r.p95_seconds}</td></tr>`).join("") || `<tr><td colspan="4">${t("th.no_problem_registers")}</td></tr>`}</tbody></table></div></div>`;
    });
}

// ================= SCR-05: Потенциал SCO =================
function renderPotential() {
  renderTopbar([scopeCrumb(), { label: t("nav.potential") }]);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.potential")}</h1></div><div id="scr05-body"></div>`;
  withState("SCR-05", el("scr05-body"), () => api.getStores(scopeParamsForRole()),
    (storesList) => {
      const scoShare = avg(storesList.map(s => s.sco_share_pct));
      const potential = scoShare + avg(storesList.map(s => s.potential_sco_pct));
      // Экран по умолчанию показывает магазины по убыванию потенциала перетока (название секции
      // ниже) — задаем это как исходное состояние сортировки один раз, до первого клика пользователя.
      if (!sortState["SCR-05"]) sortState["SCR-05"] = { col: "potential_sco_pct", dir: -1 };
      const scopeParamsAttr = JSON.stringify(scopeParamsForRole()).replace(/"/g, "&quot;");
      const potentialRefAttr = JSON.stringify({ value: potential, label: `${t("kpi.sco_transfer_potential")} = ${potential.toFixed(0)}%` }).replace(/"/g, "&quot;");
      return `
        <div class="grid grid-kpi">
          ${kpiCard({ label: t("kpi.actual_sco_share"), value: scoShare.toFixed(0) + "%", cls: "kpi-info",
            onClick: `openMetricChart(${scopeParamsAttr}, 'sco_share', '${t("kpi.actual_sco_share")}')` })}
          ${kpiCard({ label: t("kpi.sco_transfer_potential"), value: potential.toFixed(0) + "%", sub: t("kpi.sco_transfer_sub"), cls: "kpi-warn",
            onClick: `openMetricChart(${scopeParamsAttr}, 'sco_share', '${t("kpi.sco_transfer_potential")}', ${potentialRefAttr})` })}
        </div>
        <div class="section"><div class="section-header"><h2>${t("section.pos_sco_ratio")}</h2></div><div class="card">
          <div class="stacked-bar"><span style="width:${100 - scoShare}%;background:var(--color-accent)"></span><span style="width:${scoShare}%;background:var(--color-green)"></span></div>
          <div class="legend"><span class="legend-item"><span class="swatch" style="background:var(--color-accent)"></span>POS ${(100 - scoShare).toFixed(0)}%</span>
          <span class="legend-item"><span class="swatch" style="background:var(--color-green)"></span>SCO ${scoShare.toFixed(0)}%</span></div></div></div>
        <div class="section"><div class="section-header"><h2>${t("section.stores_by_potential")}</h2></div>
          ${renderStoreQuickFilters("SCR-05")}
          <div class="card">${renderSortableStoreTable(applyQuickFilter(storesList, "SCR-05"), "SCR-05")}</div></div>`;
    });
}

// ================= SCR-06: Доступность (+ бывший SCR-10) =================
function renderAvailability() {
  renderTopbar([scopeCrumb(), { label: t("nav.availability") }]);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.availability")}</h1>
    <div class="topbar-tools"><button class="btn btn-sm" onclick="openCreateTicketModal()">${t("action.create_ticket")}</button>
    <button class="btn" onclick="toast(t('toast.export'))">${t("action.export")}</button></div></div><div id="scr06-body"></div>`;
  withState("SCR-06", el("scr06-body"),
    async () => { const list = await api.getStores(scopeParamsForRole()); const causes = await api.getTechnicalCauses(); return { list, causes }; },
    ({ list, causes }) => {
      const availability = avg(list.map(s => s.availability_pct));
      const scoCauses = causes.filter(c => c.applies_to !== "POS");
      const scoTotal = scoCauses.reduce((a, c) => a + c.hours, 0);
      const scopeParamsAttr = JSON.stringify(scopeParamsForRole()).replace(/"/g, "&quot;");
      return `
        <div class="grid grid-kpi">${kpiCard({ label: t("kpi.availability"), value: availability.toFixed(0) + "%", sub: t("kpi.norm_prefix") + "90%", cls: kpiClassFor(availability, 90, "higher-better"),
          onClick: `openMetricChart(${scopeParamsAttr}, 'availability', '${t("kpi.availability")}')` })}${kpiCard({ label: t("kpi.stores_below_norm"), value: list.filter(s => s.availability_pct < 90).length, cls: "kpi-warn" })}</div>
        <div class="section"><div class="section-header"><h2>${t("section.tech_causes_hours")}</h2></div><div class="card">${scoCauses.map(c => barRow(causeDisplayName(c.cause) + (c.note ? " ⓘ" : ""), c.hours, scoTotal)).join("")}</div></div>
        <div class="section"><div class="section-header"><h2>${t("section.top_availability_outliers")}</h2></div>
          <div class="card"><table><thead><tr><th>${t("th.store")}</th><th class="mono">${t("th.availability")}</th></tr></thead>
          <tbody>${[...list].sort((a, b) => a.availability_pct - b.availability_pct).slice(0, 5).map(s => `<tr class="clickable-row" onclick="nav('store/${s.id}')"><td>${s.number} «${s.name}»</td><td class="mono">${s.availability_pct}%</td></tr>`).join("")}</tbody></table></div></div>`;
    });
}

// ================= SCR-07: Утилизация =================
function renderUtilization() {
  renderTopbar([scopeCrumb(), { label: t("nav.utilization") }]);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.utilization")}</h1></div><div id="scr07-body"></div>`;
  withState("SCR-07", el("scr07-body"),
    async () => { const list = await api.getStores(scopeParamsForRole()); const details = await Promise.all(list.map(s => api.getStore(s.id))); return details; },
    (details) => {
      const allRegs = details.flatMap(s => s.registers.map(r => ({ ...r, storeName: `${s.number} «${s.name}»` })));
      const posRegs = allRegs.filter(r => r.type === "POS");
      const scoRegs = allRegs.filter(r => r.type === "SCO");
      const posUtil = avg(posRegs.map(r => r.utilization_pct));
      const scoUtil = avg(scoRegs.map(r => r.utilization_pct));
      const outliers = [...allRegs].sort((a, b) => a.utilization_pct - b.utilization_pct).slice(0, 5);
      const posPointsAttr = JSON.stringify(posRegs.map(r => ({ ts: r.id, value: r.utilization_pct }))).replace(/"/g, "&quot;");
      const scoPointsAttr = JSON.stringify(scoRegs.map(r => ({ ts: r.id, value: r.utilization_pct }))).replace(/"/g, "&quot;");
      return `
        <div class="scope-banner out-of-scope">${t("utilization.threshold_banner")}</div>
        <div class="grid grid-kpi">
          ${kpiCard({ label: t("kpi.utilization_pos"), value: posUtil.toFixed(0) + "%", cls: "kpi-info", onClick: `openCategoryBarChart(${posPointsAttr}, '${t("kpi.utilization_pos")}', '%')` })}
          ${kpiCard({ label: t("kpi.utilization_sco"), value: scoUtil.toFixed(0) + "%", cls: "kpi-info", onClick: `openCategoryBarChart(${scoPointsAttr}, '${t("kpi.utilization_sco")}', '%')` })}
        </div>
        <div class="section"><div class="section-header"><h2>${t("section.top_utilization_outliers")}</h2></div>
          <div class="card"><table><thead><tr><th>${t("th.store")}</th><th>${t("th.register")}</th><th>${t("th.type")}</th><th class="mono">${t("th.utilization")}</th></tr></thead>
          <tbody>${outliers.map(r => `<tr class="clickable-row" onclick="openRegisterHistory('${r.id}')"><td>${r.storeName}</td><td class="mono">${r.id}</td><td>${r.type}</td><td class="mono">${r.utilization_pct}%</td></tr>`).join("")}</tbody></table></div></div>`;
    });
}

// ================= SCR-09: Задачи (MVP1 теперь — п.13/19) =================
// tasksStoreFilter — массив storeId, если задачи открыты через плашку "Магазинов на контроле"
// на дашборде сети (п.7); null — показывать все задачи.
let tasksStoreFilter = null;
function openAttentionTasks(storeIds) { tasksStoreFilter = storeIds; nav("tasks"); }
function renderTasks() {
  renderTopbar([scopeCrumb(), { label: t("nav.tasks") }]);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.tasks")}</h1>
    ${currentRole !== "dm" ? `<button class="btn btn-primary" onclick="openCreateTaskModal(null)">${t("action.create_task")}</button>` : ""}</div>
    ${tasksStoreFilter ? `<div class="scope-banner mvp2">${t("task.attention_banner")} (${tasksStoreFilter.length}). <a onclick="tasksStoreFilter=null; renderTasks()">${t("action.show_all")}</a></div>` : ""}
    <div id="scr09-body"></div>`;
  withState("SCR-09", el("scr09-body"), () => api.getTasks(),
    (tasksList) => {
      const list = tasksStoreFilter ? tasksList.filter(tk => tasksStoreFilter.includes(tk.store_id)) : tasksList;
      const cols = [["new", "task.status.new"], ["in_progress", "task.status.in_progress"], ["done", "task.status.done"]];
      return `<div class="kanban">${cols.map(([status, labelKey]) => `
        <div class="kanban-col" data-status="${status}"><div class="kanban-col-title"><span>${t(labelKey)}</span><span>${list.filter(x => x.status === status).length}</span></div>
        ${list.filter(x => x.status === status).map(taskCard).join("")}</div>`).join("")}</div>`;
    });
}
function taskCard(tk) {
  return `<div class="task-card" draggable="true" data-id="${tk.id}"><div class="task-title">${escapeHtml(tk.title)}</div>
    <div class="task-meta"><span>${t("task.store_label")} ${tk.store_id}</span><span>${t("task.deadline")}: ${formatDateTimeShort(tk.due_at)}</span></div>
    <div class="task-meta"><span>${escapeHtml(tk.assignee)}</span></div>
    <div class="task-elapsed">${t("task.waiting_since")}: ${elapsedSince(tk.created_at)}</div>
    ${tk.escalated ? `<div class="task-escalated">${t("task.escalated_to")}: ${tk.escalated_to}</div>` : ""}
    <div style="margin-top:8px;display:flex;gap:6px">
      ${tk.status !== "done" ? `<button class="btn btn-sm" onclick="advanceTask('${tk.id}', '${tk.status}')">${t("action.complete")}</button>` : ""}
      ${tk.status !== "done" ? `<button class="btn btn-sm" onclick="escalateTask('${tk.id}')">${t("action.escalate")}</button>` : ""}</div></div>`;
}
function statusLabel(s) { return { new: t("task.status.new"), in_progress: t("task.status.in_progress"), done: t("task.status.done") }[s]; }
function statusBadgeClass(s) { return { new: "badge-info", in_progress: "badge-warn", done: "badge-ok" }[s]; }
async function advanceTask(id, currentStatus) {
  const next = currentStatus === "new" ? "in_progress" : "done";
  try { await api.updateTaskStatus(id, next); toast(next === "done" ? t("toast.task_done") : t("toast.task_in_progress")); renderTasks(); }
  catch (e) { toast(t("toast.error_prefix") + e.message); }
}
async function escalateTask(id) {
  try { const tk = await api.escalateTask(id); toast(t("toast.task_escalated") + ": " + tk.escalated_to); renderTasks(); }
  catch (e) { toast(t("toast.error_prefix") + e.message); }
}
function initKanbanDnD() {
  document.querySelectorAll(".task-card").forEach(card => card.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", card.dataset.id)));
  document.querySelectorAll(".kanban-col").forEach(col => {
    col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async e => {
      e.preventDefault(); col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      try { await api.updateTaskStatus(id, col.dataset.status); renderTasks(); } catch (err) { toast(t("toast.error_prefix") + err.message); }
    });
  });
}
const _origRenderTasks = renderTasks;
renderTasks = function () { _origRenderTasks(); setTimeout(initKanbanDnD, 50); };

// --- Создание задачи: переработанная форма (п.15) + исправлен баг (п.16) ---
let taskFormStores = null;
async function openCreateTaskModal(storeId) {
  if (!taskFormStores) taskFormStores = await api.getStores({});
  const preselected = storeId || taskFormStores[0].id;
  const store = taskFormStores.find(s => s.id === preselected);
  const registers = store ? (await api.getStore(store.id)).registers : [];
  const nowPlus = m => new Date(Date.now() + m * 60000).toISOString().slice(0, 16);
  openOverlay(`<div class="modal modal-wide">
    <div class="modal-header"><h2>${t("action.create_task")}</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <form id="task-form" onsubmit="return submitTaskForm(event)">
      <div class="field-row-2">
        <div class="field"><label>${t("task.form.store")}</label><select id="tf-store" onchange="onTaskFormStoreChange()">
          ${taskFormStores.map(s => `<option value="${s.id}" ${s.id === preselected ? "selected" : ""}>${s.number} «${s.name}»</option>`).join("")}</select></div>
        <div class="field"><label>${t("task.form.register")}</label><select id="tf-register"><option value="">${t("task.form.register_none")}</option>
          ${registers.map(r => `<option value="${r.id}">${r.id} (${r.type})</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>${t("task.form.assignee")}</label><input type="text" id="tf-assignee" value="${store ? store.director_name + " (директор магазина " + store.number + ")" : ""}" readonly style="background:var(--color-bg)"></div>
      <div class="field"><label>${t("task.form.title")}</label><input type="text" id="tf-title" placeholder="${t("task.form.title_placeholder")}"></div>
      <div class="field"><label>${t("task.form.kpi")}</label><input type="text" id="tf-kpi" placeholder="${t("task.form.kpi_placeholder")}">
        <div class="form-help">${t("task.form.kpi_help")}</div></div>
      <div class="field"><label>${t("task.form.due")}</label><input type="datetime-local" id="tf-due" value="${nowPlus(60)}">
        <div class="quick-time-btns"><button type="button" onclick="setTaskDueQuick(5)">${t("task.form.quick5")}</button><button type="button" onclick="setTaskDueQuick(30)">${t("task.form.quick30")}</button><button type="button" onclick="setTaskDueQuick(60)">${t("task.form.quick60")}</button></div></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn" onclick="closeOverlay()">${t("action.cancel")}</button>
        <button type="submit" class="btn btn-primary">${t("action.save")}</button></div>
    </form></div>`);
}
async function onTaskFormStoreChange() {
  const storeId = el("tf-store").value;
  const store = taskFormStores.find(s => s.id === storeId);
  el("tf-assignee").value = store ? `${store.director_name} (директор магазина ${store.number})` : "";
  const detail = await api.getStore(storeId);
  el("tf-register").innerHTML = `<option value="">${t("task.form.register_none")}</option>${detail.registers.map(r => `<option value="${r.id}">${r.id} (${r.type})</option>`).join("")}`;
}
function setTaskDueQuick(minutes) { el("tf-due").value = new Date(Date.now() + minutes * 60000).toISOString().slice(0, 16); }
async function submitTaskForm(e) {
  e.preventDefault();
  const title = el("tf-title").value.trim();
  const storeId = el("tf-store").value; // п.16: значения читаем ДО closeOverlay(), а не после
  const field = el("tf-title").closest(".field");
  try {
    await api.createTask({
      title, storeId, registerId: el("tf-register").value || null, targetKpi: el("tf-kpi").value,
      dueAt: new Date(el("tf-due").value).toISOString(), createdBy: t("role." + currentRole), assignee: el("tf-assignee").value
    });
    field.classList.remove("has-error");
    closeOverlay(); toast(t("toast.task_created"));
    if (currentRoute().startsWith("tasks")) renderTasks(); else renderStoreCard(storeId);
  } catch (err) {
    field.classList.add("has-error");
    if (!field.querySelector(".field-error")) field.insertAdjacentHTML("beforeend", `<div class="field-error">${escapeHtml(err.message)}</div>`);
  }
  return false;
}
function openCreateTicketModal() {
  openOverlay(`<div class="modal"><div class="modal-header"><h2>${t("action.create_ticket")}</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <div class="field"><label>${t("ticket.register")}</label><input type="text" id="ticket-reg" placeholder="${t("ticket.register_placeholder")}"></div>
    <div class="field"><label>${t("ticket.description")}</label><textarea id="ticket-desc" rows="3" placeholder="${t("ticket.description_placeholder")}"></textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn" onclick="closeOverlay()">${t("action.cancel")}</button>
      <button class="btn btn-primary" onclick="submitTicket()">${t("action.save")}</button></div></div>`);
}
async function submitTicket() {
  try { await api.createTicket({ registerId: el("ticket-reg").value, description: el("ticket-desc").value }); closeOverlay(); toast(t("toast.ticket_created")); }
  catch (e) { toast(t("toast.error_prefix") + e.message); }
}

// ================= SCR-11 =================
function renderDiagnostics() {
  renderTopbar([{ label: t("nav.diagnostics") }]);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.diagnostics")}</h1></div>
    <div class="scope-banner out-of-scope">${t("diag.full_access_banner")}</div>
    <div class="filter-bar"><div><label>${t("diag.search_label")}</label><input type="text" id="diag-search" oninput="renderDiagnostics()" value="${filterState.diag || ""}"></div></div><div id="scr11-body"></div>`;
  const search = el("diag-search") ? el("diag-search").value : "";
  filterState.diag = search;
  withState("SCR-11", el("scr11-body"), () => api.getDiagnostics(search),
    (rows) => `<div class="card"><table><thead><tr><th>${t("th.store")}</th><th>${t("th.register")}</th><th>${t("th.state")}</th><th class="mono">${t("th.revenue_week")}</th><th class="mono">${t("th.sco_share")}</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="clickable-row" onclick="openRegisterHistory('${r.id}')"><td>${r.store_label}</td><td class="mono">${r.id}</td><td>${statusBadge(r.status)}</td><td class="mono">${r.revenue_week.toLocaleString(dateLocale())} ₽</td><td class="mono">${r.sco_share_pct}%</td></tr>`).join("")}</tbody></table></div>`);
}

// ================= SCR-12 =================
function renderProductAnalytics() {
  renderTopbar([{ label: t("nav.product_analytics") }]);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.product_analytics")}</h1></div><div id="scr12-body"></div>`;
  withState("SCR-12", el("scr12-body"), () => api.getUsage(),
    (usage) => { const max = Math.max(...usage.map(u => u.opens)); return `<div class="card">${usage.map(u => barRow(usageReportLabel(u.report), u.opens, max)).join("")}</div>`; });
}
// Названия отчетов приходят из БД (usage_stats, посев) на русском — сопоставляем с уже
// существующими ключами навигации, где это возможно.
const USAGE_REPORT_KEY_BY_RU = {
  "Дашборд сети": "nav.network", "Аутсайдеры": "nav.outliers", "Доступность касс": "nav.availability",
  "Задачи": "nav.tasks", "Утилизация ресурсов": "nav.utilization", "ИИ-консультант": "nav.advisor"
};
function usageReportLabel(reportRu) { const key = USAGE_REPORT_KEY_BY_RU[reportRu]; return key ? t(key) : reportRu; }

// ================= SCR-13 =================
// Не переведено (см. примечание в i18n.js): вопросы и сценарные ответы сопоставляются backend'ом
// (misc.js, SCRIPTED_ANSWERS) по точной строке — перевод сломал бы сопоставление.
const ADVISOR_SUGGESTIONS = ["Что сегодня мешает эффективности магазина?", "Почему выросли очереди?", "Почему доля КСО ниже ожидаемой?"];
let chatMessages = [];
function renderAdvisor() {
  renderTopbar([{ label: t("nav.advisor") }]);
  el("content").innerHTML = `<div class="section-header"><h1>${t("nav.advisor")}</h1></div>
    <div class="scope-banner mvp2">${t("advisor.roadmap_banner")}</div>
    <div class="chat-panel card">
      <div class="chat-suggestions">${ADVISOR_SUGGESTIONS.map(q => `<button onclick="askAdvisor('${q.replace(/'/g, "\\'")}')">${q}</button>`).join("")}</div>
      <div class="chat-messages" id="chat-messages">${chatMessages.map(chatBubble).join("") || `<p style="color:var(--color-text-muted)">${t("advisor.example_hint", { example: ADVISOR_SUGGESTIONS[0] })}</p>`}</div>
      <div class="chat-input-row"><input type="text" id="chat-input" placeholder="${t("advisor.placeholder")}" onkeydown="if(event.key==='Enter') askAdvisorFromInput()">
        <button class="btn btn-primary" onclick="askAdvisorFromInput()">${t("action.send")}</button></div></div>`;
}
function chatBubble(m) {
  if (m.role === "user") return `<div class="chat-msg user">${escapeHtml(m.text)}</div>`;
  const a = m.text;
  return `<div class="chat-msg assistant"><p><strong>${a.conclusion}</strong></p>${a.facts.map(f => `<div class="fact-card">• ${f}</div>`).join("")}
    <p style="margin-top:8px">${t("advisor.hypothesis")} <strong>${a.hypothesis.name}</strong> (${t("advisor.confidence")} ${(a.hypothesis.confidence * 100).toFixed(0)}%)</p>
    ${a.recommendations.length ? `<p>${t("advisor.recommendations")}</p><ul>${a.recommendations.map(r => `<li>${r}</li>`).join("")}</ul>` : ""}
    <p><a onclick="nav('store/404')">${t("advisor.open_store_example")}</a></p></div>`;
}
function askAdvisorFromInput() { askAdvisor(el("chat-input").value); }
async function askAdvisor(question) {
  if (!question || !question.trim()) return;
  chatMessages.push({ role: "user", text: question });
  try { const answer = await api.askAdvisor(question); chatMessages.push({ role: "assistant", text: answer }); }
  catch (e) { chatMessages.push({ role: "assistant", text: { conclusion: t("advisor.request_error"), facts: [e.message], hypothesis: { name: "—", confidence: 0 }, recommendations: [] } }); }
  renderAdvisor();
  setTimeout(() => { const box = el("chat-messages"); if (box) box.scrollTop = box.scrollHeight; }, 0);
}

// ---------- Инициализация ----------
window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
  if (!location.hash) location.hash = currentRole === "dm" ? `#/store/${DM_STORE_ID}` : "#/network";
  render();
});
