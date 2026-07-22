const { classifyOutlier, isRegisterAvailable, isRegisterStale, staleDays } = require("../rules");
const { getEffectiveSettings } = require("./settings");
const { topCauseByStore } = require("./analytics");

// GET /api/stores?scope=network|region|store&region=..&storeId=..
// utilization_pct (добавлено 2026-07-22) — средняя утилизация касс магазина (POS+SCO вместе), для
// плашки "рейтинг магазина" на карточке ДМ (business-rules-and-formulas.md, "14. Рейтинг региона/магазина").
function listStores(db, query) {
  const rows = db.prepare("SELECT * FROM stores ORDER BY number").all();
  let scoped = rows;
  if (query.scope === "region" && query.region) {
    scoped = rows.filter(s => s.region === query.region);
  } else if (query.scope === "store" && query.storeId) {
    scoped = rows.filter(s => s.id === query.storeId);
  }
  const settings = getEffectiveSettings(db, query.region || null);
  const topCauses = topCauseByStore(db);
  const utilRows = db.prepare("SELECT store_id, AVG(utilization_pct) AS avg_util FROM registers GROUP BY store_id").all();
  const utilByStore = new Map(utilRows.map(r => [r.store_id, Math.round(r.avg_util * 10) / 10]));
  return scoped.map(s => ({ ...s, ...classifyOutlier(s, settings), top_cause: topCauses.get(s.id)?.cause || null, utilization_pct: utilByStore.get(s.id) ?? 0 }));
}

// GET /api/stores/:id
function getStore(db, id) {
  const store = db.prepare("SELECT * FROM stores WHERE id = ?").get(id);
  if (!store) return null;
  const registers = db.prepare("SELECT * FROM registers WHERE store_id = ? ORDER BY id").all(id)
    .map(r => ({ ...r, is_available: isRegisterAvailable(r), is_stale: isRegisterStale(r), stale_days: isRegisterStale(r) ? staleDays(r) : null }));
  const settings = getEffectiveSettings(db, store.region);
  return { ...store, ...classifyOutlier(store, settings), registers, settings };
}

module.exports = { listStores, getStore };
