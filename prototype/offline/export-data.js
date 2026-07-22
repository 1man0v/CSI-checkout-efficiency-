// Экспортирует все таблицы текущей (уже посеянной) SQLite БД в один JSON — источник данных для
// офлайн-версии прототипа в один файл (см. build-offline.js). Не меняет и не пересевает БД.
const fs = require("node:fs");
const path = require("node:path");
const { openDb } = require("../backend/db");

const TABLES = [
  "stores", "registers", "technical_causes", "it_tickets",
  "settings_network", "settings_regional", "settings_approval_requests",
  "tasks", "usage_stats", "daily_summary", "hourly_metrics",
  "register_state_history", "regions"
];

function main() {
  const db = openDb();
  const data = {};
  for (const table of TABLES) {
    if (table === "settings_network") {
      data[table] = db.prepare(`SELECT * FROM ${table} WHERE id = 1`).get();
    } else {
      data[table] = db.prepare(`SELECT * FROM ${table}`).all();
    }
  }
  db.close();
  const outPath = path.join(__dirname, "data.json");
  fs.writeFileSync(outPath, JSON.stringify(data));
  console.log("Экспортировано в", outPath, `(${Math.round(fs.statSync(outPath).size / 1024)} KB)`);
}

main();
