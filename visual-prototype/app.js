/* Визуальный прототип «Set — Эффективность зоны расчета».
   Кликабельный HTML-интерфейс с локальными взаимодействиями и демонстрационными данными.
   Не подключается к настоящему backend/API/БД — см. ai-artifacts/03-visual-prototype.model.json. */

// ---------- Глобальное состояние демо ----------
let currentRole = localStorage.getItem("set_role") || "od"; // od | rd | dm
const RD_REGION = "Москва-Восток";
const DM_STORE_ID = "404";
let screenStateOverride = {}; // screenId -> 'loading'|'empty'|'success'|'validationError'|'serverError'
let sortState = {}; // tableId -> {col, dir}
let filterState = {}; // screenId -> {region, format, cause}

function setRole(role) {
  currentRole = role;
  localStorage.setItem("set_role", role);
  if (role === "dm") {
    location.hash = `#/store/${DM_STORE_ID}`;
  } else {
    location.hash = "#/network";
  }
  render();
}

function scopedStores() {
  if (currentRole === "od") return STORES;
  if (currentRole === "rd") return STORES.filter(s => s.region === RD_REGION);
  return STORES.filter(s => s.id === DM_STORE_ID);
}

function scopeLabel() {
  if (currentRole === "od") return "Вся сеть";
  if (currentRole === "rd") return `Регион: ${RD_REGION}`;
  const s = STORES.find(s => s.id === DM_STORE_ID);
  return `Магазин ${s.number} «${s.name}»`;
}

// ---------- Навигация ----------
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

