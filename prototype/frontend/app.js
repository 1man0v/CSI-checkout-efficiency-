/* Прототип «Set — Эффективность зоны расчета». Обновлено 2026-07-22 по замечаниям к прототипу
   (нумерация комментариев соответствует пунктам замечаний пользователя). */

let currentRole = localStorage.getItem("set_role") || "od";
// Обновлено 2026-09-13: роли РД/ДМ теперь зафиксированы на магазине/регионе из реального набора
// данных (см. prototype/backend/seed-data/), а не на прежних синтетических "Москва-Восток"/№404.
const RD_REGION = "Регион 3";
const DM_STORE_ID = "531";
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
// direction: "higher-better" (по умолчанию, рост = хорошо, зеленый) или "lower-better" (для метрик
// вроде "количество аутсайдеров", где снижение — хорошая новость и должно быть зеленым, а не
// красным просто потому что число уменьшилось). Стрелка всегда показывает фактическое направление
// изменения — меняется только цвет. decimals — знаков после запятой (по умолчанию 1; 0 для
// счетчиков штук вроде "количество касс", где дробное значение вида "+0.6 кассы" не имеет смысла).
function trendArrow(delta, unit, direction, decimals) {
  const dp = decimals == null ? 1 : decimals;
  const suffix = unit ? ` ${unit}` : "";
  if (delta == null || Math.abs(delta) < 0.05) return `<span class="kpi-trend">→ 0${suffix}</span>`;
  const isGood = direction === "lower-better" ? delta < 0 : delta > 0;
  const cls = isGood ? "trend-up" : "trend-down";
  const arrow = delta > 0 ? "↑" : "↓";
  return `<span class="kpi-trend ${cls}">${arrow} ${Math.abs(delta).toFixed(dp)}${suffix}</span>`;
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
// Сумма экономии форматируется с символом валюты из ключей локализации (currency.<код>),
// а не хардкодится — валюта задается в настройках (SCR-08).
function formatCurrency(amount, code) {
  return `${Math.round(amount).toLocaleString("ru-RU")} ${t("currency." + code)}`;
}
// Большая плашка ОД: одна широкая карточка с несколькими под-метриками внутри (количество
// магазинов/POS/КСО/аутсайдеров) — вместо нескольких мелких плашек, каждая со своей динамикой
// за выбранный период vs предыдущий период той же длины.
function bigInfoTile(items) {
  return `<div class="card kpi-card-big"><div class="kpi-big-grid">
    ${items.map(it => `<div class="kpi-big-item ${it.onClick ? "clickable" : ""}" ${it.onClick ? `onclick="${it.onClick}"` : ""}>
      <div class="kpi-label">${it.label}</div>
      <div class="kpi-value mono">${it.value}${it.trend != null ? trendArrow(it.trend, it.trendUnit || "", it.trendDirection, it.trendDecimals) : ""}</div>
      ${it.sub ? `<div class="kpi-delta">${it.sub}</div>` : ""}
    </div>`).join("")}
  </div></div>`;
}
// Плашка "рейтинг" (региона у РД, магазина у ДМ) — три вертикальные строки: лидер, "вы" (текущее
// место), "догоняющий" (следующий за вами по рейтингу). rankInfo: {leader, mine, chaser}, каждый —
// {name, rank, availability_pct, utilization_pct, sco_share_pct} или null (chaser отсутствует, если
// вы уже последние). Кликабельна — открывает полный рейтинг (openRankingTable).
function rankingTileHtml(title, rankInfo, onClick) {
  if (!rankInfo || !rankInfo.mine) return "";
  const { leader, mine, chaser } = rankInfo;
  const row = (badgeKey, entry, isMine) => entry ? `<div class="rank-row ${isMine ? "rank-row-mine" : ""}">
    <span class="rank-badge">${t(badgeKey)}</span><span class="rank-name">${escapeHtml(entry.name)}</span><span class="rank-place mono">#${entry.rank}</span>
    <div class="rank-metrics">${t("th.availability")} ${entry.availability_pct}% · ${t("kpi.utilization_generic")} ${entry.utilization_pct}% · ${t("th.sco_share")} ${entry.sco_share_pct}%</div>
  </div>` : "";
  return `<div class="card kpi-card rank-tile ${onClick ? "clickable" : ""}" ${onClick ? `onclick="${onClick}"` : ""}>
    <div class="kpi-label">${title}</div>
    ${row("rank.leader", leader, leader && mine && leader.name === mine.name)}
    ${leader && mine && leader.name === mine.name ? "" : row("rank.current", mine, true)}
    ${row("rank.chaser", chaser, false)}
  </div>`;
}
function openRankingTable(rows, title, nameLabel) {
  openOverlay(`<div class="drawer drawer-wide">
    <div class="drawer-header"><h2>${title}</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <div class="card"><table><thead><tr><th class="mono">#</th><th>${nameLabel}</th><th class="mono">${t("th.availability")}</th><th class="mono">${t("kpi.utilization_generic")}</th><th class="mono">${t("th.sco_share")}</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td class="mono">${r.rank}</td><td>${escapeHtml(r.name)}</td><td class="mono">${r.availability_pct}%</td><td class="mono">${r.utilization_pct}%</td><td class="mono">${r.sco_share_pct}%</td></tr>`).join("")}</tbody></table></div>
  </div>`, "drawer");
}
const REGISTER_BADGES = {
  available: "ok", occupied: "ok", blocked_by_staff: "warn", no_paper: "bad", bank_error: "bad",
  scale_error: "bad", scanner_error: "bad", printer_error: "bad", service_mode: "warn", no_connection: "info",
  off: "bad", unknown: "warn"
};
function registerLabel(status) { return t("reg." + status) !== "reg." + status ? t("reg." + status) : t("reg.unknown"); }
function statusBadge(status) { const badge = REGISTER_BADGES[status] || REGISTER_BADGES.unknown; return `<span class="status-dot ${badge}"></span>${registerLabel(status)}`; }
// Касса без телеметрии дольше 30 дней (r.is_stale, см. rules.js isRegisterStale) — отдельное от
// статуса понятие: числится в реестре кассового сервера, но фактически не в эксплуатации. Везде,
// где показывается статус кассы, такая касса помечается серой плашкой "Офлайн N дней" вместо
// обычного статуса — независимо от того, что там записано в last-known status.
function registerStatusBadge(r) {
  if (r && r.is_stale) return `<span class="status-dot stale"></span>${t("reg.stale", { days: r.stale_days })}`;
  return statusBadge(r ? r.status : r);
}
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
// Компактный вид (уменьшенные отступы/высота полосы) — плашки "Информация КСО"/"Информация POS"
// занимали слишком много места на экране.
function barRow(label, value, total) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return `<div style="margin-bottom:5px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span>${label}</span><span class="mono">${value} ${t("unit.hours")}</span></div>
    <div style="background:var(--color-bg);border-radius:3px;height:5px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--color-accent)"></div></div></div>`;
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
// европейским форматом дат (dd.mm.yyyy) везде, включая ярлык периода и подсказки календаря.
// Универсальный "ctx"-выбор периода: одна и та же реализация обслуживает и топбар (влияет на весь
// экран через periodState), и drill-down графики (замечание: "хочу менять даты на графиках тоже
// по интерактивному календарю, но если я менял и закрыл — не влияю на основные даты экрана").
// ctx.getState/setState указывают, ГДЕ хранится состояние периода, ctx.onApply — что сделать после
// применения; для графика это локальная переменная и точечное обновление только тела графика, а не
// вызов общего render(), поэтому изменения в drawer'е никогда не просачиваются в periodState экрана. ---
const periodPickerCtx = {};
function definePeriodPicker(ctxId, { getState, setState, scopeParams, onApply }) {
  periodPickerCtx[ctxId] = { getState, setState, scopeParams, onApply, month: new Date(), rangeStart: null, dailyCache: null, outsideClickHandler: null };
}
function ppLabel(ctxId) {
  const st = periodPickerCtx[ctxId].getState();
  if (st.mode === "custom") return st.customLabel;
  const key = { realtime: "action.realtime", "7d": "action.last7d", "30d": "action.last30d" }[st.mode] || "action.last7d";
  return t(key);
}
function togglePeriodPanel(ctxId) {
  const panel = el(`period-panel-${ctxId}`);
  if (panel) { panel.remove(); return; }
  openPeriodPanel(ctxId);
}
async function openPeriodPanel(ctxId) {
  const ctx = periodPickerCtx[ctxId];
  ctx.rangeStart = null;
  const host = el(`period-picker-host-${ctxId}`);
  if (!host) return;
  const div = document.createElement("div");
  div.className = "period-panel"; div.id = `period-panel-${ctxId}`;
  div.innerHTML = `<div class="period-presets">
      <button onclick="applyPeriodPreset('${ctxId}','realtime')">${t("action.realtime")}</button>
      <button onclick="applyPeriodPreset('${ctxId}','7d')">${t("action.last7d")}</button>
      <button onclick="applyPeriodPreset('${ctxId}','30d')">${t("action.last30d")}</button>
    </div>
    <div id="period-calendar-${ctxId}"></div>
    <div class="form-help" id="period-range-hint-${ctxId}"></div>
    <div class="period-actions"><button class="btn btn-sm" onclick="closePeriodPanel('${ctxId}')">${t("action.close")}</button></div>`;
  host.appendChild(div);
  await renderPeriodCalendar(ctxId);
  const handler = e => periodOutsideClick(ctxId, e);
  ctx.outsideClickHandler = handler;
  setTimeout(() => document.addEventListener("click", handler), 0);
}
function periodOutsideClick(ctxId, e) {
  const panel = el(`period-panel-${ctxId}`); const btn = el(`period-btn-${ctxId}`);
  if (panel && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePeriodPanel(ctxId);
}
function closePeriodPanel(ctxId) {
  const ctx = periodPickerCtx[ctxId];
  const p = el(`period-panel-${ctxId}`); if (p) p.remove();
  if (ctx) {
    ctx.rangeStart = null;
    if (ctx.outsideClickHandler) { document.removeEventListener("click", ctx.outsideClickHandler); ctx.outsideClickHandler = null; }
  }
}
function applyPeriodPreset(ctxId, preset) {
  const ctx = periodPickerCtx[ctxId];
  const map = { realtime: { days: 1 }, "7d": { days: 7 }, "30d": { days: 30 } };
  ctx.setState({ mode: preset, ...map[preset] });
  closePeriodPanel(ctxId);
  ctx.onApply();
}
async function renderPeriodCalendar(ctxId) {
  const ctx = periodPickerCtx[ctxId];
  const host = el(`period-calendar-${ctxId}`);
  if (!host) return;
  const month = ctx.month;
  const year = month.getFullYear(), mon = month.getMonth();
  const first = new Date(year, mon, 1);
  const startOffset = (first.getDay() + 6) % 7; // понедельник — первый день недели
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  if (!ctx.dailyCache) {
    try { ctx.dailyCache = await api.getDailySeries({ ...(ctx.scopeParams || { scope: "network" }), days: 60 }); } catch (e) { ctx.dailyCache = []; }
  }
  const byDate = new Map(ctx.dailyCache.map(d => [d.date, d]));
  const monthLabel = month.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
  const weekdays = ["weekday.mon", "weekday.tue", "weekday.wed", "weekday.thu", "weekday.fri", "weekday.sat", "weekday.sun"];
  let cells = `<div class="period-calendar-header"><button onclick="changePeriodMonth(event,'${ctxId}',-1)">←</button><span>${monthLabel}</span><button onclick="changePeriodMonth(event,'${ctxId}',1)">→</button></div>
    <div class="period-calendar-grid">${weekdays.map(k => `<div class="dow">${t(k)}</div>`).join("")}`;
  for (let i = 0; i < startOffset; i++) cells += `<div class="period-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const info = byDate.get(dateStr);
    const dotColor = info ? (info.availability_pct >= 90 ? "var(--color-green)" : info.availability_pct >= 80 ? "var(--color-yellow)" : "var(--color-red)") : "transparent";
    const tooltip = info ? `${t("period.availability")}: ${info.availability_pct}%, ${t("period.sco_share")}: ${info.sco_share_pct}%` : t("period.no_data");
    const isEdge = ctx.rangeStart === dateStr;
    cells += `<div class="period-day ${isEdge ? "range-edge" : ""}" onmouseenter="showDayTooltip(event,'${dateStr}','${tooltip}')" onmouseleave="hideDayTooltip()" onclick="selectPeriodDate(event,'${ctxId}','${dateStr}')">
      ${d}<span class="dot" style="background:${dotColor}"></span></div>`;
  }
  cells += `</div>`;
  host.innerHTML = cells;
  const hint = el(`period-range-hint-${ctxId}`);
  if (hint) hint.textContent = ctx.rangeStart ? t("period.hint.picked_start", { date: formatDateShort(ctx.rangeStart) }) : t("period.hint.start");
}
// event.stopPropagation() необходим: клик пересоздает DOM ячеек/шапки календаря синхронно внутри
// обработчика, из-за чего исходный e.target отсоединяется от документа ДО того, как событие
// всплывет до document-обработчика periodOutsideClick — тот видит panel.contains(detached)===false
// и закрывает панель, как будто клик был снаружи. Без остановки всплытия календарь схлопывался бы
// при каждом клике по дню/стрелке месяца.
function changePeriodMonth(event, ctxId, delta) {
  event.stopPropagation();
  const ctx = periodPickerCtx[ctxId];
  ctx.month = new Date(ctx.month.getFullYear(), ctx.month.getMonth() + delta, 1);
  renderPeriodCalendar(ctxId);
}
function showDayTooltip(e, dateStr, text) {
  hideDayTooltip();
  const bubble = document.createElement("div");
  bubble.className = "period-day-tooltip"; bubble.id = "day-tooltip"; bubble.textContent = text;
  e.currentTarget.appendChild(bubble);
}
function hideDayTooltip() { const b = el("day-tooltip"); if (b) b.remove(); }
function selectPeriodDate(event, ctxId, dateStr) {
  event.stopPropagation();
  const ctx = periodPickerCtx[ctxId];
  if (!ctx.rangeStart) { ctx.rangeStart = dateStr; renderPeriodCalendar(ctxId); return; }
  let from = ctx.rangeStart, to = dateStr;
  if (from > to) [from, to] = [to, from];
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
  ctx.setState({ mode: "custom", customLabel: `${formatDateShort(from)}–${formatDateShort(to)}`, days, from, to });
  ctx.rangeStart = null;
  closePeriodPanel(ctxId);
  ctx.onApply();
}
// Топбар всегда влияет на весь экран: getState/setState читают и пишут напрямую в periodState,
// onApply вызывает общий render(). Для drill-down графиков контекст создается отдельно на каждое
// открытие (см. openMetricChart) с локальной переменной вместо periodState.
definePeriodPicker("topbar", {
  getState: () => periodState,
  setState: s => { periodState = s; },
  scopeParams: { scope: "network" },
  onApply: () => render()
});

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
// --- Плашка "график потоков по часам" (карточка магазина): столбчатая сложенная диаграмма
// (POS снизу, КСО сверху) + линия тренда (скользящее среднее по 3 точкам суммы POS+КСО) + порог
// перегрузки (70% часового норматива чеков, business-rules-and-formulas.md "15. График потоков по
// часам и порог перегрузки"). Отдельная функция, а не renderChart: renderChart не поддерживает
// две сложенные столбчатые серии + линию одновременно (для kind:"bar" линия тренда сознательно
// отключена в refreshMetricChart, см. комментарий там). ---
function renderHourlyLoadChart(points, overloadThreshold) {
  if (!points || !points.length) return `<p style="color:var(--color-text-muted)">${t("chart.no_data")}</p>`;
  const totals = points.map(p => p.pos_checks + p.sco_checks);
  const dataMax = Math.max(...totals, overloadThreshold, 1);
  const ticks = niceTicks(0, dataMax, 4);
  const max = ticks[ticks.length - 1];
  const width = 680, height = 240, padL = 46, padB = 26, padT = 12, padR = 14;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const xFor = i => padL + (plotW / points.length) * (i + 0.5);
  const yFor = v => padT + plotH - (v / (max || 1)) * plotH;
  const barW = Math.max(2, (plotW / points.length) * 0.6);

  const trend = totals.map((v, i) => {
    const w = totals.slice(Math.max(0, i - 2), i + 3);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  const linePath = trend.map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");

  const yGrid = ticks.map(v => `
    <line x1="${padL}" y1="${yFor(v).toFixed(1)}" x2="${width - padR}" y2="${yFor(v).toFixed(1)}" stroke="var(--color-text-muted)" stroke-opacity="0.3" />
    <text x="${padL - 6}" y="${(yFor(v) + 3).toFixed(1)}" font-size="10" fill="var(--color-text-muted)" text-anchor="end">${v}</text>`).join("");
  const maxLabels = Math.max(2, Math.floor(plotW / 40));
  const step = Math.max(1, Math.ceil(points.length / maxLabels));
  const labelIdxs = [];
  for (let i = 0; i < points.length; i += step) labelIdxs.push(i);
  if (labelIdxs[labelIdxs.length - 1] !== points.length - 1) labelIdxs.push(points.length - 1);
  const xLabels = labelIdxs.map(i => `<text x="${xFor(i).toFixed(1)}" y="${height - 6}" font-size="9" fill="var(--color-text-muted)" text-anchor="middle">${String(points[i].hour).padStart(2, "0")}:00</text>`).join("");

  const bars = points.map((p, i) => {
    const x = xFor(i) - barW / 2;
    const yPos = yFor(p.pos_checks);
    const ySco = yFor(p.pos_checks + p.sco_checks);
    return `<rect x="${x.toFixed(1)}" y="${yPos.toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + plotH - yPos).toFixed(1)}" fill="var(--color-accent)" rx="1.5" />
      <rect x="${x.toFixed(1)}" y="${ySco.toFixed(1)}" width="${barW.toFixed(1)}" height="${(yPos - ySco).toFixed(1)}" fill="var(--color-blue)" rx="1.5" />`;
  }).join("");

  const overloadY = yFor(overloadThreshold);
  const overloadHours = points.filter((p, i) => totals[i] > overloadThreshold).map(p => `${String(p.hour).padStart(2, "0")}:00`);

  return `<div class="chart-svg-wrap"><svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px">
    ${yGrid}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="var(--color-border)" />
    <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" stroke="var(--color-border)" />
    <line x1="${padL}" y1="${overloadY.toFixed(1)}" x2="${width - padR}" y2="${overloadY.toFixed(1)}" stroke="var(--color-yellow)" stroke-dasharray="4 3" />
    ${bars}
    <path d="${linePath}" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5" stroke-dasharray="5 3" />
    ${xLabels}
  </svg></div>
  <div class="chart-legend-row">
    <span class="legend-item"><span class="swatch" style="background:var(--color-accent)"></span>${t("chart.legend_pos")}</span>
    <span class="legend-item"><span class="swatch" style="background:var(--color-blue)"></span>${t("chart.legend_sco")}</span>
    <span class="legend-item"><span class="swatch-line" style="background:var(--color-text-muted)"></span>${t("chart.trend_ma")}</span>
    <span class="legend-item"><span class="swatch-line" style="background:var(--color-yellow)"></span>${t("chart.legend_overload")}</span>
  </div>
  <p style="font-size:12px;color:var(--color-text-muted);margin-top:6px">${overloadHours.length ? t("chart.hourly_load_overload_note") + " " + overloadHours.join(", ") : t("chart.hourly_load_no_overload")}</p>`;
}
function formatHourLabel(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2, "0") + ":00 " + String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0"); }
function formatDayLabel(ts) { const d = new Date(ts); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0"); }
function formatWeekLabel(ts) { return t("chart.week_prefix") + " " + formatDayLabel(ts); }

// --- Динамическая гранулярность оси времени по выбранному периоду: день -> часы, неделя -> дни,
// месяц и более -> недели. Принимает конкретное состояние периода (а не всегда глобальный
// periodState), т.к. у drill-down графика может быть свой локальный период. ---
function chartGranularity(state) {
  const days = state.days || 7;
  if (state.mode === "realtime" || days <= 1) return "hour";
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
const METRIC_AGG = { availability: "avg", sco_share: "avg", pos_availability: "avg", sco_checks: "sum", pos_checks: "sum",
  store_count: "avg", pos_count: "avg", sco_count: "avg", outlier_count: "avg" };
const BAR_METRICS = new Set(["sco_checks", "pos_checks"]); // столбцы для счетчиков-сумм (нагрузка), не для уровней/счетов
const NO_SUFFIX_METRICS = new Set(["sco_checks", "pos_checks", "store_count", "pos_count", "sco_count", "outlier_count"]);
// Плашка "большая — общая информация" (замечание: количество магазинов/POS/КСО/аутсайдеров): эти
// метрики не хранятся в daily_summary (проценты/чеки), а считаются отдельным эндпоинтом
// /api/analytics/counts по датам регистрации на кассовом сервере — см. countsSeries в analytics.js.
const COUNTS_FAMILY_METRICS = new Set(["store_count", "pos_count", "sco_count", "outlier_count"]);
function metricKind(metric) { return BAR_METRICS.has(metric) ? "bar" : "line"; }
function metricUnit(metric) { return NO_SUFFIX_METRICS.has(metric) ? "" : "%"; }

async function fetchMetricChartData(scopeParams, metric, state) {
  // Количество магазинов/касс не имеет смысла по часам — не бывает "часовой" гранулярности ниже дня.
  const granularity = COUNTS_FAMILY_METRICS.has(metric) && chartGranularity(state) === "hour" ? "day" : chartGranularity(state);
  if (COUNTS_FAMILY_METRICS.has(metric)) {
    const params = { ...scopeParams };
    if (state.from && state.to) { params.from = state.from; params.to = state.to; }
    else params.days = Math.max(state.days || 30, granularity === "week" ? 30 : 7);
    const counts = await api.getCountsSeries(params);
    if (granularity === "day") return { points: counts.map(d => ({ ts: d.date, value: d[metric] })), formatX: formatDayLabel };
    return { points: groupWeekly(counts, metric, "avg"), formatX: formatWeekLabel };
  }
  if (granularity === "hour") {
    const hours = Math.min((state.days || 1) * 24, 168) || 24;
    const series = await api.getHourlySeries({ metric, hours, ...scopeParams });
    return { points: series.points, trendPoints: series.trend, refValue: series.p95, formatX: formatHourLabel };
  }
  const params = { ...scopeParams };
  if (state.from && state.to) { params.from = state.from; params.to = state.to; }
  else params.days = Math.max(state.days || 30, granularity === "week" ? 30 : 7);
  const daily = await api.getDailySeries(params);
  const field = METRIC_DAILY_FIELD[metric];
  if (granularity === "day") return { points: daily.map(d => ({ ts: d.date, value: d[field] })), formatX: formatDayLabel };
  return { points: groupWeekly(daily, field, METRIC_AGG[metric]), formatX: formatWeekLabel };
}

// --- Большая плашка ОД "Общая информация": количество магазинов/POS/КСО/аутсайдеров текущего
// периода и динамика вида "выбранный период vs предыдущий период той же длины" (например, 7 дней
// vs предыдущие 7 дней). Считается на клиенте из countsSeries, чтобы те же самые точки можно было
// переиспользовать для графика при клике на плашку (без второго запроса).
// Сравнение — "на дату" (сегодня vs дата N дней назад), а НЕ среднее за период: количество
// магазинов/касс — это уровень (снимок состояния), а не показатель, который имеет смысл усреднять
// по дням. Усреднение (как для процентов вроде доступности) давало дробные дельты вида "+0.6 кассы"
// при добавлении одной кассы в середине периода — бессмысленно для счетчика штук (замечание
// пользователя). Проценты (outlier_pct) по-прежнему берутся "на дату", как и остальное. ---
async function fetchNetworkCountsSummary(scopeParams) {
  const days = periodState.days || 7;
  const series = await api.getCountsSeries({ ...scopeParams, days: days * 2 });
  const dates = [...new Set(series.map(s => s.date))].sort();
  const byDate = new Map(series.map(s => [s.date, s]));
  const cur = dates.length ? byDate.get(dates[dates.length - 1]) : null;
  const previousIdx = dates.length - 1 - days;
  const prev = previousIdx >= 0 ? byDate.get(dates[previousIdx]) : null;
  const result = {};
  for (const f of ["store_count", "pos_count", "sco_count", "outlier_count", "outlier_pct"]) {
    result[f] = cur ? cur[f] : 0;
    result[f + "_trend"] = (cur && prev) ? Math.round((cur[f] - prev[f]) * 10) / 10 : null;
  }
  return result;
}

// --- Drill-down по KPI-плашке (любой экран, любая метрика с реальным временным рядом): единая
// точка входа, гранулярность и тип графика (линия/столбцы) выбираются автоматически по метрике
// и выбранному периоду. refOverride позволяет заменить p95-подсказку на целевое значение (например,
// потенциал перевода на SCO вместо p95).
// У графика СВОЙ локальный период (drawerPeriod), стартующий как копия текущего periodState экрана —
// пользователь может поменять диапазон прямо в drawer'е (не листая обратно на экран), но это никак
// не пишется обратно в periodState: закрыл drawer — локальный период просто отбрасывается. ---
let drawerPeriod = null;
function openMetricChart(scopeParams, metric, label, refOverride) {
  const kind = metricKind(metric);
  const suffix = metricUnit(metric);
  drawerPeriod = { ...periodState };
  definePeriodPicker("drawer", {
    getState: () => drawerPeriod,
    setState: s => { drawerPeriod = s; },
    scopeParams,
    onApply: () => refreshMetricChart(scopeParams, metric, refOverride, kind, suffix)
  });
  openOverlay(`<div class="drawer drawer-wide">
    <div class="drawer-header">
      <div>
        <h2>${label}</h2>
        <div class="period-picker" id="period-picker-host-drawer" style="margin-top:6px">
          <button class="btn btn-sm period-btn" id="period-btn-drawer" onclick="togglePeriodPanel('drawer')">📅 <span id="drawer-period-label">${ppLabel("drawer")}</span></button>
        </div>
      </div>
      <button class="modal-close" onclick="closeOverlay()">×</button>
    </div>
    <div id="metric-chart-body"><div class="skeleton skeleton-line" style="width:90%"></div></div>
    <div id="mini-kpi-row"></div>
  </div>`, "drawer");
  refreshMetricChart(scopeParams, metric, refOverride, kind, suffix);
  renderMiniKpiRow(scopeParams);
}
// --- Свободное место под графиком в drawer'е используем для компактной сводки ключевых
// показателей (как в блоке "Общая информация" дашборда сети) — приглушенно-серым, чтобы не
// отвлекать от основного графика, с раскраской в реальный статусный цвет при наведении. ---
async function renderMiniKpiRow(scopeParams) {
  const host = el("mini-kpi-row");
  if (!host) return;
  try {
    const [storesList, pos] = await Promise.all([api.getStores(scopeParams), api.getPosSummary(scopeParams)]);
    const availability = avg(storesList.map(s => s.availability_pct));
    const scoShare = avg(storesList.map(s => s.sco_share_pct));
    const attention = storesList.filter(s => s.outlier);
    const tiles = [
      { label: t("kpi.availability"), value: availability.toFixed(0) + "%", cls: kpiClassFor(availability, 90, "higher-better") },
      { label: t("kpi.sco_share"), value: scoShare.toFixed(0) + "%", cls: kpiClassFor(scoShare, 30, "higher-better") },
      { label: t("kpi.pos_availability"), value: pos.availability_pct + "%", cls: kpiClassFor(pos.availability_pct, 95, "higher-better") },
      { label: t("kpi.outlier_count"), value: attention.length + " " + t("scope.of") + " " + storesList.length, cls: attention.length ? "kpi-warn" : "kpi-good" }
    ];
    const freshHost = el("mini-kpi-row");
    if (freshHost) freshHost.innerHTML = `<div class="mini-kpi-row">${tiles.map(x => `
      <div class="mini-kpi-tile ${x.cls}"><div class="mini-kpi-label">${x.label}</div><div class="mini-kpi-value">${x.value}</div></div>`).join("")}</div>`;
  } catch (e) { /* сводка необязательна — молча пропускаем при ошибке, основной график уже показан */ }
}
async function refreshMetricChart(scopeParams, metric, refOverride, kind, suffix) {
  const labelEl = el("drawer-period-label");
  if (labelEl) labelEl.textContent = ppLabel("drawer");
  const body = el("metric-chart-body");
  if (body) body.innerHTML = `<div class="skeleton skeleton-line" style="width:90%"></div>`;
  try {
    const { points, trendPoints, refValue, formatX } = await fetchMetricChartData(scopeParams, metric, drawerPeriod);
    const finalRef = refOverride ? refOverride.value : refValue;
    const finalRefLabel = refOverride ? refOverride.label : (refValue != null ? `p95 = ${refValue}${suffix}` : undefined);
    const freshBody = el("metric-chart-body");
    if (freshBody) freshBody.innerHTML = renderChart({ points, trendPoints: kind === "bar" ? null : trendPoints, refValue: finalRef, refLabel: finalRefLabel, formatX, kind, valueSuffix: suffix });
  } catch (e) {
    const freshBody = el("metric-chart-body");
    if (freshBody) freshBody.innerHTML = `<p style="color:var(--color-red)">${escapeHtml(e.message)}</p>`;
  }
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
      ${typeof IS_OFFLINE !== "undefined" && IS_OFFLINE
        ? `<a class="settings-link" onclick="openSettingsApp()">⚙ ${t("nav.settings")}</a>`
        : `<a class="settings-link" href="settings.html" target="_blank">⚙ ${t("nav.settings")}</a>`}
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
    <div class="period-picker" id="period-picker-host-topbar">
      <button class="btn btn-sm period-btn" id="period-btn-topbar" onclick="togglePeriodPanel('topbar')">📅 ${ppLabel("topbar")}</button>
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

// Этап 2/действие методологии (SCO/6133710853): ОД получает задачи, требующие внимания, сгруппированные
// по региону/РД (делегирование вниз), РД — сразу по магазинам своего региона (действовать напрямую).
// На карточке магазина (роль dm) не вызывается — там показывается список задач самого магазина (SCR-03).
function renderAttentionTasksByRole(role, attentionTasks, storesList, allRegions) {
  if (role === "dm") return "";
  if (!attentionTasks.length) {
    return `<div class="section"><h3>${role === "od" ? t("section.attention_tasks_by_region") : t("section.attention_tasks_by_store")}</h3>
      <p style="color:var(--color-text-muted)">${t("task.none_attention")}</p></div>`;
  }
  const storeById = new Map(storesList.map(s => [s.id, s]));
  const row = (label, count, storeIds) => `<div class="attention-task-row clickable-row" onclick="openAttentionTasks(${JSON.stringify(storeIds).replace(/"/g, "&quot;")})">
    <span>${label}</span><span class="badge badge-warn">${count}</span></div>`;
  if (role === "od") {
    const byRegion = new Map();
    for (const tk of attentionTasks) {
      const region = storeById.get(tk.store_id)?.region || "—";
      if (!byRegion.has(region)) byRegion.set(region, new Set());
      byRegion.get(region).add(tk.store_id);
    }
    const directorByRegion = new Map(allRegions.map(r => [r.region, r.regionalDirector]));
    const rows = [...byRegion.entries()].sort((a, b) => b[1].size - a[1].size);
    return `<div class="section"><h3>${t("section.attention_tasks_by_region")}</h3><div class="card">
      ${rows.map(([region, storeIds]) => row(`${region}${directorByRegion.get(region) ? " — " + directorByRegion.get(region) : ""}`,
        [...storeIds].reduce((sum, id) => sum + attentionTasks.filter(tk => tk.store_id === id).length, 0), [...storeIds])).join("")}
    </div></div>`;
  }
  const byStore = new Map();
  for (const tk of attentionTasks) byStore.set(tk.store_id, (byStore.get(tk.store_id) || 0) + 1);
  const rows = [...byStore.entries()].sort((a, b) => b[1] - a[1]);
  return `<div class="section"><h3>${t("section.attention_tasks_by_store")}</h3><div class="card">
    ${rows.map(([storeId, count]) => { const s = storeById.get(storeId); return row(s ? `${s.number} «${s.name}»` : storeId, count, [storeId]); }).join("")}
  </div></div>`;
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
      const [storesList, causes, regions, pos, counts, tasksList, settings] = await Promise.all([
        api.getStores(scopeParams), api.getTechnicalCauses(), api.getRegionsSummary({ days: periodState.days }),
        api.getPosSummary(scopeParams), fetchNetworkCountsSummary(scopeParams), api.getTasks(), api.getSettings(regionForRole())
      ]);
      const details = await Promise.all(storesList.map(s => api.getStore(s.id)));
      return { storesList, causes, allRegions: regions, pos, counts, tasksList, details, settings };
    },
    ({ storesList, causes, allRegions, pos, counts, tasksList, details, settings }) => {
      // allRegions — сеть целиком (для рейтинга региона РД среди всех регионов); regions —
      // отфильтровано для таблицы "Регионы — состояние и тренд" (РД видит только свой регион).
      const regions = currentRole === "rd" ? allRegions.filter(r => r.region === RD_REGION) : allRegions;
      const scopeParams = scopeParamsForRole();
      const scopeParamsAttr = JSON.stringify(scopeParams).replace(/"/g, "&quot;");
      const availability = avg(storesList.map(s => s.availability_pct));
      const scoShare = avg(storesList.map(s => s.sco_share_pct));
      const attention = storesList.filter(s => s.outlier);
      const scoCauses = causes.filter(c => c.applies_to !== "POS");
      const scoTotal = scoCauses.reduce((a, c) => a + c.hours, 0);
      const posTotal = pos.causes.reduce((a, c) => a + c.hours, 0);

      // Регистры сети/региона (утилизация/скорость обслуживания POS/КСО — те же данные, что на
      // экранах "Производительность"/"Утилизация", здесь агрегированы для плашек ОД).
      const allRegs = details.flatMap(s => s.registers.map(r => ({ ...r, storeName: `${s.number} «${s.name}»` })));
      const posRegs = allRegs.filter(r => r.type === "POS");
      const scoRegs = allRegs.filter(r => r.type === "SCO");
      const posUtil = avg(posRegs.map(r => r.utilization_pct));
      const scoUtil = avg(scoRegs.map(r => r.utilization_pct));
      const posSpeedRegs = posRegs.filter(r => r.avg_seconds != null);
      const scoSpeedRegs = scoRegs.filter(r => r.avg_seconds != null);
      const posSpeed = avg(posSpeedRegs.map(r => r.avg_seconds));
      const scoSpeed = avg(scoSpeedRegs.map(r => r.avg_seconds));
      const posUtilPointsAttr = JSON.stringify(posRegs.map(r => ({ ts: r.id, value: r.utilization_pct }))).replace(/"/g, "&quot;");
      const scoUtilPointsAttr = JSON.stringify(scoRegs.map(r => ({ ts: r.id, value: r.utilization_pct }))).replace(/"/g, "&quot;");
      const posSpeedPointsAttr = JSON.stringify(posSpeedRegs.map(r => ({ ts: r.id, value: r.avg_seconds }))).replace(/"/g, "&quot;");
      const scoSpeedPointsAttr = JSON.stringify(scoSpeedRegs.map(r => ({ ts: r.id, value: r.avg_seconds }))).replace(/"/g, "&quot;");

      // Потенциал перетока на SCO — та же формула, что на экране "Потенциал SCO" (SCR-05).
      const potential = scoShare + avg(storesList.map(s => s.potential_sco_pct));
      const potentialRefAttr = JSON.stringify({ value: potential, label: `${t("kpi.sco_transfer_potential")} = ${potential.toFixed(0)}%` }).replace(/"/g, "&quot;");

      // Задачи, требующие внимания: просрочены (due_at в прошлом) или эскалированы, и еще не
      // выполнены — в рамках текущего scope роли (сеть/регион/магазин).
      const scopedStoreIds = new Set(storesList.map(s => s.id));
      const now = Date.now();
      const attentionTasks = tasksList.filter(tk => scopedStoreIds.has(tk.store_id) && tk.status !== "done" && (tk.escalated || new Date(tk.due_at).getTime() < now));

      // Потенциальная экономия = среднее время чека POS (часы) × потенциал чеков перевода на КСО
      // (шт, недельный) × ставка часа кассира — по каждому магазину отдельно (своя средняя скорость
      // POS), сумма — итог по scope. "Потенциал чеков в штуках" — потенциал_sco_pct (п.п.),
      // примененный к недельной нагрузке POS магазина (см. requirements/02-system/business-rules-and-formulas.md,
      // "10. Потенциальная экономия"). Валюта/ставка — настраиваемые параметры (SCR-08).
      const cashierHourlyRate = settings.network.cashier_hourly_rate;
      const currencyCode = settings.network.currency;
      const savingsByStore = storesList.map(s => {
        const detail = details.find(d => d.id === s.id);
        const storePosRegs = detail ? detail.registers.filter(r => r.type === "POS" && r.avg_seconds != null) : [];
        const storePosSpeed = storePosRegs.length ? avg(storePosRegs.map(r => r.avg_seconds)) : null;
        const storePotentialChecks = s.pos_load_week * (s.potential_sco_pct / 100);
        const value = storePosSpeed != null ? (storePosSpeed / 3600) * storePotentialChecks * cashierHourlyRate : 0;
        return { ts: s.number, value: Math.round(value) };
      });
      const potentialSavings = savingsByStore.reduce((sum, r) => sum + r.value, 0);
      const savingsPointsAttr = JSON.stringify(savingsByStore).replace(/"/g, "&quot;");

      // Рейтинг региона среди всех регионов сети (только роль РД) — композитный балл: равновзвешенное
      // среднее доступности/утилизации/доли чеков КСО (business-rules-and-formulas.md, "14. Рейтинг
      // региона/магазина" — балл и веса не подтверждены Product Manager). "Догоняющий" — регион на
      // одну позицию ниже в рейтинге (следующий за вами, ближайший претендент на ваше место).
      let regionRanking = null, regionRankedAttr = null;
      if (currentRole === "rd") {
        const ranked = [...allRegions].map(r => ({
          name: r.region, availability_pct: r.availability_pct, utilization_pct: r.utilization_pct, sco_share_pct: r.sco_share_pct,
          score: (r.availability_pct + r.utilization_pct + r.sco_share_pct) / 3
        })).sort((a, b) => b.score - a.score).map((r, i) => ({ ...r, rank: i + 1 }));
        const myIndex = ranked.findIndex(r => r.name === RD_REGION);
        regionRanking = { leader: ranked[0], mine: ranked[myIndex], chaser: myIndex + 1 < ranked.length ? ranked[myIndex + 1] : null };
        regionRankedAttr = JSON.stringify(ranked).replace(/"/g, "&quot;");
      }

      return `
        <div class="section"><h3>${t("section.general_info")}</h3>
        ${bigInfoTile([
          { label: t("kpi.store_count"), value: Math.round(counts.store_count), trend: counts.store_count_trend, trendDecimals: 0,
            onClick: `openMetricChart(${scopeParamsAttr}, 'store_count', '${t("kpi.store_count")}')` },
          { label: t("kpi.pos_count"), value: Math.round(counts.pos_count), trend: counts.pos_count_trend, trendDecimals: 0,
            onClick: `openMetricChart(${scopeParamsAttr}, 'pos_count', '${t("kpi.pos_count")}')` },
          { label: t("kpi.sco_count"), value: Math.round(counts.sco_count), trend: counts.sco_count_trend, trendDecimals: 0,
            onClick: `openMetricChart(${scopeParamsAttr}, 'sco_count', '${t("kpi.sco_count")}')` },
          { label: t("kpi.outlier_count"), value: Math.round(counts.outlier_count), sub: counts.outlier_pct + "%", trend: counts.outlier_count_trend, trendDirection: "lower-better", trendDecimals: 0,
            onClick: `openMetricChart(${scopeParamsAttr}, 'outlier_count', '${t("kpi.outlier_count")}')` }
        ])}
        </div>

        <!-- Этап 1 методологии (SCO/6133710853): два top-level индикатора с цветовой индикацией —
             все остальное (утилизация, скорость обслуживания, потенциал, экономия, рейтинг) убрано
             с первого экрана в "Подробнее" ниже (см. правки 2026-09-13 по комментариям ПМ и разбору
             сценария РД — "перегрузили дашборды", "производительность касс путает"). -->
        <div class="section">
          <div class="grid grid-kpi grid-kpi-hero">
            ${kpiCard({ label: t("kpi.availability"), value: availability.toFixed(0) + "%", sub: t("kpi.norm_prefix") + "90%",
              cls: kpiClassFor(availability, 90, "higher-better"), onClick: `openMetricChart(${scopeParamsAttr}, 'availability', '${t("kpi.availability")}')` })}
            ${kpiCard({ label: t("kpi.sco_share"), value: scoShare.toFixed(0) + "%", sub: t("kpi.norm_prefix") + "30%",
              cls: kpiClassFor(scoShare, 30, "higher-better"), onClick: `openMetricChart(${scopeParamsAttr}, 'sco_share', '${t("kpi.sco_share")}')` })}
          </div>
        </div>

        <!-- Этап 2: таблица аутсайдеров сразу под hero-плашками (была в самом низу экрана). -->
        <div class="section"><div class="section-header"><h2>${t("section.attention_problems")}</h2><a onclick="nav('outliers')">${t("section.all_outliers")}</a></div>
          ${renderStoreQuickFilters("SCR-01")}
          <div class="card">${renderSortableStoreTable(applyQuickFilter(attention.filter(s => !filterState.networkRegion || s.region === filterState.networkRegion), "SCR-01"), "SCR-01")}</div>
        </div>

        ${renderAttentionTasksByRole(currentRole, attentionTasks, storesList, allRegions)}

        <div class="section-header more-details-header"><h2>${t("section.more_details")}</h2></div>

        <div class="section"><div class="section-header"><h2>${t("section.regions_trend")}${periodLabel().toLowerCase()}</h2></div>
          <div class="card"><table><thead><tr><th>${t("th.region")}</th><th>${t("th.stores_count")}</th><th>${t("th.regional_director")}</th><th class="mono">${t("th.availability")}</th><th class="mono">${t("th.trend")}</th><th class="mono">${t("th.sco_share")}</th><th class="mono">${t("th.trend")}</th></tr></thead>
          <tbody>${regions.map(r => `<tr class="clickable-row region-row" onclick="filterState.networkRegion='${r.region}'; renderNetworkDashboard()">
            <td>${r.region}</td><td class="mono">${r.storeCount}</td><td>${r.regionalDirector}</td>
            <td class="mono">${r.availability_pct}%</td><td>${trendArrow(r.availability_trend, t("unit.pp"))}</td>
            <td class="mono">${r.sco_share_pct}%</td><td>${trendArrow(r.sco_share_trend, t("unit.pp"))}</td>
          </tr>`).join("")}</tbody></table></div>
        </div>

        <div class="section"><h4 class="kpi-group-label">${t("group.sco")}</h4>
          <div class="grid grid-kpi">
            ${kpiCard({ label: t("kpi.utilization_sco"), value: scoUtil.toFixed(0) + "%", cls: "kpi-info",
              onClick: `openCategoryBarChart(${scoUtilPointsAttr}, '${t("kpi.utilization_sco")}', '%')` })}
            ${kpiCard({ label: t("kpi.sco_transfer_potential"), value: potential.toFixed(0) + "%", sub: t("kpi.sco_transfer_sub"), cls: "kpi-warn",
              onClick: `openMetricChart(${scopeParamsAttr}, 'sco_share', '${t("kpi.sco_transfer_potential")}', ${potentialRefAttr})` })}
            ${kpiCard({ label: t("kpi.service_speed_sco"), value: (scoSpeedRegs.length ? Math.round(scoSpeed) : "—") + " " + t("unit.sec"), cls: "kpi-info",
              onClick: `openCategoryBarChart(${scoSpeedPointsAttr}, '${t("kpi.service_speed_sco")}', ' ${t("unit.sec")}')` })}
          </div>
        </div>
        <div class="section"><h4 class="kpi-group-label">${t("group.pos")}</h4>
          <div class="grid grid-kpi">
            ${kpiCard({ label: t("kpi.utilization_pos"), value: posUtil.toFixed(0) + "%", cls: "kpi-info",
              onClick: `openCategoryBarChart(${posUtilPointsAttr}, '${t("kpi.utilization_pos")}', '%')` })}
            ${kpiCard({ label: t("kpi.service_speed_pos"), value: (posSpeedRegs.length ? Math.round(posSpeed) : "—") + " " + t("unit.sec"), cls: "kpi-info",
              onClick: `openCategoryBarChart(${posSpeedPointsAttr}, '${t("kpi.service_speed_pos")}', ' ${t("unit.sec")}')` })}
          </div>
        </div>
        <div class="section"><h4 class="kpi-group-label">${t("group.other")}</h4>
          <div class="grid grid-kpi grid-kpi-compact">
            ${kpiCard({ label: t("kpi.potential_savings"), value: formatCurrency(potentialSavings, currencyCode), sub: t("kpi.potential_savings_sub"), cls: "kpi-good",
              onClick: `openCategoryBarChart(${savingsPointsAttr}, '${t("kpi.potential_savings")}', ' ${t("currency." + currencyCode)}')` })}
            ${regionRanking ? rankingTileHtml(t("kpi.region_ranking"), regionRanking,
              `openRankingTable(${regionRankedAttr}, '${t("section.ranking_table_regions")}', '${t("th.region")}')`) : ""}
          </div>
        </div>

        <div class="section"><h3>${t("section.info_sco")} <span class="section-total mono">${t("section.total_prefix")} ${scoTotal} ${t("unit.hours")}</span></h3>
          <div class="card causes-compact">${scoCauses.map(c => barRow(causeDisplayName(c.cause) + (c.note ? " ⓘ" : ""), c.hours, scoTotal)).join("")}</div></div>
        <div class="section"><h3>${t("section.info_pos")} <span class="section-total mono">${t("section.total_prefix")} ${posTotal} ${t("unit.hours")}</span></h3>
          <div class="card causes-compact">${pos.causes.length ? pos.causes.map(c => barRow(causeDisplayName(c.cause), c.hours, posTotal)).join("") : `<p style="color:var(--color-text-muted)">${t("section.no_pos_causes")}</p>`}</div>
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
async function fetchStoreHourlyLoad(storeId) {
  const params = { storeId };
  if (periodState.from && periodState.to) { params.from = periodState.from; params.to = periodState.to; }
  else params.days = periodState.days || 7;
  return api.getHourlyLoadProfile(params);
}
// Этап 3/4 методологии (SCO/6133710853, кейс "магазин №404"): вместо голой таблицы — гипотеза причины
// и предзаполненное действие. Считается на фронтенде из уже загруженных данных (store.registers,
// hourlyLoad) без новых API-запросов. Причины простоя по конкретной кассе (сравнение с медианой по
// сети, как в методологии) не разбиты в БД по магазину/кассе (см. план 2026-09-13) — намеренно не
// изобретаем такое сравнение, диагноз строится только на том, что реально разбито по кассам:
// registers.status/note/utilization_pct, и на часах перегрузки из hourlyLoad.
const DIAGNOSIS_PROBLEM_STATUSES = new Set(["no_paper", "bank_error", "no_connection", "scale_error", "scanner_error", "printer_error", "off", "blocked_by_staff", "service_mode"]);
function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = (s.length - 1) / 2;
  return (s[Math.floor(mid)] + s[Math.ceil(mid)]) / 2;
}
// Один блок рекомендации: заголовок — предлагаемое решение (то же, что подставится заголовком задачи),
// текст обычным начертанием — причина/расчет, по которому решение предложено. Разделены визуально
// и структурно, а не одним абзацем, — по просьбе пользователя (2026-09-13, "много текста").
function diagnosisBlock(titleText, causeHtml, prefill, storeId) {
  return `<div class="diagnosis-block">
    <h4 class="diagnosis-title">${titleText}</h4>
    <p class="diagnosis-cause">${causeHtml}</p>
    <button class="btn btn-primary" onclick="openCreateTaskModal('${storeId}', ${JSON.stringify(prefill).replace(/"/g, "&quot;")})">${t("diagnosis.suggest_task")}</button>
  </div>`;
}
function renderDiagnosis(store, hourlyLoad) {
  let body;
  if (store.reason === "technical") {
    // Технический фактор: касса без телеметрии 30+ дней (is_stale) — самый однозначный сигнал,
    // проверяем в первую очередь; иначе ищем кассу с проблемным статусом (не просто "нет связи, но
    // доступна" — offline_but_available сюда не попадает).
    const staleR = store.registers.filter(r => r.is_stale).sort((a, b) => b.stale_days - a.stale_days)[0];
    const problemR = store.registers.filter(r => !r.is_stale && DIAGNOSIS_PROBLEM_STATUSES.has(r.status) && !r.is_available)
      .sort((a, b) => (b.note ? 1 : 0) - (a.note ? 1 : 0))[0];
    if (staleR) {
      const title = t("diagnosis.stale_task_title", { id: staleR.id, days: staleR.stale_days });
      const prefill = { registerId: staleR.id, title, targetKpi: t("diagnosis.stale_task_kpi", { id: staleR.id }) };
      body = diagnosisBlock(title, t("diagnosis.stale_hint", { id: staleR.id, days: staleR.stale_days }), prefill, store.id);
    } else if (problemR) {
      const title = t("diagnosis.technical_task_title", { id: problemR.id, status: registerLabel(problemR.status) });
      const prefill = { registerId: problemR.id, title, targetKpi: t("diagnosis.technical_task_kpi", { id: problemR.id }) };
      const cause = t("diagnosis.technical_hint", { id: problemR.id, status: registerLabel(problemR.status) }) + (problemR.note ? " " + escapeHtml(problemR.note) : "");
      body = diagnosisBlock(title, cause, prefill, store.id);
    } else {
      body = `<p style="color:var(--color-text-muted)">${t("diagnosis.no_data_hint")}</p>`;
    }
  } else if (store.reason === "business") {
    // Бизнес-фактор: методология (Этап 4, кейс "SCO №4") показывает ОБА эти анализа вместе, а не
    // взаимоисключающе — сначала масштаб упущенной эффективности по всему магазину ("целевой клиент
    // КСО на POS"), затем, если есть, конкретную кассу SCO, которая технически доступна и в строю
    // (не stale), но используется заметно меньше сестринских — как ЧАСТЬ причины системного разрыва,
    // не вместо нее (даже если чинить только одну кассу, до норматива это не дотянет само по себе).
    const potentialTitle = t("diagnosis.business_systemic_task_title");
    const potentialPrefill = { title: potentialTitle, targetKpi: t("diagnosis.business_systemic_task_kpi") };
    const blocks = [diagnosisBlock(potentialTitle,
      t("diagnosis.business_potential_hint", { share: store.sco_share_pct, potential: store.potential_sco_pct, load: store.pos_load_week }),
      potentialPrefill, store.id)];
    const scoRegs = store.registers.filter(r => r.type === "SCO");
    const med = median(scoRegs.map(r => r.utilization_pct));
    const anomaly = scoRegs.find(r => med > 0 && r.utilization_pct <= med / 2 && r.status === "available" && !r.is_stale);
    if (anomaly) {
      const title = t("diagnosis.business_register_task_title", { id: anomaly.id });
      const prefill = { registerId: anomaly.id, title, targetKpi: t("diagnosis.business_register_task_kpi", { id: anomaly.id }) };
      blocks.push(diagnosisBlock(title, t("diagnosis.business_register_hint", { id: anomaly.id, util: anomaly.utilization_pct, median: Math.round(med) }), prefill, store.id));
    }
    body = blocks.join("");
  } else if (store.reason === "utilization") {
    // Перегруз POS: те же часы перегрузки, что и на графике "Потоки по часам" ниже.
    const points = hourlyLoad.points || [];
    const totals = points.map(p => p.pos_checks + p.sco_checks);
    const overloadHours = points.filter((p, i) => totals[i] > hourlyLoad.overloadThreshold).map(p => `${String(p.hour).padStart(2, "0")}:00`);
    if (overloadHours.length) {
      const title = t("diagnosis.utilization_task_title");
      const prefill = { title, targetKpi: t("diagnosis.utilization_task_kpi") };
      body = diagnosisBlock(title, t("diagnosis.utilization_hint", { hours: overloadHours.join(", ") }), prefill, store.id);
    } else {
      body = `<p style="color:var(--color-text-muted)">${t("diagnosis.no_data_hint")}</p>`;
    }
  } else {
    body = `<p style="color:var(--color-text-muted)">${t("diagnosis.no_data_hint")}</p>`;
  }
  return `<div class="section"><div class="section-header"><h2>${t("section.diagnosis")}</h2></div><div class="card">${body}</div></div>`;
}
function renderStoreCard(storeId) {
  // п.2: не дублировать контекст — для ДМ показываем только "Магазин №X", для ОД/РД — единственная
  // ступень пути (уровень + название магазина), без повторения одного и того же контекста дважды.
  renderTopbar(currentRole !== "dm" ? [{ label: scopeCrumb().label, route: "network" }, { label: `${t("scope.store")} ${storeId}` }] : [{ label: `${t("scope.store")} №${storeId}` }]);
  const content = el("content");
  content.innerHTML = `<div id="scr03-header"></div><div id="scr03-body"></div>`;
  withState("SCR-03", el("scr03-body"),
    async () => {
      const store = await api.getStore(storeId);
      const scopeParams = { scope: "store", storeId: store.id };
      const [tasks, counts, siblingStores, hourlyLoad] = await Promise.all([
        api.getTasks(storeId), fetchNetworkCountsSummary(scopeParams),
        api.getStores({ scope: "region", region: store.region }), fetchStoreHourlyLoad(store.id)
      ]);
      return { store, tasks, counts, siblingStores, hourlyLoad };
    },
    ({ store, tasks, counts, siblingStores, hourlyLoad }) => {
      if (currentRole !== "dm") renderTopbar([{ label: scopeCrumb().label, route: "network" }, { label: `${store.number} «${store.name}»` }]);
      else renderTopbar([{ label: `${store.number} «${store.name}»` }]);
      el("scr03-header").innerHTML = `<div class="section-header"><h1>${store.number} «${store.name}» <span style="font-weight:400;color:var(--color-text-muted);font-size:14px">— ${store.region}, ${store.format} · ${t("th.director").toLowerCase()}: ${store.director_name}</span></h1></div>`;
      const s = store.settings;
      const scopeParams = { scope: "store", storeId: store.id };
      const scopeParamsAttr = JSON.stringify(scopeParams).replace(/"/g, "&quot;");

      const posRegs = store.registers.filter(r => r.type === "POS");
      const scoRegs = store.registers.filter(r => r.type === "SCO");
      const posUtil = avg(posRegs.map(r => r.utilization_pct));
      const scoUtil = avg(scoRegs.map(r => r.utilization_pct));
      const posSpeedRegs = posRegs.filter(r => r.avg_seconds != null);
      const scoSpeedRegs = scoRegs.filter(r => r.avg_seconds != null);
      const posSpeed = posSpeedRegs.length ? avg(posSpeedRegs.map(r => r.avg_seconds)) : null;
      const scoSpeed = scoSpeedRegs.length ? avg(scoSpeedRegs.map(r => r.avg_seconds)) : null;
      const posUtilPointsAttr = JSON.stringify(posRegs.map(r => ({ ts: r.id, value: r.utilization_pct }))).replace(/"/g, "&quot;");
      const scoUtilPointsAttr = JSON.stringify(scoRegs.map(r => ({ ts: r.id, value: r.utilization_pct }))).replace(/"/g, "&quot;");
      const posSpeedPointsAttr = JSON.stringify(posSpeedRegs.map(r => ({ ts: r.id, value: r.avg_seconds }))).replace(/"/g, "&quot;");
      const scoSpeedPointsAttr = JSON.stringify(scoSpeedRegs.map(r => ({ ts: r.id, value: r.avg_seconds }))).replace(/"/g, "&quot;");

      // Потенциал перетока на SCO — та же формула, что на дашборде сети/экране "Потенциал SCO".
      const potential = store.sco_share_pct + store.potential_sco_pct;
      const potentialRefAttr = JSON.stringify({ value: potential, label: `${t("kpi.sco_transfer_potential")} = ${potential.toFixed(0)}%` }).replace(/"/g, "&quot;");

      // Рейтинг магазина среди магазинов ТОГО ЖЕ региона (не сети целиком) — композитный балл:
      // равновзвешенное среднее доступности/утилизации/доли чеков КСО, business-rules-and-formulas.md
      // "14. Рейтинг региона/магазина" (не подтверждено Product Manager).
      const ranked = siblingStores.map(st => ({
        id: st.id, name: `${st.number} «${st.name}»`, availability_pct: st.availability_pct,
        utilization_pct: st.utilization_pct, sco_share_pct: st.sco_share_pct,
        score: (st.availability_pct + st.utilization_pct + st.sco_share_pct) / 3
      })).sort((a, b) => b.score - a.score).map((r, i) => ({ ...r, rank: i + 1 }));
      const myIndex = ranked.findIndex(r => r.id === store.id);
      const storeRanking = { leader: ranked[0], mine: ranked[myIndex], chaser: myIndex + 1 < ranked.length ? ranked[myIndex + 1] : null };
      const storeRankedAttr = JSON.stringify(ranked).replace(/"/g, "&quot;");

      return `
        <!-- Этап 1: hero-плашки + бейдж категории аутсайдера (раньше не показывался явно на карточке). -->
        <div class="section">
          <div class="grid grid-kpi grid-kpi-hero">
            ${kpiCard({ label: t("kpi.availability"), value: store.availability_pct + "%", sub: t("kpi.norm_prefix") + s.availability_norm + "%",
              cls: kpiClassFor(store.availability_pct, s.availability_norm, "higher-better"), onClick: `openMetricChart(${scopeParamsAttr}, 'availability', '${t("kpi.availability")}')` })}
            ${kpiCard({ label: t("kpi.sco_share"), value: store.sco_share_pct + "%", sub: t("kpi.norm_prefix") + s.sco_share_norm + "%",
              cls: kpiClassFor(store.sco_share_pct, s.sco_share_norm, "higher-better"), onClick: `openMetricChart(${scopeParamsAttr}, 'sco_share', '${t("kpi.sco_share")}')` })}
          </div>
          ${store.outlier ? `<p style="margin-top:0"><span class="badge badge-warn">${outlierLabel(store.reason)}</span></p>` : ""}
        </div>

        ${store.outlier ? renderDiagnosis(store, hourlyLoad) : ""}

        <div class="section"><div class="section-header"><h2>${t("section.store_tasks")}</h2>${currentRole !== "dm" ? `<button class="btn btn-primary" onclick="openCreateTaskModal('${store.id}')">${t("action.create_task")}</button>` : ""}</div>
          <div class="card">${tasks.length ? tasks.map(taskRow).join("") : `<p style="color:var(--color-text-muted)">${t("store.no_active_tasks")}</p>`}</div></div>

        <div class="section-header more-details-header"><h2>${t("section.more_details")}</h2></div>

        <div class="section">
        ${bigInfoTile([
          { label: t("kpi.pos_count"), value: Math.round(counts.pos_count), trend: counts.pos_count_trend, trendDecimals: 0,
            onClick: `openMetricChart(${scopeParamsAttr}, 'pos_count', '${t("kpi.pos_count")}')` },
          { label: t("kpi.sco_count"), value: Math.round(counts.sco_count), trend: counts.sco_count_trend, trendDecimals: 0,
            onClick: `openMetricChart(${scopeParamsAttr}, 'sco_count', '${t("kpi.sco_count")}')` }
        ])}
        </div>

        <div class="section"><h4 class="kpi-group-label">${t("group.sco")}</h4>
          <div class="grid grid-kpi">
            ${kpiCard({ label: t("kpi.utilization_sco"), value: scoUtil.toFixed(0) + "%", cls: "kpi-info",
              onClick: `openCategoryBarChart(${scoUtilPointsAttr}, '${t("kpi.utilization_sco")}', '%')` })}
            ${kpiCard({ label: t("kpi.sco_transfer_potential"), value: potential.toFixed(0) + "%", sub: t("kpi.sco_transfer_sub"), cls: "kpi-warn",
              onClick: `openMetricChart(${scopeParamsAttr}, 'sco_share', '${t("kpi.sco_transfer_potential")}', ${potentialRefAttr})` })}
            ${kpiCard({ label: t("kpi.service_speed_sco"), value: (scoSpeedRegs.length ? Math.round(scoSpeed) : "—") + " " + t("unit.sec"), cls: "kpi-info",
              onClick: `openCategoryBarChart(${scoSpeedPointsAttr}, '${t("kpi.service_speed_sco")}', ' ${t("unit.sec")}')` })}
            ${kpiCard({ label: t("kpi.sco_load"), value: store.sco_load_week + " " + t("unit.checks_week"), sub: t("kpi.norm_below_prefix") + s.sco_weekly_norm, cls: store.sco_load_week < s.sco_weekly_norm ? "kpi-info" : "kpi-good",
              onClick: `openMetricChart(${scopeParamsAttr}, 'sco_checks', '${t("kpi.sco_load")}')` })}
          </div>
        </div>
        <div class="section"><h4 class="kpi-group-label">${t("group.pos")}</h4>
          <div class="grid grid-kpi">
            ${kpiCard({ label: t("kpi.utilization_pos"), value: posUtil.toFixed(0) + "%", cls: "kpi-info",
              onClick: `openCategoryBarChart(${posUtilPointsAttr}, '${t("kpi.utilization_pos")}', '%')` })}
            ${kpiCard({ label: t("kpi.service_speed_pos"), value: (posSpeedRegs.length ? Math.round(posSpeed) : "—") + " " + t("unit.sec"), cls: "kpi-info",
              onClick: `openCategoryBarChart(${posSpeedPointsAttr}, '${t("kpi.service_speed_pos")}', ' ${t("unit.sec")}')` })}
            ${kpiCard({ label: t("kpi.pos_load"), value: store.pos_load_week + " " + t("unit.checks_week"), sub: t("kpi.norm_below_prefix") + s.pos_weekly_norm, cls: store.pos_load_week > s.pos_upper_overload ? "kpi-bad" : "kpi-good",
              onClick: `openMetricChart(${scopeParamsAttr}, 'pos_checks', '${t("kpi.pos_load")}')` })}
          </div>
        </div>
        <div class="section"><h4 class="kpi-group-label">${t("group.other")}</h4>
          <div class="grid grid-kpi grid-kpi-compact">
            ${rankingTileHtml(t("kpi.store_ranking"), storeRanking,
              `openRankingTable(${storeRankedAttr}, '${t("section.ranking_table_stores")}', '${t("th.store")}')`)}
          </div>
        </div>

        <div class="section"><div class="section-header"><h2>${t("kpi.hourly_load")}</h2></div>
          <div class="card"><p style="color:var(--color-text-muted);font-size:12px;margin-top:0">${t("kpi.hourly_load_sub")}</p>
            ${renderHourlyLoadChart(hourlyLoad.points, hourlyLoad.overloadThreshold)}</div>
        </div>

        <p style="color:var(--color-text-muted);font-size:12px">${t("store.drilldown_hint")}${periodLabel().toLowerCase()}.</p>
        <div class="section"><div class="section-header"><h2>${t("section.store_registers")}</h2></div><div class="card">
          <table><thead><tr><th>${t("th.register")}</th><th>${t("th.type")}</th><th>${t("th.state")}</th>
            <th class="mono">${t("th.p95_sec")} <span class="info-tip">i<span class="info-tip-bubble">${t("kpi.p95_tooltip")}</span></span></th><th class="mono">${t("th.utilization")}</th></tr></thead>
          <tbody>${store.registers.map(r => `<tr class="clickable-row ${r.is_stale ? "row-stale" : ""}" onclick="openRegisterHistory('${r.id}')"><td class="mono">${r.id}</td><td>${r.type}</td>
            <td>${registerStatusBadge(r)}${!r.is_stale && r.status === "no_connection" && r.is_available ? ` <span class="badge badge-info">${t("reg.offline_available_badge")}</span>` : ""}</td>
            <td class="mono">${r.p95_seconds ?? "—"}</td><td class="mono">${r.utilization_pct}%</td></tr>
            ${r.note ? `<tr><td></td><td colspan="4" style="color:var(--color-text-muted);font-size:12px;padding-top:0">${r.note}</td></tr>` : ""}`).join("")}</tbody></table>
          <p style="color:var(--color-text-muted);font-size:12px;margin-top:8px">${t("store.register_click_hint")}</p>
        </div></div>`;
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
        <div class="section"><div class="section-header"><h2>${t("section.tech_causes_hours")} <span class="section-total mono">${t("section.total_prefix")} ${scoTotal} ${t("unit.hours")}</span></h2></div>
          <div class="card causes-compact">${scoCauses.map(c => barRow(causeDisplayName(c.cause) + (c.note ? " ⓘ" : ""), c.hours, scoTotal)).join("")}</div></div>
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
async function openCreateTaskModal(storeId, prefill = {}) {
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
          ${registers.map(r => `<option value="${r.id}" ${prefill.registerId === r.id ? "selected" : ""}>${r.id} (${r.type})</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>${t("task.form.assignee")}</label><input type="text" id="tf-assignee" value="${store ? store.director_name + " (директор магазина " + store.number + ")" : ""}" readonly style="background:var(--color-bg)"></div>
      <div class="field"><label>${t("task.form.title")}</label><input type="text" id="tf-title" placeholder="${t("task.form.title_placeholder")}" value="${escapeHtml(prefill.title || "")}"></div>
      <div class="field"><label>${t("task.form.kpi")}</label><input type="text" id="tf-kpi" placeholder="${t("task.form.kpi_placeholder")}" value="${escapeHtml(prefill.targetKpi || "")}">
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
// preserveInput=true (при вводе в поле поиска) пропускает пересборку шапки/поля — иначе
// content.innerHTML на каждый keystroke пересоздавал сам <input>, обрывая фокус после первого
// символа (реальный баг, найден при проверке: многосимвольный поиск не печатался). Без аргумента
// (первый рендер экрана, смена языка) пересобирается всё, как раньше.
function renderDiagnostics(preserveInput) {
  if (!preserveInput || !el("diag-search")) {
    renderTopbar([{ label: t("nav.diagnostics") }]);
    const content = el("content");
    content.innerHTML = `<div class="section-header"><h1>${t("nav.diagnostics")}</h1></div>
      <div class="scope-banner out-of-scope">${t("diag.full_access_banner")}</div>
      <div class="filter-bar"><div><label>${t("diag.search_label")}</label><input type="text" id="diag-search" oninput="renderDiagnostics(true)" value="${filterState.diag || ""}"></div></div><div id="scr11-body"></div>`;
  }
  const search = el("diag-search") ? el("diag-search").value : "";
  filterState.diag = search;
  withState("SCR-11", el("scr11-body"), () => api.getDiagnostics(search),
    (rows) => `<div class="card"><table><thead><tr><th>${t("th.store")}</th><th>${t("th.register")}</th><th>${t("th.state")}</th><th class="mono">${t("th.revenue_week")}</th><th class="mono">${t("th.sco_share")}</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="clickable-row ${r.is_stale ? "row-stale" : ""}" onclick="openRegisterHistory('${r.id}')"><td>${r.store_label}</td><td class="mono">${r.id}</td><td>${registerStatusBadge(r)}</td><td class="mono">${r.revenue_week.toLocaleString(dateLocale())} ₽</td><td class="mono">${r.sco_share_pct}%</td></tr>`).join("")}</tbody></table></div>`);
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
    <p><a onclick="nav('store/531')">${t("advisor.open_store_example")}</a></p></div>`;
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

// ================= SCR-08: Настройки (в офлайн-сборке — оверлей вместо отдельного файла) =================
// В серверной версии SCR-08 — сознательно отдельное приложение (settings.html, новая вкладка), см.
// prototype/README.md. Единый offline-файл не может открыть второй файл, поэтому здесь тот же
// экран показывается оверлеем поверх текущего — это адаптация под ограничение однофайловой сборки,
// а не изменение архитектуры серверной версии (та осталась прежней).
const SETTINGS_FIELD_LABELS = {
  availability_norm: ["Доступность КСО, %", "норматив > значения, авто-медиана если не задано"],
  sco_share_norm: ["Доля чеков КСО, %", "норматив > значения"],
  p95_pos: ["p95 POS, сек", ""], p95_sco: ["p95 SCO, сек", ""],
  sco_weekly_norm: ["Норматив нагрузки SCO, чек/нед", "ниже — «недогружены»"],
  pos_weekly_norm: ["Норматив нагрузки POS, чек/нед", ""],
  pos_upper_overload: ["Верхний порог POS (перегруз), чек/нед", ""],
  pos_lower_excess_staff: ["Нижний порог POS (избыток персонала), чек/нед", ""],
  cashier_hourly_rate: ["Ставка часа кассира", "для расчета «Потенциальная экономия» (дашборд ОД)"]
};
const SETTINGS_STRING_FIELDS = new Set(["currency"]);
const SETTINGS_CURRENCY_OPTIONS = ["RUB", "USD", "EUR"];
let settingsAppRole = "od";
function openSettingsApp() {
  openOverlay(`<div class="modal modal-wide">
    <div class="modal-header"><h2>⚙ ${t("nav.settings")}</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <div class="field" style="max-width:280px;margin-bottom:16px">
      <label>${t("role.label")}</label>
      <select id="settings-role-select" onchange="settingsAppRole=this.value; renderSettingsApp()">
        <option value="od" ${settingsAppRole === "od" ? "selected" : ""}>${t("role.od")} — ${t("role.od.scope")}</option>
        <option value="rd" ${settingsAppRole === "rd" ? "selected" : ""}>${t("role.rd")} — ${RD_REGION}</option>
      </select>
    </div>
    <div id="settings-app-body">…</div>
    <div class="settings-group" id="settings-approvals-group" style="display:none">
      <h3 style="margin-top:16px">Очередь согласования (роль ОД)</h3>
      <div id="settings-approvals-body"></div>
    </div>
  </div>`);
  renderSettingsApp();
}
async function renderSettingsApp() {
  const region = settingsAppRole === "rd" ? RD_REGION : null;
  const data = await api.getSettings(region);
  const isRd = settingsAppRole === "rd";
  const eff = data.effective;
  const rows = ["availability_norm", "sco_share_norm", "p95_pos", "p95_sco", "sco_weekly_norm", "pos_weekly_norm", "pos_upper_overload", "pos_lower_excess_staff", "cashier_hourly_rate"];
  const body = el("settings-app-body");
  if (!body) return;
  body.innerHTML = `
    ${isRd ? `<div class="scope-banner mvp2">РД может менять доступность/долю SCO своего региона. Снижение ниже сетевого норматива требует согласования ОД.</div>` : ""}
    <div class="settings-group">
      ${rows.map(f => `<div class="settings-row"><div><div class="row-label">${SETTINGS_FIELD_LABELS[f][0]}</div><div class="row-sub">${SETTINGS_FIELD_LABELS[f][1]}</div></div>
        <input type="number" id="settings-app-${f}" value="${eff[f]}" min="0">
        <div></div>
        <button class="btn btn-sm" onclick="saveSettingsField('${f}', ${isRd})">${t("action.save")}</button></div>`).join("")}
      <div class="settings-row"><div><div class="row-label">${t("settings.currency")}</div><div class="row-sub">${t("settings.currency_sub")}</div></div>
        <select id="settings-app-currency">${SETTINGS_CURRENCY_OPTIONS.map(c => `<option value="${c}" ${eff.currency === c ? "selected" : ""}>${t("currency." + c)} (${c})</option>`).join("")}</select>
        <div></div>
        <button class="btn btn-sm" onclick="saveSettingsField('currency', ${isRd})">${t("action.save")}</button></div>
    </div>
    <div id="settings-app-toast" style="font-size:13px;min-height:20px"></div>`;
  const approvalsGroup = el("settings-approvals-group");
  if (approvalsGroup) approvalsGroup.style.display = settingsAppRole === "od" ? "block" : "none";
  if (settingsAppRole === "od") await renderSettingsApprovals();
}
async function renderSettingsApprovals() {
  const approvals = await api.getApprovals();
  const box = el("settings-approvals-body");
  if (!box) return;
  if (!approvals.length) { box.innerHTML = `<p style="color:var(--color-text-muted)">Нет ожидающих запросов.</p>`; return; }
  box.innerHTML = approvals.map(a => `<div class="settings-row"><div><div class="row-label">${a.region}: ${SETTINGS_FIELD_LABELS[a.field] ? SETTINGS_FIELD_LABELS[a.field][0] : a.field}</div>
    <div class="row-sub">запрошено ${a.requested_value}, сетевой норматив ${a.current_network_value}</div></div><div></div><div></div>
    <div style="display:flex;gap:6px"><button class="btn btn-sm" onclick="resolveSettingsApproval(${a.id}, 'approved')">Согласовать</button>
    <button class="btn btn-sm" onclick="resolveSettingsApproval(${a.id}, 'rejected')">Отклонить</button></div></div>`).join("");
}
async function resolveSettingsApproval(id, decision) {
  await api.resolveApproval(id, decision);
  flashSettingsToast(decision === "approved" ? "Согласовано" : "Отклонено", false);
  renderSettingsApprovals();
}
function flashSettingsToast(msg, isError) {
  const box = el("settings-app-toast");
  if (!box) return;
  box.style.color = isError ? "var(--color-red)" : "var(--color-green)";
  box.textContent = msg;
  setTimeout(() => { if (box) box.textContent = ""; }, 3000);
}
async function saveSettingsField(field, isRd) {
  const input = el("settings-app-" + field);
  const value = SETTINGS_STRING_FIELDS.has(field) ? input.value : Number(input.value);
  try {
    const result = await api.updateSettings({ role: settingsAppRole, region: isRd ? RD_REGION : null, field, value });
    if (result && result.approvalRequired) flashSettingsToast(result.message, false);
    else flashSettingsToast(t("toast.saved"), false);
  } catch (e) { flashSettingsToast(e.message, true); }
}

// ---------- Инициализация ----------
window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
  if (!location.hash) location.hash = currentRole === "dm" ? `#/store/${DM_STORE_ID}` : "#/network";
  render();
});
