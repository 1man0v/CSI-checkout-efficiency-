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
let periodState = { label: t ? "Последние 7 дней" : "", days: 7, mode: "7d" }; // п.3

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
function trendArrow(delta) {
  if (delta == null || Math.abs(delta) < 0.05) return `<span class="kpi-trend">→ 0</span>`;
  const cls = delta > 0 ? "trend-up" : "trend-down";
  const arrow = delta > 0 ? "↑" : "↓";
  return `<span class="kpi-trend ${cls}">${arrow} ${Math.abs(delta).toFixed(1)}</span>`;
}
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
const REGISTER_LABELS = {
  available: { ru: "Доступна", badge: "ok" }, occupied: { ru: "Занята покупателем", badge: "ok" },
  blocked_by_staff: { ru: "Заблокирована сотрудником", badge: "warn" }, no_paper: { ru: "Нет бумаги", badge: "bad" },
  bank_error: { ru: "Ошибка банка", badge: "bad" }, scale_error: { ru: "Ошибка весов", badge: "bad" },
  scanner_error: { ru: "Ошибка сканера", badge: "bad" }, printer_error: { ru: "Ошибка принтера", badge: "bad" },
  service_mode: { ru: "Сервисный режим", badge: "warn" }, no_connection: { ru: "Нет связи (офлайн)", badge: "info" },
  off: { ru: "Выключена", badge: "bad" }, unknown: { ru: "Неизвестное состояние", badge: "warn" }
};
function statusBadge(status) { const s = REGISTER_LABELS[status] || REGISTER_LABELS.unknown; return `<span class="status-dot ${s.badge}"></span>${s.ru}`; }
function outlierLabel(reason) { return { technical: "Технический фактор", business: "Бизнес-фактор", utilization: "Утилизация" }[reason] || "—"; }
function barRow(label, value, total) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${label}</span><span class="mono">${value} ч</span></div>
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
  if (!rows || !rows.length) { toast("Нет данных для экспорта"); return; }
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
  if (state === "empty") return `<div class="state-panel"><div class="state-icon">—</div><p>Нет данных за выбранный период/фильтр.</p></div>`;
  if (state === "serverError") return `<div class="state-panel"><div class="state-icon">!</div><p>Демо ошибки сервера.</p><button class="btn" onclick="render()">Повторить</button></div>`;
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
    if (isEmptyFn && isEmptyFn(data)) { contentEl.innerHTML = `<div class="state-panel"><div class="state-icon">—</div><p>Нет данных за выбранный период/фильтр.</p></div>`; return; }
    contentEl.innerHTML = renderFn(data);
  } catch (e) {
    if (myToken !== renderToken) return;
    contentEl.innerHTML = `<div class="state-panel"><div class="state-icon">!</div><p>${escapeHtml(e.message || "Ошибка сервера")}</p><button class="btn" onclick="render()">Повторить</button></div>`;
  }
}
function skeletonHtml() {
  return `<div class="grid grid-kpi">${[1, 2, 3].map(() => `<div class="skeleton skeleton-kpi"></div>`).join("")}</div>
    <div class="card"><div class="skeleton skeleton-line" style="width:40%"></div><div class="skeleton skeleton-line" style="width:90%"></div></div>`;
}
function setScreenState(value) { screenStateOverride[currentScreenId()] = value === "auto" ? undefined : value; render(); }

