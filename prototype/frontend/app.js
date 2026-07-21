/* Прототип «Set — Эффективность зоны расчета»: тот же интерфейс, что и visual-prototype/,
   но данные идут через реальный REST API (api.js) в SQLite, а не из встроенных JS-объектов. */

let currentRole = localStorage.getItem("set_role") || "od";
const RD_REGION = "Москва-Восток";
const DM_STORE_ID = "404";
let screenStateOverride = {}; // форсированный демо-показ состояния экрана (не зависит от реального ответа сети)
let sortState = {};
let filterState = {};
let renderToken = 0; // защита от гонок: игнорировать устаревшие ответы fetch после смены маршрута

function setRole(role) {
  currentRole = role;
  localStorage.setItem("set_role", role);
  if (role === "dm") location.hash = `#/store/${DM_STORE_ID}`;
  else location.hash = "#/network";
  render();
}
function regionForRole() { return currentRole === "rd" ? RD_REGION : null; }
function scopeLabel() {
  if (currentRole === "od") return "Вся сеть";
  if (currentRole === "rd") return `Регион: ${RD_REGION}`;
  return `Магазин ${DM_STORE_ID}`;
}

const NAV_ITEMS = [
  { id: "SCR-01", route: "network", key: "nav.network", roles: ["od", "rd"] },
  { id: "SCR-02", route: "outliers", key: "nav.outliers", roles: ["od", "rd"] },
  { id: "SCR-04", route: "performance", key: "nav.performance", roles: ["od", "rd", "dm"] },
  { id: "SCR-05", route: "potential", key: "nav.potential", roles: ["od", "rd", "dm"] },
  { id: "SCR-06", route: "availability", key: "nav.availability", roles: ["od", "rd", "dm"] },
  { id: "SCR-07", route: "utilization", key: "nav.utilization", roles: ["od", "rd", "dm"] },
  { id: "SCR-09", route: "tasks", key: "nav.tasks", roles: ["od", "rd", "dm"], mvp2: true }
];
const SECONDARY_NAV_ITEMS = [
  { id: "SCR-11", route: "diagnostics", key: "nav.diagnostics" },
  { id: "SCR-12", route: "product-analytics", key: "nav.product_analytics" },
  { id: "SCR-13", route: "advisor", key: "nav.advisor" }
];
function nav(route) { location.hash = "#/" + route; }
function currentRoute() { return location.hash.replace(/^#\//, "") || "network"; }
function el(id) { return document.getElementById(id); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function kpiClassFor(value, target, direction) {
  const ratio = direction === "higher-better" ? value / target : target / value;
  if (ratio >= 1) return "kpi-good";
  if (ratio >= 0.85) return "kpi-warn";
  return "kpi-bad";
}
function kpiCard(label, value, sub, cls) {
  return `<div class="card kpi-card ${cls || ""}"><div class="kpi-label">${label}</div><div class="kpi-value mono">${value}</div>${sub ? `<div class="kpi-delta">${sub}</div>` : ""}</div>`;
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
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
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

function stateSelectorHtml(screenId, allowed) {
  const current = screenStateOverride[screenId] || "auto";
  const opts = [`<option value="auto" ${current === "auto" ? "selected" : ""}>авто (реальный запрос)</option>`]
    .concat(allowed.map(s => `<option value="${s}" ${s === current ? "selected" : ""}>${t("state." + s)} (демо)</option>`));
  return `<select class="state-select" onchange="setScreenState('${screenId}', this.value)">${opts.join("")}</select>`;
}
function setScreenState(screenId, value) { screenStateOverride[screenId] = value; render(); }

// Оборачивает загрузку экрана: если задан демо-override — показывает его без реального запроса;
// иначе выполняет реальный fetch через loaderFn и обрабатывает настоящие loading/empty/serverError.
async function withState(screenId, contentEl, loaderFn, renderFn, isEmptyFn) {
  const override = screenStateOverride[screenId];
  if (override && override !== "auto") {
    contentEl.innerHTML = renderOverridePanel(override);
    return;
  }
  contentEl.innerHTML = skeletonHtml();
  const myToken = ++renderToken;
  try {
    const data = await loaderFn();
    if (myToken !== renderToken) return; // маршрут сменился, пока грузились данные
    if (isEmptyFn && isEmptyFn(data)) { contentEl.innerHTML = renderOverridePanel("empty"); return; }
    contentEl.innerHTML = renderFn(data);
  } catch (e) {
    if (myToken !== renderToken) return;
    contentEl.innerHTML = renderOverridePanel("serverError", e.message);
  }
}
function skeletonHtml() {
  return `<div class="grid grid-kpi">${[1, 2, 3].map(() => `<div class="skeleton skeleton-kpi"></div>`).join("")}</div>
    <div class="card"><div class="skeleton skeleton-line" style="width:40%"></div><div class="skeleton skeleton-line" style="width:90%"></div><div class="skeleton skeleton-line" style="width:70%"></div></div>`;
}
function renderOverridePanel(kind, message) {
  if (kind === "loading") return skeletonHtml();
  if (kind === "empty") return `<div class="state-panel"><div class="state-icon">—</div><p>Нет данных за выбранный период/фильтр.</p></div>`;
  if (kind === "validationError") return `<div class="state-panel"><div class="state-icon">!</div><p>Форма содержит ошибки — см. поля ниже.</p></div>`;
  return `<div class="state-panel"><div class="state-icon">!</div><p>${message || "Не удалось загрузить данные с сервера."}</p><button class="btn" onclick="render()">Повторить</button></div>`;
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
      <a class="settings-link" href="settings.html" target="_blank">⚙ ${t("nav.settings")}</a></div>`;
}
function roleButton(role) {
  const active = currentRole === role ? "active" : "";
  return `<button class="${active}" onclick="setRole('${role}')">${t("role." + role)}<span class="scope">${t("role." + role + ".scope")}</span></button>`;
}
function navItemHtml(item) {
  const active = currentRoute() === item.route || currentRoute().startsWith(item.route + "/") ? "active" : "";
  return `<div class="nav-item ${active}" onclick="nav('${item.route}')"><span>${t(item.key)}</span>${item.mvp2 ? '<span class="badge-mvp2">MVP2</span>' : ""}</div>`;
}
function renderTopbar(breadcrumb) { el("topbar-breadcrumbs").innerHTML = breadcrumb; el("topbar-scope").textContent = scopeLabel(); }

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

// ================= SCR-01 =================
function renderNetworkDashboard() {
  renderTopbar(`<a onclick="nav('network')">${t("nav.network")}</a>`);
  const content = el("content");
  const scopeParams = currentRole === "rd" ? { scope: "region", region: RD_REGION } : {};
  content.innerHTML = `<div class="section-header"><h1>${t("nav.network")}</h1>
    <div class="topbar-tools">${stateSelectorHtml("SCR-01", ["loading", "empty", "serverError"])}
    <button class="btn" onclick="toast(t('toast.export'))">${t("action.export")}</button></div></div><div id="scr01-body"></div>`;
  withState("SCR-01", el("scr01-body"),
    async () => Promise.all([api.getStores(scopeParams), api.getTechnicalCauses()]),
    ([storesList, causes]) => {
      const availability = avg(storesList.map(s => s.availability_pct));
      const scoShare = avg(storesList.map(s => s.sco_share_pct));
      const attention = storesList.filter(s => s.outlier);
      const causesTotal = causes.reduce((a, c) => a + c.hours, 0);
      const topCauses = [...causes].sort((a, b) => b.hours - a.hours).slice(0, 3);
      return `
        <div class="grid grid-kpi">
          ${kpiCard("Доступность КСО", availability.toFixed(0) + "%", "норматив > 90%", kpiClassFor(availability, 90, "higher-better"))}
          ${kpiCard("Доля чеков КСО", scoShare.toFixed(0) + "%", "норматив > 30%", kpiClassFor(scoShare, 30, "higher-better"))}
          ${kpiCard("Магазинов на контроле", attention.length + " из " + storesList.length, "требуют внимания", attention.length ? "kpi-warn" : "kpi-good")}
        </div>
        <div class="section"><div class="section-header"><h2>Топ причин простоя</h2></div>
          <div class="card">${topCauses.map(c => barRow(c.cause, c.hours, causesTotal)).join("")}</div></div>
        <div class="section"><div class="section-header"><h2>Магазины, требующие внимания</h2><a onclick="nav('outliers')">Все аутсайдеры →</a></div>
          <div class="card"><table><thead><tr><th>Магазин</th><th>Регион</th><th class="mono">Доступность</th><th class="mono">Доля SCO</th><th></th></tr></thead>
          <tbody>${attention.map(s => `<tr class="clickable-row" onclick="nav('store/${s.id}')"><td>${s.number} «${s.name}»</td><td>${s.region}</td>
            <td class="mono">${s.availability_pct}%</td><td class="mono">${s.sco_share_pct}%</td><td><span class="badge badge-warn">${outlierLabel(s.reason)}</span></td></tr>`).join("")
            || `<tr><td colspan="5">Магазинов, требующих внимания, нет.</td></tr>`}</tbody></table></div></div>`;
    });
}

// ================= SCR-02 =================
function renderOutliers() {
  renderTopbar(`<a onclick="nav('network')">${t("nav.network")}</a> / ${t("nav.outliers")}`);
  const content = el("content");
  const fs = filterState["SCR-02"] || { region: "all", cause: "all" };
  filterState["SCR-02"] = fs;
  content.innerHTML = `<div class="section-header"><h1>${t("nav.outliers")}</h1>${stateSelectorHtml("SCR-02", ["loading", "empty", "serverError"])}</div><div id="scr02-body"></div>`;
  const scopeParams = currentRole === "rd" ? { scope: "region", region: RD_REGION } : {};
  withState("SCR-02", el("scr02-body"), () => api.getStores(scopeParams),
    (storesList) => {
      let list = storesList.filter(s => s.outlier);
      if (fs.region !== "all") list = list.filter(s => s.region === fs.region);
      if (fs.cause !== "all") list = list.filter(s => s.reason === fs.cause);
      const sort = sortState.outliers || { col: "availability_pct", dir: 1 };
      list = [...list].sort((a, b) => (a[sort.col] - b[sort.col]) * sort.dir);
      const regions = [...new Set(storesList.map(s => s.region))];
      return `
        <div class="filter-bar">
          <div><label>Регион</label><select onchange="filterState['SCR-02'].region=this.value; renderOutliers()">
            <option value="all">Все</option>${regions.map(r => `<option value="${r}" ${fs.region === r ? "selected" : ""}>${r}</option>`).join("")}</select></div>
          <div><label>Категория причины</label><select onchange="filterState['SCR-02'].cause=this.value; renderOutliers()">
            <option value="all">Все</option>
            <option value="technical" ${fs.cause === "technical" ? "selected" : ""}>Технический фактор</option>
            <option value="business" ${fs.cause === "business" ? "selected" : ""}>Бизнес-фактор</option>
            <option value="utilization" ${fs.cause === "utilization" ? "selected" : ""}>Утилизация</option></select></div>
        </div>
        <div class="card"><table><thead><tr>
          <th class="sortable" onclick="sortOutliers('availability_pct')">Доступность</th><th>Магазин</th><th>Регион</th>
          <th class="sortable" onclick="sortOutliers('sco_share_pct')">Доля SCO</th><th>Причина</th></tr></thead>
        <tbody>${list.map(s => `<tr class="clickable-row" onclick="nav('store/${s.id}')"><td class="mono">${s.availability_pct}%</td><td>${s.number} «${s.name}»</td>
          <td>${s.region}</td><td class="mono">${s.sco_share_pct}%</td><td><span class="badge badge-warn">${outlierLabel(s.reason)}</span></td></tr>`).join("")
          || `<tr><td colspan="5">Нет магазинов по заданным фильтрам.</td></tr>`}</tbody></table></div>`;
    });
}
function sortOutliers(col) { const s = sortState.outliers || { col, dir: 1 }; sortState.outliers = { col, dir: s.col === col ? -s.dir : 1 }; renderOutliers(); }

// ================= SCR-03 =================
function renderStoreCard(storeId) {
  renderTopbar(`${currentRole !== "dm" ? `<a onclick="nav('network')">${t("nav.network")}</a> / ` : ""}Магазин ${storeId}`);
  const content = el("content");
  content.innerHTML = `<div id="scr03-header"></div><div id="scr03-body"></div>`;
  withState("SCR-03", el("scr03-body"),
    async () => { const store = await api.getStore(storeId); const tasks = await api.getTasks(storeId); return { store, tasks }; },
    ({ store, tasks }) => {
      el("scr03-header").innerHTML = `<div class="section-header"><h1>${store.number} «${store.name}» <span style="font-weight:400;color:var(--color-text-muted);font-size:14px">— ${store.region}, ${store.format}</span></h1>${stateSelectorHtml("SCR-03", ["loading", "empty", "validationError", "serverError"])}</div>`;
      const s = store.settings;
      return `
        <div class="grid grid-kpi">
          ${kpiCard("Доступность КСО", store.availability_pct + "%", "норматив > " + s.availability_norm + "%", kpiClassFor(store.availability_pct, s.availability_norm, "higher-better"))}
          ${kpiCard("Доля чеков КСО", store.sco_share_pct + "%", "норматив > " + s.sco_share_norm + "%", kpiClassFor(store.sco_share_pct, s.sco_share_norm, "higher-better"))}
          ${kpiCard("Нагрузка SCO", store.sco_load_week + " чек/нед", "норматив " + s.sco_weekly_norm, store.sco_load_week < s.sco_weekly_norm ? "kpi-info" : "kpi-good")}
          ${kpiCard("Нагрузка POS", store.pos_load_week + " чек/нед", "норматив " + s.pos_weekly_norm, store.pos_load_week > s.pos_upper_overload ? "kpi-bad" : "kpi-good")}
        </div>
        <div class="section"><div class="section-header"><h2>Кассы магазина</h2></div><div class="card">
          <table><thead><tr><th>Касса</th><th>Тип</th><th>Состояние</th><th class="mono">p95, сек</th><th class="mono">Утилизация</th></tr></thead>
          <tbody>${store.registers.map(r => `<tr><td class="mono">${r.id}</td><td>${r.type}</td>
            <td>${statusBadge(r.status)}${r.status === "no_connection" && r.is_available ? ' <span class="badge badge-info">офлайн, но доступна</span>' : ""}</td>
            <td class="mono">${r.p95_seconds ?? "—"}</td><td class="mono">${r.utilization_pct}%</td></tr>
            ${r.note ? `<tr><td></td><td colspan="4" style="color:var(--color-text-muted);font-size:12px;padding-top:0">${r.note}</td></tr>` : ""}`).join("")}</tbody></table></div></div>
        <div class="section"><div class="scope-banner mvp2">Раздел «Задачи по магазину» — MVP2 (подтверждено Product Manager 2026-07-21), не входит в MVP1.</div>
          <div class="section-header"><h2>Задачи по магазину</h2>${currentRole !== "dm" ? `<button class="btn btn-primary" onclick="openCreateTaskModal('${store.id}')">${t("action.create_task")}</button>` : ""}</div>
          <div class="card">${tasks.length ? tasks.map(taskRow).join("") : `<p style="color:var(--color-text-muted)">Активных задач по магазину нет.</p>`}</div></div>`;
    });
}
function taskRow(tk) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--color-border)">
    <div><div style="font-weight:600">${escapeHtml(tk.title)}</div><div style="font-size:12px;color:var(--color-text-muted)">${escapeHtml(tk.target_kpi)} · до ${tk.due_date}</div></div>
    <span class="badge ${statusBadgeClass(tk.status)}">${statusLabel(tk.status)}</span></div>`;
}

// ================= SCR-04 =================
function renderPerformance() {
  renderTopbar(t("nav.performance"));
  const content = el("content");
  const scopeParams = currentRole === "rd" ? { scope: "region", region: RD_REGION } : {};
  content.innerHTML = `<div class="section-header"><h1>${t("nav.performance")}</h1>
    <div class="topbar-tools">${stateSelectorHtml("SCR-04", ["loading", "empty", "serverError"])}
    <button class="btn" onclick="toast(t('toast.export'))">${t("action.export")}</button></div></div><div id="scr04-body"></div>`;
  withState("SCR-04", el("scr04-body"),
    async () => { const list = await api.getStores(scopeParams); const settings = await api.getSettings(regionForRole()); const details = await Promise.all(list.map(s => api.getStore(s.id))); return { details, settings }; },
    ({ details, settings }) => {
      const allRegs = details.flatMap(s => s.registers.map(r => ({ ...r, storeName: `${s.number} «${s.name}»` })));
      const byType = ["POS", "SCO"].map(type => {
        const regs = allRegs.filter(r => r.type === type && r.p95_seconds);
        const p95 = regs.length ? Math.max(...regs.map(r => r.p95_seconds)) : 0;
        return { type, p95, norm: settings.effective["p95_" + type.toLowerCase()] };
      });
      const problems = allRegs.filter(r => r.p95_seconds && r.p95_seconds > settings.effective["p95_" + r.type.toLowerCase()] * 1.05);
      return `
        <div class="grid grid-kpi">${byType.map(b => kpiCard(`p95 ${b.type}`, b.p95 + " сек", "норматив " + b.norm + " сек", kpiClassFor(b.norm, b.p95, "higher-better"))).join("")}</div>
        <div class="section"><div class="section-header"><h2>Проблемные кассы</h2></div>
          <div class="card"><table><thead><tr><th>Магазин</th><th>Касса</th><th>Тип</th><th class="mono">p95, сек</th></tr></thead>
          <tbody>${problems.map(r => `<tr><td>${r.storeName}</td><td class="mono">${r.id}</td><td>${r.type}</td><td class="mono">${r.p95_seconds}</td></tr>`).join("") || `<tr><td colspan="4">Проблемных касс не обнаружено.</td></tr>`}</tbody></table></div></div>`;
    });
}

// ================= SCR-05 =================
function renderPotential() {
  renderTopbar(t("nav.potential"));
  const content = el("content");
  const scopeParams = currentRole === "rd" ? { scope: "region", region: RD_REGION } : {};
  content.innerHTML = `<div class="section-header"><h1>${t("nav.potential")}</h1>${stateSelectorHtml("SCR-05", ["loading", "empty", "serverError"])}</div><div id="scr05-body"></div>`;
  withState("SCR-05", el("scr05-body"), () => api.getStores(scopeParams),
    (storesList) => {
      const scoShare = avg(storesList.map(s => s.sco_share_pct));
      const potential = Math.min(65, scoShare + 22);
      return `
        <div class="grid grid-kpi">${kpiCard("Фактическая доля SCO", scoShare.toFixed(0) + "%", "", "kpi-info")}${kpiCard("Потенциал перевода на SCO", potential.toFixed(0) + "%", "чеки ≤10 товаров, безнал на POS", "kpi-warn")}</div>
        <div class="section"><div class="section-header"><h2>Фактическое соотношение POS/SCO</h2></div><div class="card">
          <div class="stacked-bar"><span style="width:${100 - scoShare}%;background:var(--color-accent)"></span><span style="width:${scoShare}%;background:var(--color-green)"></span></div>
          <div class="legend"><span class="legend-item"><span class="swatch" style="background:var(--color-accent)"></span>POS ${(100 - scoShare).toFixed(0)}%</span>
          <span class="legend-item"><span class="swatch" style="background:var(--color-green)"></span>SCO ${scoShare.toFixed(0)}%</span></div></div></div>`;
    });
}

// ================= SCR-06 =================
function renderAvailability() {
  renderTopbar(t("nav.availability"));
  const content = el("content");
  const scopeParams = currentRole === "rd" ? { scope: "region", region: RD_REGION } : {};
  content.innerHTML = `<div class="section-header"><h1>${t("nav.availability")}</h1>
    <div class="topbar-tools">${stateSelectorHtml("SCR-06", ["loading", "empty", "serverError"])}
    <button class="btn" onclick="toast(t('toast.export'))">${t("action.export")}</button></div></div><div id="scr06-body"></div>`;
  withState("SCR-06", el("scr06-body"),
    async () => { const list = await api.getStores(scopeParams); const causes = await api.getTechnicalCauses(); return { list, causes }; },
    ({ list, causes }) => {
      const availability = avg(list.map(s => s.availability_pct));
      const causesTotal = causes.reduce((a, c) => a + c.hours, 0);
      return `
        <div class="scope-banner out-of-scope">Экран объединяет прежний отдельный отчет технических причин (SCR-10) — общий для всех ролей. Офлайн-режим («Нет связи») сам по себе не считается недоступностью.</div>
        <div class="grid grid-kpi">${kpiCard("Доступность КСО", availability.toFixed(0) + "%", "норматив > 90%", kpiClassFor(availability, 90, "higher-better"))}${kpiCard("Магазинов ниже норматива", list.filter(s => s.availability_pct < 90).length, "", "kpi-warn")}</div>
        <div class="section"><div class="section-header"><h2>Технические причины простоя (часы)</h2><button class="btn btn-sm" onclick="openCreateTicketModal()">${t("action.create_ticket")}</button></div>
          <div class="card">${causes.map(c => barRow(c.cause + (c.note ? " ⓘ" : ""), c.hours, causesTotal)).join("")}</div></div>
        <div class="section"><div class="section-header"><h2>TOP аутсайдеров по доступности</h2></div>
          <div class="card"><table><thead><tr><th>Магазин</th><th class="mono">Доступность</th></tr></thead>
          <tbody>${[...list].sort((a, b) => a.availability_pct - b.availability_pct).slice(0, 5).map(s => `<tr class="clickable-row" onclick="nav('store/${s.id}')"><td>${s.number} «${s.name}»</td><td class="mono">${s.availability_pct}%</td></tr>`).join("")}</tbody></table></div></div>`;
    });
}

// ================= SCR-07 =================
function renderUtilization() {
  renderTopbar(t("nav.utilization"));
  const content = el("content");
  const scopeParams = currentRole === "rd" ? { scope: "region", region: RD_REGION } : {};
  content.innerHTML = `<div class="section-header"><h1>${t("nav.utilization")}</h1>${stateSelectorHtml("SCR-07", ["loading", "empty", "serverError"])}</div><div id="scr07-body"></div>`;
  withState("SCR-07", el("scr07-body"),
    async () => { const list = await api.getStores(scopeParams); const details = await Promise.all(list.map(s => api.getStore(s.id))); return details; },
    (details) => {
      const allRegs = details.flatMap(s => s.registers.map(r => ({ ...r, storeName: `${s.number} «${s.name}»` })));
      const posUtil = avg(allRegs.filter(r => r.type === "POS").map(r => r.utilization_pct));
      const scoUtil = avg(allRegs.filter(r => r.type === "SCO").map(r => r.utilization_pct));
      const outliers = [...allRegs].sort((a, b) => a.utilization_pct - b.utilization_pct).slice(0, 5);
      return `
        <div class="scope-banner out-of-scope">Пороги нагрузки — настраиваемый параметр из отдельного приложения настроек (settings.html), не фиксированное значение.</div>
        <div class="grid grid-kpi">${kpiCard("Утилизация POS", posUtil.toFixed(0) + "%", "", "kpi-info")}${kpiCard("Утилизация SCO", scoUtil.toFixed(0) + "%", "", "kpi-info")}</div>
        <div class="section"><div class="section-header"><h2>TOP аутсайдеров по утилизации</h2></div>
          <div class="card"><table><thead><tr><th>Магазин</th><th>Касса</th><th>Тип</th><th class="mono">Утилизация</th></tr></thead>
          <tbody>${outliers.map(r => `<tr><td>${r.storeName}</td><td class="mono">${r.id}</td><td>${r.type}</td><td class="mono">${r.utilization_pct}%</td></tr>`).join("")}</tbody></table></div></div>`;
    });
}

// ================= SCR-09 =================
function renderTasks() {
  renderTopbar(`${t("nav.tasks")} <span class="badge badge-mvp2-inline" style="margin-left:8px">MVP2</span>`);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.tasks")} <span class="badge badge-mvp2-inline">MVP2</span></h1>
    <div class="topbar-tools">${stateSelectorHtml("SCR-09", ["loading", "empty", "validationError", "serverError"])}
    ${currentRole !== "dm" ? `<button class="btn btn-primary" onclick="openCreateTaskModal(null)">${t("action.create_task")}</button>` : ""}</div></div>
    <div class="scope-banner mvp2">Постановка задач и контроль выполнения — функциональность MVP2. Маршрут эскалации: РД → ОД.</div><div id="scr09-body"></div>`;
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
    <div class="task-meta"><span>${tk.store_id}</span><span>до ${tk.due_date}</span></div><div class="task-meta"><span>${tk.assignee}</span></div>
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
// MutationObserver проще не заводить — переустанавливаем обработчики после каждого рендера канбана.
const _origRenderTasksBody = renderTasks;
renderTasks = function () { _origRenderTasksBody(); setTimeout(initKanbanDnD, 50); };

function openCreateTaskModal(storeId) {
  openOverlay(`<div class="modal"><div class="modal-header"><h2>${t("action.create_task")}</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <form id="task-form" onsubmit="return submitTaskForm(event, '${storeId || ""}')">
      <div class="field"><label>Идентификатор магазина</label><input type="text" id="tf-store" value="${storeId || "404"}"></div>
      <div class="field"><label>Заголовок задачи</label><input type="text" id="tf-title" placeholder="Например: проверить доступность SCO №2"></div>
      <div class="field"><label>Целевой KPI</label><input type="text" id="tf-kpi" placeholder="Например: доступность ≥ 90%"></div>
      <div class="field"><label>Срок</label><input type="date" id="tf-due"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn" onclick="closeOverlay()">${t("action.cancel")}</button>
        <button type="submit" class="btn btn-primary">${t("action.save")}</button></div></form></div>`);
}
async function submitTaskForm(e, storeId) {
  e.preventDefault();
  const title = el("tf-title").value.trim();
  const field = el("tf-title").closest(".field");
  try {
    await api.createTask({ title, storeId: el("tf-store").value, targetKpi: el("tf-kpi").value, dueDate: el("tf-due").value, createdBy: t("role." + currentRole) });
    field.classList.remove("has-error");
    closeOverlay(); toast(t("toast.task_created"));
    if (currentRoute().startsWith("tasks")) renderTasks(); else renderStoreCard(el("tf-store").value);
  } catch (err) {
    field.classList.add("has-error");
    if (!field.querySelector(".field-error")) field.insertAdjacentHTML("beforeend", `<div class="field-error">${escapeHtml(err.message)}</div>`);
  }
  return false;
}
function openCreateTicketModal() {
  openOverlay(`<div class="modal"><div class="modal-header"><h2>${t("action.create_ticket")}</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <p style="color:var(--color-text-muted);font-size:13px">Заявка сохраняется в таблице it_tickets.</p>
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
  renderTopbar(`${t("nav.diagnostics")} <span style="font-size:12px;color:var(--color-text-muted)">— роль: Служба поддержки</span>`);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.diagnostics")}</h1>${stateSelectorHtml("SCR-11", ["loading", "empty", "serverError"])}</div>
    <div class="scope-banner out-of-scope">«Полный доступ» включает коммерческие метрики (выручка, доля SCO).</div>
    <div class="filter-bar"><div><label>Поиск по кассе/магазину</label><input type="text" id="diag-search" oninput="renderDiagnostics()" value="${filterState.diag || ""}"></div></div><div id="scr11-body"></div>`;
  const search = el("diag-search") ? el("diag-search").value : "";
  filterState.diag = search;
  withState("SCR-11", el("scr11-body"), () => api.getDiagnostics(search),
    (rows) => `<div class="card"><table><thead><tr><th>Магазин</th><th>Касса</th><th>Состояние</th><th class="mono">Выручка/нед</th><th class="mono">Доля SCO</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.store_label}</td><td class="mono">${r.id}</td><td>${statusBadge(r.status)}</td><td class="mono">${r.revenue_week.toLocaleString("ru-RU")} ₽</td><td class="mono">${r.sco_share_pct}%</td></tr>`).join("")}</tbody></table></div>`);
}

// ================= SCR-12 =================
function renderProductAnalytics() {
  renderTopbar(`${t("nav.product_analytics")} <span style="font-size:12px;color:var(--color-text-muted)">— роль: Продуктовые команды</span>`);
  const content = el("content");
  content.innerHTML = `<div class="section-header"><h1>${t("nav.product_analytics")}</h1>${stateSelectorHtml("SCR-12", ["loading", "empty", "serverError"])}</div><div id="scr12-body"></div>`;
  withState("SCR-12", el("scr12-body"), () => api.getUsage(),
    (usage) => { const max = Math.max(...usage.map(u => u.opens)); return `<div class="card">${usage.map(u => barRow(u.report, u.opens, max)).join("")}</div>`; });
}

// ================= SCR-13 =================
const ADVISOR_SUGGESTIONS = ["Что сегодня мешает эффективности магазина?", "Почему выросли очереди?", "Почему доля КСО ниже ожидаемой?"];
let chatMessages = [];
function renderAdvisor() {
  renderTopbar(t("nav.advisor"));
  el("content").innerHTML = `<div class="section-header"><h1>${t("nav.advisor")}</h1>${stateSelectorHtml("SCR-13", ["loading", "empty", "serverError"])}</div>
    <div class="scope-banner mvp2">Включено в визуальный прототип по решению Product Manager (2026-07-21) — статус в дорожной карте продукта открыт.</div>
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
  if (!location.hash) location.hash = currentRole === "dm" ? `#/store/${DM_STORE_ID}` : "#/network";
  render();
});
