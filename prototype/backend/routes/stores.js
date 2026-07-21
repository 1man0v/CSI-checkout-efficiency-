const { classifyOutlier, isRegisterAvailable } = require("../rules");
const { getEffectiveSettings } = require("./settings");
const { topCauseByStore } = require("./analytics");

// GET /api/stores?scope=network|region|store&region=..&storeId=..
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
  return scoped.map(s => ({ ...s, ...classifyOutlier(s, settings), top_cause: topCauses.get(s.id)?.cause || null }));
}

// GET /api/stores/:id
function getStore(db, id) {
  const store = db.prepare("SELECT * FROM stores WHERE id = ?").get(id);
  if (!store) return null;
  const registers = db.prepare("SELECT * FROM registers WHERE store_id = ? ORDER BY id").all(id)
    .map(r => ({ ...r, is_available: isRegisterAvailable(r) }));
  const settings = getEffectiveSettings(db, store.region);
  return { ...store, ...classifyOutlier(store, settings), registers, settings };
}

module.exports = { listStores, getStore };
