// Собирает весь прототип в один самодостаточный HTML-файл (без сервера, без интернета, без
// npm install) — для отправки коллегам на ревью. Инлайнит CSS и JS, встраивает экспортированный
// снимок данных (offline/data.json, см. export-data.js) и подменяет frontend/api.js на
// offline-api.js + offline-backend.js, работающие над данными в памяти вместо REST/SQLite.
// frontend/app.js, frontend/i18n.js и frontend/styles.css используются БЕЗ ИЗМЕНЕНИЙ (кроме одного
// условного блока в app.js для меню «Настройки» — см. IS_OFFLINE) — офлайн-сборка не форкает
// продуктовый код, а оборачивает его.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const OUT_PATH = path.join(__dirname, "set-prototype-offline.html");

function read(...parts) { return fs.readFileSync(path.join(...parts), "utf8"); }

// Список экспортов читается ИЗ САМОГО module.exports (а не хардкодится здесь) — иначе список
// неизбежно расходится с rules.js при каждом добавлении новой функции (реальный баг: забыли
// добавить isRegisterStale/staleDays сюда при доработке "касса не в эксплуатации", офлайн-сборка
// упала с "isRegisterStale is not a function").
function rulesForBrowser() {
  const src = read(ROOT, "backend", "rules.js");
  const exportsMatch = src.match(/module\.exports\s*=\s*\{([^}]*)\};?\s*$/m);
  if (!exportsMatch) throw new Error("Не найден module.exports в backend/rules.js — build-offline.js не может собрать offline-версию правил.");
  const names = exportsMatch[1].split(",").map(s => s.trim()).filter(Boolean);
  const body = src.replace(/module\.exports\s*=\s*\{[^}]*\};?\s*$/m, "").trim();
  return `${body}\nwindow.OfflineRules = { ${names.join(", ")} };`;
}

function build() {
  const data = JSON.parse(read(__dirname, "data.json"));
  const css = read(FRONTEND, "styles.css");
  const i18n = read(FRONTEND, "i18n.js");
  const appJs = read(FRONTEND, "app.js");
  const offlineBackend = read(__dirname, "offline-backend.js");
  const offlineApi = read(__dirname, "offline-api.js");
  const rulesJs = rulesForBrowser();

  const generatedAt = new Date().toISOString();

  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Set — Эффективность зоны расчета (офлайн-копия)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${css}
.offline-banner { position: fixed; left: 0; right: 0; bottom: 0; z-index: 200; background: oklch(20% 0.02 260); color: oklch(90% 0.01 260);
  font-size: 11px; padding: 6px 16px; text-align: center; font-family: var(--font-sans); }
.offline-banner a { color: inherit; }
</style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar" id="sidebar"></aside>
    <main class="main">
      <div class="topbar">
        <div class="topbar-context" id="topbar-context"></div>
        <div class="topbar-tools" id="topbar-tools-right"></div>
      </div>
      <div class="content" id="content"></div>
    </main>
  </div>
  <div class="offline-banner">Офлайн-копия прототипа «Set — Эффективность зоны расчета», собрана ${generatedAt.slice(0, 10)}. Демо-данные встроены в файл и не сохраняются между открытиями — изменения (задачи, настройки) живут только в текущей вкладке.</div>

<script>
window.IS_OFFLINE = true;
window.OFFLINE_DATA = ${JSON.stringify(data)};
</script>
<script>
${rulesJs}
</script>
<script>
${offlineBackend}
</script>
<script>
${offlineApi}
</script>
<script>
${i18n}
</script>
<script>
${appJs}
</script>
</body>
</html>
`;

  fs.writeFileSync(OUT_PATH, html);
  const sizeKb = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log(`Собрано: ${OUT_PATH} (${sizeKb} KB)`);
}

build();