// --- Период (п.3): пресеты + календарь-подсказка, аналог выбора дат при бронировании авиабилетов ---
let periodCalendarMonth = new Date();
let periodDailyCache = null;
function periodButtonLabel() { return periodState.label; }
function togglePeriodPanel() {
  const panel = el("period-panel");
  if (panel) { panel.remove(); return; }
  openPeriodPanel();
}
async function openPeriodPanel() {
  const host = el("period-picker-host");
  const div = document.createElement("div");
  div.className = "period-panel"; div.id = "period-panel";
  div.innerHTML = `<div class="period-presets">
      <button onclick="applyPeriodPreset('realtime')">${t("action.realtime")}</button>
      <button onclick="applyPeriodPreset('7d')">${t("action.last7d")}</button>
      <button onclick="applyPeriodPreset('30d')">${t("action.last30d")}</button>
    </div>
    <div id="period-calendar"></div>
    <div class="period-actions"><button class="btn btn-sm" onclick="closePeriodPanel()">${t("action.close")}</button></div>`;
  host.appendChild(div);
  await renderPeriodCalendar();
  setTimeout(() => document.addEventListener("click", periodOutsideClick), 0);
}
function periodOutsideClick(e) {
  const panel = el("period-panel"); const btn = el("period-btn");
  if (panel && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePeriodPanel();
}
function closePeriodPanel() { const p = el("period-panel"); if (p) p.remove(); document.removeEventListener("click", periodOutsideClick); }
function applyPeriodPreset(preset) {
  const map = { realtime: { label: t("action.realtime"), days: 1 }, "7d": { label: t("action.last7d"), days: 7 }, "30d": { label: t("action.last30d"), days: 30 } };
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
  const monthLabel = month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  let cells = `<div class="period-calendar-header"><button onclick="changePeriodMonth(-1)">←</button><span>${monthLabel}</span><button onclick="changePeriodMonth(1)">→</button></div>
    <div class="period-calendar-grid">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(d => `<div class="dow">${d}</div>`).join("")}`;
  for (let i = 0; i < startOffset; i++) cells += `<div class="period-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const info = byDate.get(dateStr);
    const dotColor = info ? (info.availability_pct >= 90 ? "var(--color-green)" : info.availability_pct >= 80 ? "var(--color-yellow)" : "var(--color-red)") : "transparent";
    const tooltip = info ? `Доступность: ${info.availability_pct}%, доля SCO: ${info.sco_share_pct}%` : "нет данных";
    cells += `<div class="period-day" onmouseenter="showDayTooltip(event,'${dateStr}','${tooltip}')" onmouseleave="hideDayTooltip()" onclick="selectPeriodDate('${dateStr}')">
      ${d}<span class="dot" style="background:${dotColor}"></span></div>`;
  }
  cells += `</div>`;
  host.innerHTML = cells;
}
function changePeriodMonth(delta) { periodCalendarMonth = new Date(periodCalendarMonth.getFullYear(), periodCalendarMonth.getMonth() + delta, 1); renderPeriodCalendar(); }
function showDayTooltip(e, dateStr, text) {
  hideDayTooltip();
  const bubble = document.createElement("div");
  bubble.className = "period-day-tooltip"; bubble.id = "day-tooltip"; bubble.textContent = text;
  e.currentTarget.appendChild(bubble);
}
function hideDayTooltip() { const b = el("day-tooltip"); if (b) b.remove(); }
function selectPeriodDate(dateStr) {
  const days = Math.max(1, Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000) + 1);
  periodState = { mode: "custom", label: `с ${dateStr} по сегодня`, days };
  closePeriodPanel(); render();
}

// --- SVG-график: точки + линия тренда + персентиль (п.11, п.12) ---
function svgLineChart({ points, trendPoints, refValue, refLabel, formatX, height = 160, width = 640 }) {
  if (!points || !points.length) return `<p style="color:var(--color-text-muted)">Нет данных для графика.</p>`;
  const values = points.map(p => p.value).concat(trendPoints ? trendPoints.map(p => p.value) : []).concat(refValue != null ? [refValue] : []);
  const min = Math.min(...values) - 3, max = Math.max(...values) + 3;
  const padL = 36, padB = 20, padT = 10, padR = 10;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const xFor = i => padL + (i / Math.max(1, points.length - 1)) * plotW;
  const yFor = v => padT + plotH - ((v - min) / (max - min)) * plotH;
  const linePath = pts => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`).join(" ");
  const refY = refValue != null ? yFor(refValue) : null;
  const xLabels = [0, Math.floor(points.length / 2), points.length - 1].map(i => ({ x: xFor(i), label: formatX(points[i].ts) }));
  return `<div class="chart-svg-wrap"><svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="var(--color-border)" />
    <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" stroke="var(--color-border)" />
    ${refY != null ? `<line x1="${padL}" y1="${refY.toFixed(1)}" x2="${width - padR}" y2="${refY.toFixed(1)}" stroke="var(--color-yellow)" stroke-dasharray="4 3" />
      <text x="${width - padR}" y="${(refY - 4).toFixed(1)}" font-size="10" fill="var(--color-yellow)" text-anchor="end">${refLabel}</text>` : ""}
    <path d="${linePath(points)}" fill="none" stroke="var(--color-accent)" stroke-width="2" />
    ${trendPoints ? `<path d="${linePath(trendPoints)}" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5" stroke-dasharray="5 3" />` : ""}
    ${xLabels.map(l => `<text x="${l.x.toFixed(1)}" y="${height - 4}" font-size="9" fill="var(--color-text-muted)" text-anchor="middle">${l.label}</text>`).join("")}
  </svg></div>
  <div class="chart-legend-row">
    <span class="legend-item"><span class="swatch-line" style="background:var(--color-accent)"></span>Фактическое значение</span>
    ${trendPoints ? `<span class="legend-item"><span class="swatch-line" style="background:var(--color-text-muted)"></span>Тренд (скользящее среднее)</span>` : ""}
    ${refValue != null ? `<span class="legend-item"><span class="swatch-line" style="background:var(--color-yellow)"></span>${refLabel}</span>` : ""}
  </div>`;
}
function formatHourLabel(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2, "0") + ":00 " + String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0"); }
function formatDayLabel(ts) { const d = new Date(ts); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0"); }

// --- Drill-down по KPI-плашке магазина: часовой график с трендом и p95 (п.11) ---
function openKpiDrilldownProper(scopeParams, metric, label) {
  openOverlay(`<div class="drawer">
    <div class="drawer-header"><h2>${label} — почасовой график (${periodState.label})</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <div id="kpi-drawer-body"><div class="skeleton skeleton-line" style="width:90%"></div></div>
  </div>`, "drawer");
  (async () => {
    try {
      const hours = Math.min(periodState.days * 24, 168) || 24;
      const series = await api.getHourlySeries({ metric, hours, ...scopeParams });
      const body = el("kpi-drawer-body");
      if (body) body.innerHTML = svgLineChart({ points: series.points, trendPoints: series.trend, refValue: series.p95, refLabel: `p95 = ${series.p95}%`, formatX: formatHourLabel });
    } catch (e) {
      const body = el("kpi-drawer-body");
      if (body) body.innerHTML = `<p style="color:var(--color-red)">${escapeHtml(e.message)}</p>`;
    }
  })();
}

// --- Drill-down по кассе: история состояний (п.12), доступно для любой роли ---
function openRegisterHistory(registerId) {
  openOverlay(`<div class="drawer">
    <div class="drawer-header"><h2>Касса ${registerId} — история состояний</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <div id="register-history-body"><div class="skeleton skeleton-line" style="width:90%"></div></div>
  </div>`, "drawer");
  (async () => {
    try {
      const data = await api.getRegisterHistory(registerId);
      const body = el("register-history-body");
      const total = Object.values(data.totalsByStatus).reduce((a, b) => a + b, 0) || 1;
      const rows = Object.entries(data.totalsByStatus).sort((a, b) => b[1] - a[1]);
      body.innerHTML = `
        <p style="color:var(--color-text-muted);font-size:13px">Тип: ${data.register.type} · текущее состояние: ${statusBadge(data.register.status)}</p>
        <h3 style="margin-top:16px">Суммарное время по состояниям</h3>
        ${rows.map(([status, minutes]) => barRow(`${(REGISTER_LABELS[status] || REGISTER_LABELS.unknown).ru} (${data.occurrencesByStatus[status]}×)`, Math.round(minutes / 6) / 10, Math.round(total / 6) / 10)).join("")}
        <h3 style="margin-top:16px">Журнал эпизодов</h3>
        <table><thead><tr><th>Состояние</th><th>Начало</th><th class="mono">Длительность</th></tr></thead>
        <tbody>${data.episodes.map(ep => `<tr><td>${statusBadge(ep.status)}</td><td class="mono">${new Date(ep.started_at).toLocaleString("ru-RU")}</td>
          <td class="mono">${ep.ended_at ? formatDuration(ep.duration_minutes) : "продолжается"}</td></tr>`).join("")}</tbody></table>`;
    } catch (e) {
      el("register-history-body").innerHTML = `<p style="color:var(--color-red)">${escapeHtml(e.message)}</p>`;
    }
  })();
}
function formatDuration(minutes) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h} ч ${m} мин` : `${m} мин`;
}
function elapsedSince(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч`;
  return `${Math.floor(h / 24)} дн ${h % 24} ч`;
}

// ---------- Каркас ----------
function renderShell() {
  el("sidebar").innerHTML = `
    <div class="sidebar-brand">${t("brand.name")}<small>${t("brand.subtitle")}</small></div>
    <div class="role-switcher"><div class="role-switcher-label">Роль (демо)</div>
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
  const date = now.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  el2.textContent = `${date} ${time}`;
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
      const [storesList, causes, regions] = await Promise.all([
        api.getStores(scopeParams), api.getTechnicalCauses(), api.getRegionsSummary({ days: periodState.days })
      ]);
      return { storesList, causes, regions: currentRole === "rd" ? regions.filter(r => r.region === RD_REGION) : regions };
    },
    ({ storesList, causes, regions }) => {
      const availability = avg(storesList.map(s => s.availability_pct));
      const scoShare = avg(storesList.map(s => s.sco_share_pct));
      const attention = storesList.filter(s => s.outlier);
      const scoCauses = causes.filter(c => c.applies_to !== "POS");
      const posCauses = causes.filter(c => c.applies_to === "POS");
      const scoTotal = scoCauses.reduce((a, c) => a + c.hours, 0);
      const posTotal = posCauses.reduce((a, c) => a + c.hours, 0);

      return `
        <div class="section"><h3>Общая информация</h3>
        <div class="grid grid-kpi">
          ${kpiCard({ label: t("kpi.availability"), value: availability.toFixed(0) + "%", sub: "норматив > 90%",
            cls: kpiClassFor(availability, 90, "higher-better"), onClick: "nav('availability')" })}
          ${kpiCard({ label: t("kpi.sco_share"), value: scoShare.toFixed(0) + "%", sub: "норматив > 30%",
            cls: kpiClassFor(scoShare, 30, "higher-better"), onClick: "nav('potential')" })}
          ${kpiCard({ label: "Магазинов на контроле", value: attention.length + " из " + storesList.length, sub: "требуют внимания", cls: attention.length ? "kpi-warn" : "kpi-good" })}
        </div></div>

        <div class="section"><div class="section-header"><h2>Регионы — состояние и тренд за ${periodState.label.toLowerCase()}</h2></div>
          <div class="card"><table><thead><tr><th>Регион</th><th>Магазинов</th><th class="mono">Доступность</th><th class="mono">Тренд</th><th class="mono">Доля SCO</th><th class="mono">Тренд</th></tr></thead>
          <tbody>${regions.map(r => `<tr class="clickable-row region-row" onclick="filterState.networkRegion='${r.region}'; renderNetworkDashboard()">
            <td>${r.region}</td><td class="mono">${r.storeCount}</td>
            <td class="mono">${r.availability_pct}%</td><td>${trendArrow(r.availability_trend)}</td>
            <td class="mono">${r.sco_share_pct}%</td><td>${trendArrow(r.sco_share_trend)}</td>
          </tr>`).join("")}</tbody></table></div>
        </div>

        <div class="section"><h3>Информация КСО (SCO)</h3><div class="card">${scoCauses.map(c => barRow(c.cause + (c.note ? " ⓘ" : ""), c.hours, scoTotal)).join("")}</div></div>
        <div class="section"><h3>Информация POS</h3><div class="card">${posCauses.length ? posCauses.map(c => barRow(c.cause, c.hours, posTotal)).join("") : `<p style="color:var(--color-text-muted)">Нет данных по причинам POS.</p>`}</div></div>

        <div class="section"><div class="section-header"><h2>Проблемы: магазины, требующие внимания</h2><a onclick="nav('outliers')">Все аутсайдеры →</a></div>
          ${renderStoreQuickFilters("SCR-01")}
          <div class="card">${renderSortableStoreTable(applyQuickFilter(attention.filter(s => !filterState.networkRegion || s.region === filterState.networkRegion), "SCR-01"), "SCR-01")}</div>
        </div>`;
    });
}
function exportNetworkCsv() {
  api.getStores(scopeParamsForRole()).then(list => exportCsv("set-network-stores.csv", list.map(s => ({
    Магазин: s.number, Название: s.name, Регион: s.region, Формат: s.format, Директор: s.director_name,
    Доступность: s.availability_pct, ДоляSCO: s.sco_share_pct, ПотенциалSCO: s.potential_sco_pct, Аутсайдер: s.outlier ? outlierLabel(s.reason) : "нет"
  }))));
}

