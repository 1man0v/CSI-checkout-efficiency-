// Подключение к SQLite через встроенный модуль node:sqlite (Node.js >= 22.5, experimental).
// Выбор без внешних зависимостей — не требует npm install/компиляции нативных модулей.
// Ограничение для production: node:sqlite экспериментальный API, для боевой системы нужна
// реализация на согласованном стеке (см. ai-artifacts/07-prototype-report.md, раздел «Упрощения»).
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "data", "prototype.db");

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

module.exports = { openDb, DB_PATH };
