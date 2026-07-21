// Сервер прототипа: node:http (без Express/внешних зависимостей) + node:sqlite.
// Отдает статику фронтенда и REST API. Запуск: npm start (см. prototype/README.md).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");
const { openDb } = require("./db");

const stores = require("./routes/stores");
const tasksApi = require("./routes/tasks");
const settingsApi = require("./routes/settings");
const causesApi = require("./routes/causes");
const misc = require("./routes/misc");

const PORT = process.env.PORT || 4000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const db = openDb();

// Если БД пустая (первый запуск без npm run seed) — сеем автоматически.
const storeCount = db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='stores'").get();
if (!storeCount.c) {
  console.log("БД не инициализирована — выполняю первичный посев данных...");
  require("./seed").seed();
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".json": "application/json" };

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => (raw += chunk));
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(FRONTEND_DIR, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(FRONTEND_DIR)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleApi(req, res, pathname, query) {
  try {
    // --- stores ---
    if (req.method === "GET" && pathname === "/api/stores") {
      return sendJson(res, 200, stores.listStores(db, query));
    }
    let m = pathname.match(/^\/api\/stores\/([^/]+)$/);
    if (req.method === "GET" && m) {
      const store = stores.getStore(db, m[1]);
      return store ? sendJson(res, 200, store) : sendJson(res, 404, { error: "Магазин не найден" });
    }

    // --- technical causes & IT tickets ---
    if (req.method === "GET" && pathname === "/api/technical-causes") return sendJson(res, 200, causesApi.listCauses(db));
    if (req.method === "GET" && pathname === "/api/tickets") return sendJson(res, 200, causesApi.listTickets(db));
    if (req.method === "POST" && pathname === "/api/tickets") {
      const body = await readBody(req);
      const result = causesApi.createTicket(db, body);
      return sendJson(res, result.status, result.body);
    }

    // --- settings ---
    if (req.method === "GET" && pathname === "/api/settings") return sendJson(res, 200, settingsApi.getSettings(db, query.region || null));
    if (req.method === "PUT" && pathname === "/api/settings") {
      const body = await readBody(req);
      const result = settingsApi.updateSettings(db, body);
      return sendJson(res, result.status, result.body);
    }
    if (req.method === "GET" && pathname === "/api/settings/approvals") return sendJson(res, 200, settingsApi.listApprovals(db));
    m = pathname.match(/^\/api\/settings\/approvals\/(\d+)$/);
    if (req.method === "POST" && m) {
      const body = await readBody(req);
      const result = settingsApi.resolveApproval(db, Number(m[1]), body.decision);
      return sendJson(res, result.status, result.body);
    }

    // --- tasks ---
    if (req.method === "GET" && pathname === "/api/tasks") return sendJson(res, 200, tasksApi.listTasks(db, query.storeId || null));
    if (req.method === "POST" && pathname === "/api/tasks") {
      const body = await readBody(req);
      const result = tasksApi.createTask(db, body);
      return sendJson(res, result.status, result.body);
    }
    m = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (req.method === "PATCH" && m) {
      const body = await readBody(req);
      const result = tasksApi.updateTaskStatus(db, m[1], body.status);
      return sendJson(res, result.status, result.body);
    }
    m = pathname.match(/^\/api\/tasks\/([^/]+)\/escalate$/);
    if (req.method === "POST" && m) {
      const result = tasksApi.escalateTask(db, m[1]);
      return sendJson(res, result.status, result.body);
    }

    // --- diagnostics / usage / advisor ---
    if (req.method === "GET" && pathname === "/api/diagnostics") return sendJson(res, 200, misc.diagnostics(db, query.search || ""));
    if (req.method === "GET" && pathname === "/api/usage") return sendJson(res, 200, misc.usageStats(db));
    if (req.method === "GET" && pathname === "/api/advisor") return sendJson(res, 200, misc.askAdvisor(query.q || ""));

    return sendJson(res, 404, { error: "Не найдено" });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: "Внутренняя ошибка сервера (демо)" });
  }
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname.startsWith("/api/")) {
    handleApi(req, res, parsed.pathname, parsed.query);
  } else {
    serveStatic(req, res, parsed.pathname);
  }
});

server.listen(PORT, () => {
  console.log(`Прототип запущен: http://localhost:${PORT}`);
  console.log(`База данных: ${require("./db").DB_PATH}`);
});