// --- Общая таблица магазинов: сортировка по всем столбцам + быстрые фильтры (п.9, п.10) ---
function renderStoreQuickFilters(screenId) {
  const current = quickFilter[screenId];
  const btn = (key, labelKey) => `<button class="${current === key ? "active" : ""}" onclick="setQuickFilter('${screenId}','${key}')">${t(labelKey)}</button>`;
  return `<div class="quick-filters">${btn("worst", "action.worst_first")}${btn("best", "action.best_first")}${btn("low_availability", "action.low_availability")}${btn("low_sco", "action.low_sco")}${btn("high_potential", "action.high_potential")}</div>`;
}
function setQuickFilter(screenId, key) {
  quickFilter[screenId] = quickFilter[screenId] === key ? null : key;
  ({ "SCR-01": renderNetworkDashboard, "SCR-02": renderOutliers })[screenId]();
}
function applyQuickFilter(list, screenId) {
  // Быстрый фильтр одновременно задает состояние сортировки таблицы (sortState), иначе оно
  // перезатиралось бы дефолтной сортировкой renderSortableStoreTable по клику на заголовок столбца.
  const key = quickFilter[screenId];
  let result = [...list];
  if (key === "worst") sortState[screenId] = { col: "availability_pct", dir: 1 };
  else if (key === "best") sortState[screenId] = { col: "availability_pct", dir: -1 };
  else if (key === "low_availability") { result = result.filter(s => s.availability_pct < 90); sortState[screenId] = { col: "availability_pct", dir: 1 }; }
  else if (key === "low_sco") { result = result.filter(s => s.sco_share_pct < 30); sortState[screenId] = { col: "sco_share_pct", dir: 1 }; }
  else if (key === "high_potential") sortState[screenId] = { col: "potential_sco_pct", dir: -1 };
  return result;
}
function renderSortableStoreTable(list, screenId) {
  const sort = sortState[screenId] || { col: "availability_pct", dir: 1 };
  const sorted = [...list].sort((a, b) => (a[sort.col] > b[sort.col] ? 1 : a[sort.col] < b[sort.col] ? -1 : 0) * sort.dir);
  const arrow = col => (sortState[screenId] && sortState[screenId].col === col) ? (sortState[screenId].dir === 1 ? "▲" : "▼") : "";
  const th = (col, label) => `<th class="sortable" onclick="sortStoreTable('${screenId}','${col}')">${label} <span class="sort-arrow">${arrow(col)}</span></th>`;
  return `<table><thead><tr>
    ${th("number", "Магазин")}${th("region", "Регион")}${th("format", "Формат")}${th("director_name", "Директор")}
    ${th("availability_pct", "Доступность")}${th("sco_share_pct", "Доля SCO")}${th("potential_sco_pct", "Потенциал перетока")}<th>Причина</th></tr></thead>
    <tbody>${sorted.map(s => `<tr class="clickable-row" onclick="nav('store/${s.id}')">
      <td>${s.number} «${s.name}»</td><td>${s.region}</td><td>${s.format}</td><td>${s.director_name}</td>
      <td class="mono">${s.availability_pct}%</td><td class="mono">${s.sco_share_pct}%</td><td class="mono">+${s.potential_sco_pct}%</td>
      <td><span class="badge badge-warn">${s.outlier ? outlierLabel(s.reason) : "—"}</span></td>
    </tr>`).join("") || `<tr><td colspan="8">Нет магазинов по заданным фильтрам.</td></tr>`}</tbody></table>`;
}
function sortStoreTable(screenId, col) {
  const s = sortState[screenId] || { col, dir: 1 };
  sortState[screenId] = { col, dir: s.col === col ? -s.dir : 1 };
  ({ "SCR-01": renderNetworkDashboard, "SCR-02": renderOutliers })[screenId]();
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
        <div class="filter-bar"><div><label>Регион</label><select onchange="filterState['SCR-02'].region=this.value; renderOutliers()">
          <option value="all">Все</option>${regions.map(r => `<option value="${r}" ${fs.region === r ? "selected" : ""}>${r}</option>`).join("")}</select></div></div>
        ${renderStoreQuickFilters("SCR-02")}
        <div class="card">${renderSortableStoreTable(list, "SCR-02")}</div>`;
    });
}

// ================= SCR-03: Карточка магазина =================
function renderStoreCard(storeId) {
  // п.2: не дублировать контекст — для ДМ показываем только "Магазин №X", для ОД/РД — единственная
  // ступень пути (уровень + название магазина), без повторения одного и того же контекста дважды.
  renderTopbar(currentRole !== "dm" ? [{ label: scopeCrumb().label, route: "network" }, { label: `Магазин ${storeId}` }] : [{ label: `Магазин №${storeId}` }]);
  const content = el("content");
  content.innerHTML = `<div id="scr03-header"></div><div id="scr03-body"></div>`;
  withState("SCR-03", el("scr03-body"),
    async () => { const store = await api.getStore(storeId); const tasks = await api.getTasks(storeId); return { store, tasks }; },
    ({ store, tasks }) => {
      if (currentRole !== "dm") renderTopbar([{ label: scopeCrumb().label, route: "network" }, { label: `${store.number} «${store.name}»` }]);
      else renderTopbar([{ label: `${store.number} «${store.name}»` }]);
      el("scr03-header").innerHTML = `<div class="section-header"><h1>${store.number} «${store.name}» <span style="font-weight:400;color:var(--color-text-muted);font-size:14px">— ${store.region}, ${store.format} · директор: ${store.director_name}</span></h1></div>`;
      const s = store.settings;
      const scopeParams = { scope: "store", storeId: store.id };
      return `
        <div class="grid grid-kpi">
          ${kpiCard({ label: t("kpi.availability"), value: store.availability_pct + "%", sub: "норматив > " + s.availability_norm + "%",
            cls: kpiClassFor(store.availability_pct, s.availability_norm, "higher-better"), onClick: `openKpiDrilldownProper(${JSON.stringify(scopeParams).replace(/"/g, "&quot;")}, 'availability', '${t("kpi.availability")}')` })}
          ${kpiCard({ label: t("kpi.sco_share"), value: store.sco_share_pct + "%", sub: "норматив > " + s.sco_share_norm + "%",
            cls: kpiClassFor(store.sco_share_pct, s.sco_share_norm, "higher-better"), onClick: `openKpiDrilldownProper(${JSON.stringify(scopeParams).replace(/"/g, "&quot;")}, 'sco_share', '${t("kpi.sco_share")}')` })}
          ${kpiCard({ label: t("kpi.sco_load"), value: store.sco_load_week + " чек/нед", sub: "норматив " + s.sco_weekly_norm, cls: store.sco_load_week < s.sco_weekly_norm ? "kpi-info" : "kpi-good" })}
          ${kpiCard({ label: t("kpi.pos_load"), value: store.pos_load_week + " чек/нед", sub: "норматив " + s.pos_weekly_norm, cls: store.pos_load_week > s.pos_upper_overload ? "kpi-bad" : "kpi-good" })}
        </div>
        <p style="color:var(--color-text-muted);font-size:12px">Клик по плашке «Доступность»/«Доля чеков КСО» открывает почасовой график с трендом и p95 за ${periodState.label.toLowerCase()}.</p>
        <div class="section"><div class="section-header"><h2>Кассы магазина</h2></div><div class="card">
          <table><thead><tr><th>Касса</th><th>Тип</th><th>Состояние</th>
            <th class="mono">p95, сек <span class="info-tip">i<span class="info-tip-bubble">${t("kpi.p95_tooltip")}</span></span></th><th class="mono">Утилизация</th></tr></thead>
          <tbody>${store.registers.map(r => `<tr class="clickable-row" onclick="openRegisterHistory('${r.id}')"><td class="mono">${r.id}</td><td>${r.type}</td>
            <td>${statusBadge(r.status)}${r.status === "no_connection" && r.is_available ? ' <span class="badge badge-info">офлайн, но доступна</span>' : ""}</td>
            <td class="mono">${r.p95_seconds ?? "—"}</td><td class="mono">${r.utilization_pct}%</td></tr>
            ${r.note ? `<tr><td></td><td colspan="4" style="color:var(--color-text-muted);font-size:12px;padding-top:0">${r.note}</td></tr>` : ""}`).join("")}</tbody></table>
          <p style="color:var(--color-text-muted);font-size:12px;margin-top:8px">Клик по строке кассы открывает историю состояний: сколько времени и как часто касса была в каждом статусе.</p>
        </div></div>
        <div class="section"><div class="section-header"><h2>Задачи по магазину</h2>${currentRole !== "dm" ? `<button class="btn btn-primary" onclick="openCreateTaskModal('${store.id}')">${t("action.create_task")}</button>` : ""}</div>
          <div class="card">${tasks.length ? tasks.map(taskRow).join("") : `<p style="color:var(--color-text-muted)">Активных задач по магазину нет.</p>`}</div></div>`;
    });
}
function taskRow(tk) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--color-border)">
    <div><div style="font-weight:600">${escapeHtml(tk.title)}</div><div style="font-size:12px;color:var(--color-text-muted)">${escapeHtml(tk.target_kpi)} · срок ${new Date(tk.due_at).toLocaleString("ru-RU")} · исполнитель: ${escapeHtml(tk.assignee)}</div>
    <div class="task-elapsed">В работе: ${elapsedSince(tk.created_at)}</div></div>
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
        return { type, p95, norm: settings.effective["p95_" + type.toLowerCase()] };
      });
      const problems = allRegs.filter(r => r.p95_seconds && r.p95_seconds > settings.effective["p95_" + r.type.toLowerCase()] * 1.05);
      return `
        <div class="grid grid-kpi">${byType.map(b => kpiCard({ label: `p95 ${b.type}`, value: b.p95 + " сек", sub: "норматив " + b.norm + " сек", cls: kpiClassFor(b.norm, b.p95, "higher-better"), tooltip: t("kpi.p95_tooltip") })).join("")}</div>
        <div class="section"><div class="section-header"><h2>Проблемные кассы</h2></div>
          <div class="card"><table><thead><tr><th>Магазин</th><th>Касса</th><th>Тип</th><th class="mono">p95, сек</th></tr></thead>
          <tbody>${problems.map(r => `<tr class="clickable-row" onclick="openRegisterHistory('${r.id}')"><td>${r.storeName}</td><td class="mono">${r.id}</td><td>${r.type}</td><td class="mono">${r.p95_seconds}</td></tr>`).join("") || `<tr><td colspan="4">Проблемных касс не обнаружено.</td></tr>`}</tbody></table></div></div>`;
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
      return `
        <div class="grid grid-kpi">${kpiCard({ label: "Фактическая доля SCO", value: scoShare.toFixed(0) + "%", cls: "kpi-info" })}${kpiCard({ label: "Потенциал перевода на SCO", value: potential.toFixed(0) + "%", sub: "чеки ≤10 товаров, безнал на POS", cls: "kpi-warn" })}</div>
        <div class="section"><div class="section-header"><h2>Фактическое соотношение POS/SCO</h2></div><div class="card">
          <div class="stacked-bar"><span style="width:${100 - scoShare}%;background:var(--color-accent)"></span><span style="width:${scoShare}%;background:var(--color-green)"></span></div>
          <div class="legend"><span class="legend-item"><span class="swatch" style="background:var(--color-accent)"></span>POS ${(100 - scoShare).toFixed(0)}%</span>
          <span class="legend-item"><span class="swatch" style="background:var(--color-green)"></span>SCO ${scoShare.toFixed(0)}%</span></div></div></div>
        <div class="section"><div class="section-header"><h2>Магазины по потенциалу перетока</h2></div>
          ${renderStoreQuickFilters("SCR-05-hint")}
          <div class="card">${renderSortableStoreTable([...storesList].sort((a, b) => b.potential_sco_pct - a.potential_sco_pct), "SCR-05")}</div></div>`;
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
      return `
        <div class="scope-banner out-of-scope">Экран объединяет прежний отдельный отчет технических причин (SCR-10) — общий для всех ролей. Офлайн-режим («Нет связи») сам по себе не считается недоступностью.</div>
        <div class="grid grid-kpi">${kpiCard({ label: t("kpi.availability"), value: availability.toFixed(0) + "%", sub: "норматив > 90%", cls: kpiClassFor(availability, 90, "higher-better") })}${kpiCard({ label: "Магазинов ниже норматива", value: list.filter(s => s.availability_pct < 90).length, cls: "kpi-warn" })}</div>
        <div class="section"><div class="section-header"><h2>Технические причины простоя (часы)</h2></div><div class="card">${scoCauses.map(c => barRow(c.cause + (c.note ? " ⓘ" : ""), c.hours, scoTotal)).join("")}</div></div>
        <div class="section"><div class="section-header"><h2>TOP аутсайдеров по доступности</h2></div>
          <div class="card"><table><thead><tr><th>Магазин</th><th class="mono">Доступность</th></tr></thead>
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
      const posUtil = avg(allRegs.filter(r => r.type === "POS").map(r => r.utilization_pct));
      const scoUtil = avg(allRegs.filter(r => r.type === "SCO").map(r => r.utilization_pct));
      const outliers = [...allRegs].sort((a, b) => a.utilization_pct - b.utilization_pct).slice(0, 5);
      return `
        <div class="scope-banner out-of-scope">Пороги нагрузки — настраиваемый параметр из отдельного приложения настроек, не фиксированное значение.</div>
        <div class="grid grid-kpi">${kpiCard({ label: "Утилизация POS", value: posUtil.toFixed(0) + "%", cls: "kpi-info" })}${kpiCard({ label: "Утилизация SCO", value: scoUtil.toFixed(0) + "%", cls: "kpi-info" })}</div>
        <div class="section"><div class="section-header"><h2>TOP аутсайдеров по утилизации</h2></div>
          <div class="card"><table><thead><tr><th>Магазин</th><th>Касса</th><th>Тип</th><th class="mono">Утилизация</th></tr></thead>
          <tbody>${outliers.map(r => `<tr class="clickable-row" onclick="openRegisterHistory('${r.id}')"><td>${r.storeName}</td><td class="mono">${r.id}</td><td>${r.type}</td><td class="mono">${r.utilization_pct}%</td></tr>`).join("")}</tbody></table></div></div>`;
    });
}