function currentRoute() {
  const hash = location.hash.replace(/^#\//, "");
  return hash || "network";
}

// ---------- Утилиты рендеринга ----------
function el(id) { return document.getElementById(id); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function kpiClassFor(value, target, direction) {
  // direction: 'higher-better' (доступность/доля SCO) или 'lower-better' (отклонение производительности)
  const ratio = direction === "higher-better" ? value / target : target / value;
  if (ratio >= 1) return "kpi-good";
  if (ratio >= 0.85) return "kpi-warn";
  return "kpi-bad";
}

function kpiCard(label, value, sub, cls) {
  return `<div class="card kpi-card ${cls || ""}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value mono">${value}</div>
    ${sub ? `<div class="kpi-delta">${sub}</div>` : ""}
  </div>`;
}

function statusBadge(status) {
  const s = REGISTER_STATES[status] || REGISTER_STATES.unknown;
  return `<span class="status-dot ${s.badge}"></span>${s.ru}`;
}

function toast(msg) {
  let host = el("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = msg;
  host.appendChild(item);
  setTimeout(() => item.remove(), 2600);
}

function openOverlay(innerHtml, kind) {
  closeOverlay();
  const overlay = document.createElement("div");
  overlay.className = "overlay" + (kind === "drawer" ? " drawer-overlay" : "");
  overlay.id = "active-overlay";
  overlay.innerHTML = innerHtml;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });
  document.body.appendChild(overlay);
}
function closeOverlay() { const o = el("active-overlay"); if (o) o.remove(); }

// ---------- Демо-переключатель состояния экрана ----------
function stateSelectorHtml(screenId, allowed) {
  const current = screenStateOverride[screenId] || "success";
  const opts = allowed.map(s => `<option value="${s}" ${s === current ? "selected" : ""}>${t("state." + s)}</option>`).join("");
  return `<select class="state-select" onchange="setScreenState('${screenId}', this.value)">${opts}</select>`;
}
function setScreenState(screenId, value) { screenStateOverride[screenId] = value; render(); }

function stateWrapper(screenId, allowed, contentFn) {
  const state = screenStateOverride[screenId] || "success";
  if (state === "loading") {
    return `<div class="grid grid-kpi">${"".padStart(3, "x").split("").map(() => `<div class="skeleton skeleton-kpi"></div>`).join("")}</div>
      <div class="card"><div class="skeleton skeleton-line" style="width:40%"></div><div class="skeleton skeleton-line" style="width:90%"></div><div class="skeleton skeleton-line" style="width:70%"></div></div>`;
  }
  if (state === "empty") {
    return `<div class="state-panel"><div class="state-icon">—</div><p>Нет данных за выбранный период.</p><p>Измените фильтр периода или выберите другой магазин/регион.</p></div>`;
  }
  if (state === "serverError") {
    return `<div class="state-panel"><div class="state-icon">!</div><p>Не удалось загрузить данные (демо ошибки сервера).</p><button class="btn" onclick="render()">Повторить</button></div>`;
  }
  return contentFn();
}

// ---------- Каркас приложения ----------
function renderShell() {
  const sidebar = el("sidebar");
  sidebar.innerHTML = `
    <div class="sidebar-brand">${t("brand.name")}<small>${t("brand.subtitle")}</small></div>
    <div class="role-switcher">
      <div class="role-switcher-label">Роль (демо)</div>
      <div class="role-toggle">
        ${roleButton("od")}
        ${roleButton("rd")}
        ${roleButton("dm")}
      </div>
    </div>
    <nav class="nav">
      ${NAV_ITEMS.filter(i => i.roles.includes(currentRole)).map(navItemHtml).join("")}
    </nav>
    <div class="nav-secondary">
      <div class="nav-secondary-label">${t("nav.other_views")}</div>
      ${SECONDARY_NAV_ITEMS.map(navItemHtml).join("")}
      <a class="settings-link" href="settings.html" target="_blank">⚙ ${t("nav.settings")}</a>
    </div>
  `;
}

function roleButton(role) {
  const active = currentRole === role ? "active" : "";
  return `<button class="${active}" onclick="setRole('${role}')">${t("role." + role)}<span class="scope">${t("role." + role + ".scope")}</span></button>`;
}

function navItemHtml(item) {
  const active = currentRoute() === item.route || currentRoute().startsWith(item.route + "/") ? "active" : "";
  return `<div class="nav-item ${active}" onclick="nav('${item.route}')"><span>${t(item.key)}</span>${item.mvp2 ? '<span class="badge-mvp2">MVP2</span>' : ""}</div>`;
}

function renderTopbar(breadcrumb) {
  el("topbar-breadcrumbs").innerHTML = breadcrumb;
  el("topbar-scope").textContent = scopeLabel();
}

// ---------- Роутер ----------
function render() {
  renderShell();
  const route = currentRoute();
  const [base, param] = route.split("/");
  const content = el("content");

  if (currentRole === "dm" && (base === "network" || base === "outliers")) {
    location.hash = `#/store/${DM_STORE_ID}`;
    return;
  }

  const routes = {
    network: renderNetworkDashboard,
    outliers: renderOutliers,
    store: () => renderStoreCard(param || DM_STORE_ID),
    performance: renderPerformance,
    potential: renderPotential,
    availability: renderAvailability,
    utilization: renderUtilization,
    tasks: renderTasks,
    diagnostics: renderDiagnostics,
    "product-analytics": renderProductAnalytics,
    advisor: renderAdvisor
  };
  const fn = routes[base] || renderNetworkDashboard;
  content.innerHTML = fn();
  attachDeferredHandlers(base);
}

function attachDeferredHandlers(base) {
  if (base === "tasks") initKanbanDnD();
}

// ================= SCR-01: Дашборд сети (Executive View) =================
function renderNetworkDashboard() {
  renderTopbar(`<a onclick="nav('network')">${t("nav.network")}</a>`);
  const stores = scopedStores();
  const settings = getSettings();
  const avgAvailability = avg(stores.map(s => s.availability));
  const avgScoShare = avg(stores.map(s => s.scoShare));
  const attention = stores.filter(s => s.outlier);
  const causesTotal = TECHNICAL_CAUSES_HOURS.reduce((a, c) => a + c.hours, 0);
  const topCauses = [...TECHNICAL_CAUSES_HOURS].sort((a, b) => b.hours - a.hours).slice(0, 3);

  return `
    <div class="section-header"><h1>${t("nav.network")}</h1>
      <div class="topbar-tools">${stateSelectorHtml("SCR-01", ["loading","empty","success","serverError"])}
      <button class="btn" onclick="toast(t('toast.export'))">${t("action.export")}</button></div>
    </div>
    ${stateWrapper("SCR-01", [], () => `
    <div class="grid grid-kpi">
      ${kpiCard("Доступность КСО", avgAvailability.toFixed(0) + "%", "норматив > " + settings.availabilityNorm + "%", kpiClassFor(avgAvailability, settings.availabilityNorm, "higher-better"))}
      ${kpiCard("Доля чеков КСО", avgScoShare.toFixed(0) + "%", "норматив > " + settings.scoShareNorm + "%", kpiClassFor(avgScoShare, settings.scoShareNorm, "higher-better"))}
      ${kpiCard("Магазинов на контроле", attention.length + " из " + stores.length, "требуют внимания", attention.length ? "kpi-warn" : "kpi-good")}
    </div>
    <div class="section">
      <div class="section-header"><h2>Топ причин простоя</h2></div>
      <div class="card">
        ${topCauses.map(c => barRow(c.cause, c.hours, causesTotal)).join("")}
      </div>
    </div>
    <div class="section">
      <div class="section-header"><h2>Магазины, требующие внимания</h2>
        <a onclick="nav('outliers')">Все аутсайдеры →</a></div>
      <div class="card">
        <table><thead><tr><th>Магазин</th><th>Регион</th><th class="mono">Доступность</th><th class="mono">Доля SCO</th><th></th></tr></thead>
        <tbody>${attention.map(s => `<tr class="clickable-row" onclick="nav('store/${s.id}')">
          <td>${s.number} «${s.name}»</td><td>${s.region}</td>
          <td class="mono">${s.availability}%</td><td class="mono">${s.scoShare}%</td>
          <td><span class="badge badge-warn">${outlierLabel(s.outlierReason)}</span></td>
        </tr>`).join("") || `<tr><td colspan="5">Магазинов, требующих внимания, нет.</td></tr>`}</tbody></table>
      </div>
    </div>`)}
  `;
}

function outlierLabel(reason) {
  return { technical: "Технический фактор", business: "Бизнес-фактор", utilization: "Утилизация", "offline-demo": "Офлайн (демо)" }[reason] || "Отклонение";
}

function barRow(label, value, total) {
  const pct = Math.round((value / total) * 100);
  return `<div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${label}</span><span class="mono">${value} ч</span></div>
    <div style="background:var(--color-bg);border-radius:4px;height:8px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--color-accent)"></div></div>
  </div>`;
}
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

// ================= SCR-02: Аутсайдеры =================
function renderOutliers() {
  renderTopbar(`<a onclick="nav('network')">${t("nav.network")}</a> / ${t("nav.outliers")}`);
  const fs = filterState["SCR-02"] || { region: "all", cause: "all" };
  filterState["SCR-02"] = fs;
  let stores = scopedStores().filter(s => s.outlier);
  if (fs.region !== "all") stores = stores.filter(s => s.region === fs.region);
  if (fs.cause !== "all") stores = stores.filter(s => s.outlierReason === fs.cause);
  const sort = sortState["outliers"] || { col: "availability", dir: 1 };
  stores = [...stores].sort((a, b) => (a[sort.col] - b[sort.col]) * sort.dir);
  const regions = [...new Set(scopedStores().map(s => s.region))];

  return `
    <div class="section-header"><h1>${t("nav.outliers")}</h1>${stateSelectorHtml("SCR-02", ["loading","empty","success","serverError"])}</div>
    ${stateWrapper("SCR-02", [], () => `
    <div class="filter-bar">
      <div><label>Регион</label><select onchange="filterState['SCR-02'].region=this.value; render()">
        <option value="all">Все</option>${regions.map(r => `<option value="${r}" ${fs.region === r ? "selected" : ""}>${r}</option>`).join("")}
      </select></div>
      <div><label>Категория причины</label><select onchange="filterState['SCR-02'].cause=this.value; render()">
        <option value="all">Все</option>
        <option value="technical" ${fs.cause === "technical" ? "selected" : ""}>Технический фактор</option>
        <option value="business" ${fs.cause === "business" ? "selected" : ""}>Бизнес-фактор</option>
        <option value="utilization" ${fs.cause === "utilization" ? "selected" : ""}>Утилизация</option>
      </select></div>
    </div>
    <div class="card">
      <table><thead><tr>
        <th class="sortable" onclick="sortOutliers('availability')">Доступность ${sortArrow('availability')}</th>
        <th>Магазин</th><th>Регион</th>
        <th class="sortable" onclick="sortOutliers('scoShare')">Доля SCO ${sortArrow('scoShare')}</th>
        <th>Причина</th></tr></thead>
      <tbody>${stores.map(s => `<tr class="clickable-row" onclick="nav('store/${s.id}')">
        <td class="mono">${s.availability}%</td><td>${s.number} «${s.name}»</td><td>${s.region}</td>
        <td class="mono">${s.scoShare}%</td><td><span class="badge badge-warn">${outlierLabel(s.outlierReason)}</span></td>
      </tr>`).join("") || `<tr><td colspan="5">Нет магазинов по заданным фильтрам.</td></tr>`}</tbody></table>
    </div>`)}
  `;
}
function sortArrow(col) { const s = sortState["outliers"]; if (!s || s.col !== col) return ""; return s.dir === 1 ? "▲" : "▼"; }
function sortOutliers(col) {
  const s = sortState["outliers"] || { col, dir: 1 };
  sortState["outliers"] = { col, dir: s.col === col ? -s.dir : 1 };
  render();
}

// ================= SCR-03: Карточка магазина =================
function renderStoreCard(storeId) {
  const store = STORES.find(s => s.id === storeId) || STORES[0];
  renderTopbar(`${currentRole !== "dm" ? `<a onclick="nav('network')">${t("nav.network")}</a> / ` : ""}Магазин ${store.number}`);
  const settings = getSettings();
  const storeTasks = TASKS.filter(tk => tk.storeId === store.id);

  return `
    <div class="section-header"><h1>${store.number} «${store.name}» <span style="font-weight:400;color:var(--color-text-muted);font-size:14px">— ${store.region}, ${store.format}</span></h1>
      ${stateSelectorHtml("SCR-03", ["loading","empty","success","validationError","serverError"])}</div>
    ${stateWrapper("SCR-03", [], () => `
    <div class="grid grid-kpi">
      ${kpiCard("Доступность КСО", store.availability + "%", "норматив > " + settings.availabilityNorm + "%", kpiClassFor(store.availability, settings.availabilityNorm, "higher-better"))}
      ${kpiCard("Доля чеков КСО", store.scoShare + "%", "норматив > " + settings.scoShareNorm + "%", kpiClassFor(store.scoShare, settings.scoShareNorm, "higher-better"))}
      ${kpiCard("Нагрузка SCO", store.scoLoadWeek + " чек/нед", "норматив " + settings.utilization.scoWeeklyNorm, store.scoLoadWeek < settings.utilization.scoWeeklyNorm ? "kpi-info" : "kpi-good")}
      ${kpiCard("Нагрузка POS", store.posLoadWeek + " чек/нед", "норматив " + settings.utilization.posWeeklyNorm, store.posLoadWeek > settings.utilization.posUpperOverload ? "kpi-bad" : "kpi-good")}
    </div>
    <div class="section">
      <div class="section-header"><h2>Кассы магазина</h2></div>
      <div class="card">
        <table><thead><tr><th>Касса</th><th>Тип</th><th>Состояние</th><th class="mono">p95, сек</th><th class="mono">Утилизация</th></tr></thead>
        <tbody>${store.registers.map(r => `<tr>
          <td class="mono">${r.id}</td><td>${r.type}</td>
          <td>${statusBadge(r.status)}${r.offlineButAvailable ? ' <span class="badge badge-info">офлайн, но доступна</span>' : ""}</td>
          <td class="mono">${r.p95 ?? "—"}</td><td class="mono">${r.utilization}%</td>
        </tr>${r.note ? `<tr><td></td><td colspan="4" style="color:var(--color-text-muted);font-size:12px;padding-top:0">${r.note}</td></tr>` : ""}`).join("")}</tbody></table>
      </div>
    </div>
    <div class="section">
      <div class="scope-banner mvp2">Раздел «Задачи по магазину» и действия по постановке/выполнению задач относятся к MVP2 (подтверждено Product Manager 2026-07-21) — не входят в MVP1.</div>
      <div class="section-header"><h2>Задачи по магазину</h2>
        ${currentRole !== "dm" ? `<button class="btn btn-primary" onclick="openCreateTaskModal('${store.id}')">${t("action.create_task")}</button>` : ""}</div>
      <div class="card">
        ${storeTasks.length ? storeTasks.map(taskRow).join("") : `<p style="color:var(--color-text-muted)">Активных задач по магазину нет.</p>`}
      </div>
    </div>`)}
  `;
}
function taskRow(tk) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--color-border)">
    <div><div style="font-weight:600">${tk.title}</div><div style="font-size:12px;color:var(--color-text-muted)">${tk.targetKpi} · до ${tk.due}</div></div>
    <span class="badge ${statusBadgeClass(tk.status)}">${statusLabel(tk.status)}</span>
  </div>`;
}

// ================= SCR-04: Дашборд производительности касс =================
function renderPerformance() {
  renderTopbar(`${t("nav.performance")}`);
  const settings = getSettings();
  const stores = scopedStores();
  const allRegs = stores.flatMap(s => s.registers.map(r => ({ ...r, storeName: `${s.number} «${s.name}»` })));
  const byType = ["POS", "SCO"].map(type => {
    const regs = allRegs.filter(r => r.type === type && r.p95);
    const p95 = regs.length ? Math.max(...regs.map(r => r.p95)) : 0;
    return { type, p95, norm: settings.performanceP95[type] };
  });
  const problems = allRegs.filter(r => r.p95 && r.p95 > settings.performanceP95[r.type] * 1.05);

  return `
    <div class="section-header"><h1>${t("nav.performance")}</h1>
      <div class="topbar-tools">${stateSelectorHtml("SCR-04", ["loading","empty","success","serverError"])}
      <button class="btn" onclick="toast(t('toast.export'))">${t("action.export")}</button></div></div>
    ${stateWrapper("SCR-04", [], () => `
    <div class="grid grid-kpi">
      ${byType.map(b => kpiCard(`p95 ${b.type}`, b.p95 + " сек", "норматив " + b.norm + " сек", kpiClassFor(b.norm, b.p95, "higher-better"))).join("")}
    </div>
    <div class="section"><div class="section-header"><h2>Почасовое распределение (демо-часы)</h2></div>
      <div class="card threshold-line" data-label="норматив p95" style="--top:35%">
        <div class="bars">${Array.from({ length: 12 }).map((_, i) => {
          const val = 55 + Math.round(Math.sin(i / 2) * 20 + rnd(15));
          return `<div class="bar-wrap"><div class="bar ${val > 85 ? "over-threshold" : ""}" style="height:${Math.min(100, val)}%"></div><div class="bar-label">${9 + i}:00</div></div>`;
        }).join("")}</div>
      </div>
    </div>
    <div class="section"><div class="section-header"><h2>Проблемные кассы</h2></div>
      <div class="card"><table><thead><tr><th>Магазин</th><th>Касса</th><th>Тип</th><th class="mono">p95, сек</th></tr></thead>
      <tbody>${problems.map(r => `<tr><td>${r.storeName}</td><td class="mono">${r.id}</td><td>${r.type}</td><td class="mono">${r.p95}</td></tr>`).join("") || `<tr><td colspan="4">Проблемных касс не обнаружено.</td></tr>`}</tbody></table></div>
    </div>`)}
  `;
}

// ================= SCR-05: Дашборд потенциала SCO =================
function renderPotential() {
  renderTopbar(`${t("nav.potential")}`);
  const stores = scopedStores();
  const scoShare = avg(stores.map(s => s.scoShare));
  const potential = Math.min(65, scoShare + 22);
  return `
    <div class="section-header"><h1>${t("nav.potential")}</h1>${stateSelectorHtml("SCR-05", ["loading","empty","success","serverError"])}</div>
    ${stateWrapper("SCR-05", [], () => `
    <div class="grid grid-kpi">
      ${kpiCard("Фактическая доля SCO", scoShare.toFixed(0) + "%", "", "kpi-info")}
      ${kpiCard("Потенциал перевода на SCO", potential.toFixed(0) + "%", "чеки ≤10 товаров, безнал на POS", "kpi-warn")}
    </div>
    <div class="section"><div class="section-header"><h2>Фактическое соотношение POS/SCO</h2></div>
      <div class="card">
        <div class="stacked-bar"><span style="width:${100 - scoShare}%;background:var(--color-accent)"></span><span style="width:${scoShare}%;background:var(--color-green)"></span></div>
        <div class="legend"><span class="legend-item"><span class="swatch" style="background:var(--color-accent)"></span>POS ${(100 - scoShare).toFixed(0)}%</span>
        <span class="legend-item"><span class="swatch" style="background:var(--color-green)"></span>SCO ${scoShare.toFixed(0)}%</span></div>
      </div>
    </div>
    <div class="section"><div class="section-header"><h2>Почасовое распределение потоков</h2></div>
      <div class="card"><div class="bars">${Array.from({ length: 12 }).map((_, i) => {
        const pos = 40 + rnd(40); const sco = 20 + rnd(30);
        return `<div class="bar-wrap"><div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:100%">
          <div class="bar" style="height:${sco}%;background:var(--color-green);border-radius:3px 3px 0 0"></div>
          <div class="bar" style="height:${pos}%;background:var(--color-accent);border-radius:0"></div>
        </div><div class="bar-label">${9 + i}:00</div></div>`;
      }).join("")}</div></div>
    </div>`)}
  `;
}

// ================= SCR-06: Дашборд доступности касс (+ объединенный SCR-10) =================
function renderAvailability() {
  renderTopbar(`${t("nav.availability")}`);
  const stores = scopedStores();
  const settings = getSettings();
  const availability = avg(stores.map(s => s.availability));
  const causesTotal = TECHNICAL_CAUSES_HOURS.reduce((a, c) => a + c.hours, 0);

  return `
    <div class="section-header"><h1>${t("nav.availability")}</h1>
      <div class="topbar-tools">${stateSelectorHtml("SCR-06", ["loading","empty","success","serverError"])}
      <button class="btn" onclick="toast(t('toast.export'))">${t("action.export")}</button></div></div>
    ${stateWrapper("SCR-06", [], () => `
    <div class="scope-banner out-of-scope">Экран объединяет прежний отдельный отчет технических причин (SCR-10) — общий для всех ролей, включая технические службы (решение Product Manager, 2026-07-21). Офлайн-режим («Нет связи») сам по себе не считается недоступностью — см. кассу №420-S1 ниже.</div>
    <div class="grid grid-kpi">
      ${kpiCard("Доступность КСО", availability.toFixed(0) + "%", "норматив > " + settings.availabilityNorm + "%", kpiClassFor(availability, settings.availabilityNorm, "higher-better"))}
      ${kpiCard("Магазинов ниже норматива", stores.filter(s => s.availability < settings.availabilityNorm).length, "", "kpi-warn")}
    </div>
    <div class="section"><div class="section-header"><h2>Технические причины простоя (часы)</h2>
      <button class="btn btn-sm" onclick="openCreateTicketModal()">${t("action.create_ticket")}</button></div>
      <div class="card">${TECHNICAL_CAUSES_HOURS.map(c => barRow(c.cause + (c.note ? " ⓘ" : ""), c.hours, causesTotal)).join("")}</div>
    </div>
    <div class="section"><div class="section-header"><h2>TOP аутсайдеров по доступности</h2></div>
      <div class="card"><table><thead><tr><th>Магазин</th><th class="mono">Доступность</th><th class="mono">Недоступность, ч/нед</th></tr></thead>
      <tbody>${[...stores].sort((a, b) => a.availability - b.availability).slice(0, 5).map(s => `<tr class="clickable-row" onclick="nav('store/${s.id}')">
        <td>${s.number} «${s.name}»</td><td class="mono">${s.availability}%</td><td class="mono">${(168 * (1 - s.availability / 100)).toFixed(0)}</td>
      </tr>`).join("")}</tbody></table></div>
    </div>`)}
  `;
}

// ================= SCR-07: Дашборд утилизации ресурсов =================
function renderUtilization() {
  renderTopbar(`${t("nav.utilization")}`);
  const stores = scopedStores();
  const settings = getSettings();
  const allRegs = stores.flatMap(s => s.registers.map(r => ({ ...r, storeName: `${s.number} «${s.name}»` })));
  const posUtil = avg(allRegs.filter(r => r.type === "POS").map(r => r.utilization));
  const scoUtil = avg(allRegs.filter(r => r.type === "SCO").map(r => r.utilization));
  const outliers = [...allRegs].sort((a, b) => a.utilization - b.utilization).slice(0, 5);

  return `
    <div class="section-header"><h1>${t("nav.utilization")}</h1>${stateSelectorHtml("SCR-07", ["loading","empty","success","serverError"])}</div>
    ${stateWrapper("SCR-07", [], () => `
    <div class="scope-banner out-of-scope">Пороги нагрузки (недогруз/перегруз) — настраиваемый параметр из отдельного приложения настроек, не фиксированное значение (уточнено Product Manager, 2026-07-21).</div>
    <div class="grid grid-kpi">
      ${kpiCard("Утилизация POS", posUtil.toFixed(0) + "%", "", "kpi-info")}
      ${kpiCard("Утилизация SCO", scoUtil.toFixed(0) + "%", "", "kpi-info")}
    </div>
    <div class="section"><div class="section-header"><h2>TOP аутсайдеров по утилизации</h2></div>
      <div class="card"><table><thead><tr><th>Магазин</th><th>Касса</th><th>Тип</th><th class="mono">Утилизация</th></tr></thead>
      <tbody>${outliers.map(r => `<tr><td>${r.storeName}</td><td class="mono">${r.id}</td><td>${r.type}</td><td class="mono">${r.utilization}%</td></tr>`).join("")}</tbody></table></div>
    </div>`)}
  `;
}

// ================= SCR-09: Задачи (канбан, MVP2) =================
function renderTasks() {
  renderTopbar(`${t("nav.tasks")} <span class="badge badge-mvp2-inline" style="margin-left:8px">MVP2</span>`);
  const cols = [["new", "Новая"], ["in_progress", "В работе"], ["done", "Выполнено"]];
  return `
    <div class="section-header"><h1>${t("nav.tasks")} <span class="badge badge-mvp2-inline">MVP2</span></h1>
      <div class="topbar-tools">${stateSelectorHtml("SCR-09", ["loading","empty","success","validationError","serverError"])}
      ${currentRole !== "dm" ? `<button class="btn btn-primary" onclick="openCreateTaskModal(null)">${t("action.create_task")}</button>` : ""}</div></div>
    ${stateWrapper("SCR-09", [], () => `
    <div class="scope-banner mvp2">Постановка задач и контроль выполнения — функциональность MVP2 (подтверждено Product Manager 2026-07-21), не входит в MVP1. Маршрут эскалации: РД → ОД.</div>
    <div class="kanban">
      ${cols.map(([status, label]) => `
        <div class="kanban-col" data-status="${status}">
          <div class="kanban-col-title"><span>${label}</span><span>${TASKS.filter(x => x.status === status).length}</span></div>
          ${TASKS.filter(x => x.status === status).map(taskCard).join("")}
        </div>`).join("")}
    </div>`)}
  `;
}
function taskCard(tk) {
  const store = STORES.find(s => s.id === tk.storeId);
  return `<div class="task-card" draggable="true" data-id="${tk.id}">
    <div class="task-title">${tk.title}</div>
    <div class="task-meta"><span>${store ? store.number : ""}</span><span>до ${tk.due}</span></div>
    <div class="task-meta"><span>${tk.assignee}</span></div>
    ${tk.escalated ? `<div class="task-escalated">Эскалировано: ${tk.escalatedTo}</div>` : ""}
    <div style="margin-top:8px;display:flex;gap:6px">
      ${tk.status !== "done" ? `<button class="btn btn-sm" onclick="advanceTask('${tk.id}')">${t("action.complete")}</button>` : ""}
      ${tk.status !== "done" ? `<button class="btn btn-sm" onclick="escalateTask('${tk.id}')">${t("action.escalate")}</button>` : ""}
    </div>
  </div>`;
}
function statusLabel(s) { return { new: "Новая", in_progress: "В работе", done: "Выполнено" }[s]; }
function statusBadgeClass(s) { return { new: "badge-info", in_progress: "badge-warn", done: "badge-ok" }[s]; }
function advanceTask(id) {
  const tk = TASKS.find(x => x.id === id);
  tk.status = tk.status === "new" ? "in_progress" : "done";
  toast(tk.status === "done" ? t("toast.task_created").replace("создана", "выполнена") : "Задача переведена в работу");
  render();
}
function escalateTask(id) {
  const tk = TASKS.find(x => x.id === id);
  tk.escalated = true;
  tk.escalatedTo = "Региональный директор → Операционный директор";
  toast(t("toast.task_escalated"));
  render();
}
function initKanbanDnD() {
  document.querySelectorAll(".task-card").forEach(card => {
    card.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", card.dataset.id));
  });
  document.querySelectorAll(".kanban-col").forEach(col => {
    col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", e => {
      e.preventDefault(); col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const tk = TASKS.find(x => x.id === id);
      if (tk) { tk.status = col.dataset.status; render(); }
    });
  });
}

function openCreateTaskModal(storeId) {
  openOverlay(`<div class="modal">
    <div class="modal-header"><h2>${t("action.create_task")}</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <form id="task-form" onsubmit="return submitTaskForm(event)">
      <div class="field"><label>Магазин</label>
        <select id="tf-store">${STORES.map(s => `<option value="${s.id}" ${s.id === storeId ? "selected" : ""}>${s.number} «${s.name}»</option>`).join("")}</select></div>
      <div class="field"><label>Заголовок задачи</label><input type="text" id="tf-title" placeholder="Например: проверить доступность SCO №2"></div>
      <div class="field"><label>Целевой KPI</label><input type="text" id="tf-kpi" placeholder="Например: доступность ≥ 90%"></div>
      <div class="field"><label>Срок</label><input type="date" id="tf-due"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn" onclick="closeOverlay()">${t("action.cancel")}</button>
        <button type="submit" class="btn btn-primary">${t("action.save")}</button>
      </div>
    </form>
  </div>`);
}
function submitTaskForm(e) {
  e.preventDefault();
  const title = el("tf-title").value.trim();
  const due = el("tf-due").value;
  const field = el("tf-title").closest(".field");
  if (!title) { field.classList.add("has-error"); if (!field.querySelector(".field-error")) field.insertAdjacentHTML("beforeend", `<div class="field-error">Укажите заголовок задачи</div>`); return false; }
  field.classList.remove("has-error");
  TASKS.push({ id: "T-" + (TASKS.length + 1), title, storeId: el("tf-store").value, registerId: null,
    createdBy: t("role." + currentRole), assignee: "Директор магазина", status: "new",
    targetKpi: el("tf-kpi").value || "—", due: due || "—", escalated: false });
  closeOverlay(); toast(t("toast.task_created")); render();
  return false;
}
function openCreateTicketModal() {
  openOverlay(`<div class="modal">
    <div class="modal-header"><h2>${t("action.create_ticket")}</h2><button class="modal-close" onclick="closeOverlay()">×</button></div>
    <p style="color:var(--color-text-muted);font-size:13px">Демо-заявка в систему заявок ИТ по технической неисправности кассы.</p>
    <div class="field"><label>Касса</label><input type="text" placeholder="Например: 087-S1"></div>
    <div class="field"><label>Описание неисправности</label><textarea rows="3" placeholder="Ошибка банка при оплате"></textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn" onclick="closeOverlay()">${t("action.cancel")}</button>
      <button class="btn btn-primary" onclick="closeOverlay(); toast(t('toast.ticket_created'))">${t("action.save")}</button>
    </div>
  </div>`);
}

// ================= SCR-11: Диагностика (служба поддержки) =================
function renderDiagnostics() {
  renderTopbar(`${t("nav.diagnostics")} <span style="font-size:12px;color:var(--color-text-muted)">— роль: Служба поддержки</span>`);
  const allRegs = STORES.flatMap(s => s.registers.map(r => ({ ...r, storeName: `${s.number} «${s.name}»`, revenue: Math.round(r.checksWeek * 780), scoShare: s.scoShare })));
  return `
    <div class="section-header"><h1>${t("nav.diagnostics")}</h1>${stateSelectorHtml("SCR-11", ["loading","empty","success","serverError"])}</div>
    ${stateWrapper("SCR-11", [], () => `
    <div class="scope-banner out-of-scope">Подтверждено Product Manager (2026-07-21): «полный доступ» включает коммерческие метрики (выручка, доля SCO) — в отличие от роли «технические службы».</div>
    <div class="filter-bar"><div><label>Поиск по кассе/магазину</label><input type="text" id="diag-search" oninput="render()" placeholder="например, 087"></div></div>
    <div class="card"><table><thead><tr><th>Магазин</th><th>Касса</th><th>Состояние</th><th class="mono">Выручка/нед</th><th class="mono">Доля SCO</th></tr></thead>
    <tbody>${allRegs.filter(r => !el("diag-search") || !el("diag-search").value || r.id.includes(el("diag-search").value) || r.storeName.includes(el("diag-search").value)).slice(0, 20).map(r => `<tr>
      <td>${r.storeName}</td><td class="mono">${r.id}</td><td>${statusBadge(r.status)}</td><td class="mono">${r.revenue.toLocaleString("ru-RU")} ₽</td><td class="mono">${r.scoShare}%</td>
    </tr>`).join("")}</tbody></table></div>`)}
  `;
}

// ================= SCR-12: Аналитика использования продукта =================
function renderProductAnalytics() {
  renderTopbar(`${t("nav.product_analytics")} <span style="font-size:12px;color:var(--color-text-muted)">— роль: Продуктовые команды</span>`);
  const usage = [
    { report: "Дашборд сети", opens: 412 }, { report: "Аутсайдеры", opens: 356 },
    { report: "Доступность касс", opens: 298 }, { report: "Задачи (MVP2)", opens: 145 },
    { report: "Утилизация ресурсов", opens: 121 }, { report: "ИИ-консультант", opens: 64 }
  ];
  const max = Math.max(...usage.map(u => u.opens));
  return `
    <div class="section-header"><h1>${t("nav.product_analytics")}</h1>${stateSelectorHtml("SCR-12", ["loading","empty","success","serverError"])}</div>
    ${stateWrapper("SCR-12", [], () => `
    <div class="card">${usage.map(u => barRow(u.report, u.opens, max)).join("")}</div>
    <div class="section"><div class="section-header"><h2>Места возникновения аномалий в данных продукта</h2></div>
      <div class="card"><p style="color:var(--color-text-muted)">Демо-заглушка: в проде здесь отображается карта разделов, где чаще всего фиксируются расхождения/ошибки телеметрии.</p></div>
    </div>`)}
  `;
}

// ================= SCR-13: Диалог с ИИ-консультантом =================
let chatMessages = [];
function renderAdvisor() {
  renderTopbar(`${t("nav.advisor")}`);
  return `
    <div class="section-header"><h1>${t("nav.advisor")}</h1>${stateSelectorHtml("SCR-13", ["loading","empty","success","serverError"])}</div>
    ${stateWrapper("SCR-13", [], () => `
    <div class="scope-banner mvp2">Включено в визуальный прототип по решению Product Manager (2026-07-21) — статус в общей продуктовой дорожной карте (MVP1/MVP2/отдельный этап) остается открытым вопросом.</div>
    <div class="chat-panel card">
      <div class="chat-suggestions">${ADVISOR_SUGGESTIONS.map(q => `<button onclick="askAdvisor('${q.replace(/'/g, "\\'")}')">${q}</button>`).join("")}</div>
      <div class="chat-messages" id="chat-messages">${chatMessages.map(chatBubble).join("") || `<p style="color:var(--color-text-muted)">Задайте вопрос — например, «${ADVISOR_SUGGESTIONS[0]}» (пример из requirements/02-system/ai-advisor-concept.md).</p>`}</div>
      <div class="chat-input-row"><input type="text" id="chat-input" placeholder="Задайте вопрос..." onkeydown="if(event.key==='Enter') askAdvisorFromInput()">
        <button class="btn btn-primary" onclick="askAdvisorFromInput()">${t("action.send")}</button></div>
    </div>`)}
  `;
}
function chatBubble(m) {
  if (m.role === "user") return `<div class="chat-msg user">${escapeHtml(m.text)}</div>`;
  return `<div class="chat-msg assistant">
    <p><strong>${m.text.conclusion}</strong></p>
    ${m.text.facts.map(f => `<div class="fact-card">• ${f}</div>`).join("")}
    <p style="margin-top:8px">Гипотеза: <strong>${m.text.hypothesis.name}</strong> (уверенность ${(m.text.hypothesis.confidence * 100).toFixed(0)}%)</p>
    <p>Рекомендации:</p>
    <ul>${m.text.recommendations.map(r => `<li>${r}</li>`).join("")}</ul>
    <p><a onclick="nav('store/404')">→ Открыть карточку магазина №404 (пример)</a></p>
  </div>`;
}
function askAdvisorFromInput() { askAdvisor(el("chat-input").value); }
function askAdvisor(question) {
  if (!question || !question.trim()) return;
  chatMessages.push({ role: "user", text: question });
  const key = question.trim().toLowerCase();
  const answer = ADVISOR_SCRIPTED_ANSWER[key];
  if (answer) {
    chatMessages.push({ role: "assistant", text: answer });
  } else {
    chatMessages.push({ role: "assistant", text: {
      conclusion: "Демо поддерживает сценарный ответ только для примера из документации.",
      facts: ["Попробуйте вопрос: «" + ADVISOR_SUGGESTIONS[0] + "»"],
      hypothesis: { name: "—", confidence: 0 },
      recommendations: []
    }});
  }
  render();
  setTimeout(() => { const box = el("chat-messages"); if (box) box.scrollTop = box.scrollHeight; }, 0);
}

// ---------- Инициализация ----------
window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
  if (!location.hash) location.hash = currentRole === "dm" ? `#/store/${DM_STORE_ID}` : "#/network";
  render();
});