// ================= SCR-09: Задачи (MVP1 теперь — п.13/19) =================
function renderTasks() {
  renderTopbar([scopeCrumb(), { label: t("nav.tasks") }]);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.tasks")}</h1>
    ${currentRole !== "dm" ? `<button class="btn btn-primary" onclick="openCreateTaskModal(null)">${t("action.create_task")}</button>` : ""}</div>
    <div id="scr09-body"></div>`;
  withState("SCR-09", el("scr09-body"), () => api.getTasks(),
    (tasksList) => {
      const cols = [["new", "Новая"], ["in_progress", "В работе"], ["done", "Выполнено"]];
      return `<div class="kanban">${cols.map(([status, label]) => `
        <div class="kanban-col" data-status="${status}"><div class="kanban-col-title"><span>${label}</span><span>${tasksList.filter(x => x.status === status).length}</span></div>
        ${tasksList.filter(x => x.status === status).map(taskCard).join("")}</div>`).join("")}</div>`;
    });
}
function taskCard(tk) {
  return `<div class="task-card" draggable="true" data-id="${tk.id}"><div class="task-title">${escapeHtml(tk.title)}</div>
    <div class="task-meta"><span>Магазин ${tk.store_id}</span><span>срок: ${new Date(tk.due_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></div>
    <div class="task-meta"><span>${escapeHtml(tk.assignee)}</span></div>
    <div class="task-elapsed">Ожидает: ${elapsedSince(tk.created_at)}</div>
    ${tk.escalated ? `<div class="task-escalated">Эскалировано: ${tk.escalated_to}</div>` : ""}
    <div style="margin-top:8px;display:flex;gap:6px">
      ${tk.status !== "done" ? `<button class="btn btn-sm" onclick="advanceTask('${tk.id}', '${tk.status}')">${t("action.complete")}</button>` : ""}
      ${tk.status !== "done" ? `<button class="btn btn-sm" onclick="escalateTask('${tk.id}')">${t("action.escalate")}</button>` : ""}</div></div>`;
}
function statusLabel(s) { return { new: "Новая", in_progress: "В работе", done: "Выполнено" }[s]; }
function statusBadgeClass(s) { return { new: "badge-info", in_progress: "badge-warn", done: "badge-ok" }[s]; }
async function advanceTask(id, currentStatus) {
  const next = currentStatus === "new" ? "in_progress" : "done";
  try { await api.updateTaskStatus(id, next); toast(next === "done" ? "Задача выполнена" : "Задача переведена в работу"); renderTasks(); }
  catch (e) { toast("Ошибка: " + e.message); }
}
async function escalateTask(id) {
  try { const tk = await api.escalateTask(id); toast(t("toast.task_escalated") + ": " + tk.escalated_to); renderTasks(); }
  catch (e) { toast("Ошибка: " + e.message); }
}
function initKanbanDnD() {
  document.querySelectorAll(".task-card").forEach(card => card.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", card.dataset.id)));
  document.querySelectorAll(".kanban-col").forEach(col => {
    col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async e => {
      e.preventDefault(); col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      try { await api.updateTaskStatus(id, col.dataset.status); renderTasks(); } catch (err) { toast("Ошибка: " + err.message); }
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
        <div class="field"><label>Магазин</label><select id="tf-store" onchange="onTaskFormStoreChange()">
          ${taskFormStores.map(s => `<option value="${s.id}" ${s.id === preselected ? "selected" : ""}>${s.number} «${s.name}»</option>`).join("")}</select></div>
        <div class="field"><label>Касса (необязательно)</label><select id="tf-register"><option value="">— не привязано —</option>
          ${registers.map(r => `<option value="${r.id}">${r.id} (${r.type})</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Исполнитель</label><input type="text" id="tf-assignee" value="${store ? store.director_name + " (директор магазина " + store.number + ")" : ""}" readonly style="background:var(--color-bg)"></div>
      <div class="field"><label>Заголовок задачи</label><input type="text" id="tf-title" placeholder="Например: 087-S1 — заменить чековую ленту"></div>
      <div class="field"><label>Целевой результат (KPI)</label><input type="text" id="tf-kpi" placeholder="Например: доступность SCO №1 ≥ 90%">
        <div class="form-help">Опишите измеримый результат, по которому система (в реальном продукте) сможет автоматически проверить, выполнена ли задача.</div></div>
      <div class="field"><label>Срок выполнения</label><input type="datetime-local" id="tf-due" value="${nowPlus(60)}">
        <div class="quick-time-btns"><button type="button" onclick="setTaskDueQuick(5)">+5 мин</button><button type="button" onclick="setTaskDueQuick(30)">+30 мин</button><button type="button" onclick="setTaskDueQuick(60)">+60 мин</button></div></div>
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
  el("tf-register").innerHTML = `<option value="">— не привязано —</option>${detail.registers.map(r => `<option value="${r.id}">${r.id} (${r.type})</option>`).join("")}`;
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
    <div class="field"><label>Касса</label><input type="text" id="ticket-reg" placeholder="Например: 087-S1"></div>
    <div class="field"><label>Описание неисправности</label><textarea id="ticket-desc" rows="3" placeholder="Ошибка банка при оплате"></textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn" onclick="closeOverlay()">${t("action.cancel")}</button>
      <button class="btn btn-primary" onclick="submitTicket()">${t("action.save")}</button></div></div>`);
}
async function submitTicket() {
  try { await api.createTicket({ registerId: el("ticket-reg").value, description: el("ticket-desc").value }); closeOverlay(); toast(t("toast.ticket_created")); }
  catch (e) { toast("Ошибка: " + e.message); }
}

// ================= SCR-11 =================
function renderDiagnostics() {
  renderTopbar([{ label: t("nav.diagnostics") }]);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.diagnostics")}</h1></div>
    <div class="scope-banner out-of-scope">«Полный доступ» включает коммерческие метрики (выручка, доля SCO).</div>
    <div class="filter-bar"><div><label>Поиск по кассе/магазину</label><input type="text" id="diag-search" oninput="renderDiagnostics()" value="${filterState.diag || ""}"></div></div><div id="scr11-body"></div>`;
  const search = el("diag-search") ? el("diag-search").value : "";
  filterState.diag = search;
  withState("SCR-11", el("scr11-body"), () => api.getDiagnostics(search),
    (rows) => `<div class="card"><table><thead><tr><th>Магазин</th><th>Касса</th><th>Состояние</th><th class="mono">Выручка/нед</th><th class="mono">Доля SCO</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="clickable-row" onclick="openRegisterHistory('${r.id}')"><td>${r.store_label}</td><td class="mono">${r.id}</td><td>${statusBadge(r.status)}</td><td class="mono">${r.revenue_week.toLocaleString("ru-RU")} ₽</td><td class="mono">${r.sco_share_pct}%</td></tr>`).join("")}</tbody></table></div>`);
}

// ================= SCR-12 =================
function renderProductAnalytics() {
  renderTopbar([{ label: t("nav.product_analytics") }]);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.product_analytics")}</h1></div><div id="scr12-body"></div>`;
  withState("SCR-12", el("scr12-body"), () => api.getUsage(),
    (usage) => { const max = Math.max(...usage.map(u => u.opens)); return `<div class="card">${usage.map(u => barRow(u.report, u.opens, max)).join("")}</div>`; });
}

// ================= SCR-13 =================
const ADVISOR_SUGGESTIONS = ["Что сегодня мешает эффективности магазина?", "Почему выросли очереди?", "Почему доля КСО ниже ожидаемой?"];
let chatMessages = [];
function renderAdvisor() {
  renderTopbar([{ label: t("nav.advisor") }]);
  el("content").innerHTML = `<div class="section-header"><h1>${t("nav.advisor")}</h1></div>
    <div class="scope-banner mvp2">Включено в визуальный прототип по решению Product Manager — статус в дорожной карте продукта открыт.</div>
    <div class="chat-panel card">
      <div class="chat-suggestions">${ADVISOR_SUGGESTIONS.map(q => `<button onclick="askAdvisor('${q.replace(/'/g, "\\'")}')">${q}</button>`).join("")}</div>
      <div class="chat-messages" id="chat-messages">${chatMessages.map(chatBubble).join("") || `<p style="color:var(--color-text-muted)">Задайте вопрос — например, «${ADVISOR_SUGGESTIONS[0]}».</p>`}</div>
      <div class="chat-input-row"><input type="text" id="chat-input" placeholder="Задайте вопрос..." onkeydown="if(event.key==='Enter') askAdvisorFromInput()">
        <button class="btn btn-primary" onclick="askAdvisorFromInput()">${t("action.send")}</button></div></div>`;
}
function chatBubble(m) {
  if (m.role === "user") return `<div class="chat-msg user">${escapeHtml(m.text)}</div>`;
  const a = m.text;
  return `<div class="chat-msg assistant"><p><strong>${a.conclusion}</strong></p>${a.facts.map(f => `<div class="fact-card">• ${f}</div>`).join("")}
    <p style="margin-top:8px">Гипотеза: <strong>${a.hypothesis.name}</strong> (уверенность ${(a.hypothesis.confidence * 100).toFixed(0)}%)</p>
    ${a.recommendations.length ? `<p>Рекомендации:</p><ul>${a.recommendations.map(r => `<li>${r}</li>`).join("")}</ul>` : ""}
    <p><a onclick="nav('store/404')">→ Открыть карточку магазина №404 (пример)</a></p></div>`;
}
function askAdvisorFromInput() { askAdvisor(el("chat-input").value); }
async function askAdvisor(question) {
  if (!question || !question.trim()) return;
  chatMessages.push({ role: "user", text: question });
  try { const answer = await api.askAdvisor(question); chatMessages.push({ role: "assistant", text: answer }); }
  catch (e) { chatMessages.push({ role: "assistant", text: { conclusion: "Ошибка запроса к серверу.", facts: [e.message], hypothesis: { name: "—", confidence: 0 }, recommendations: [] } }); }
  renderAdvisor();
  setTimeout(() => { const box = el("chat-messages"); if (box) box.scrollTop = box.scrollHeight; }, 0);
}

// ---------- Инициализация ----------
window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
  periodState.label = t("action.last7d");
  if (!location.hash) location.hash = currentRole === "dm" ? `#/store/${DM_STORE_ID}` : "#/network";
  render();
});
