function listCauses(db) {
  return db.prepare("SELECT * FROM technical_causes ORDER BY hours DESC").all();
}

// POST /api/tickets — заявка в ИТ (SCR-06, CreateITTicket)
function createTicket(db, body) {
  const description = (body.description || "").trim();
  if (!description) return { status: 400, body: { error: "Опишите неисправность" } };
  const now = new Date().toISOString();
  const info = db.prepare("INSERT INTO it_tickets (register_id, description, created_at) VALUES (?, ?, ?)")
    .run(body.registerId || null, description, now);
  return { status: 201, body: db.prepare("SELECT * FROM it_tickets WHERE id = ?").get(info.lastInsertRowid) };
}

function listTickets(db) {
  return db.prepare("SELECT * FROM it_tickets ORDER BY created_at DESC LIMIT 20").all();
}

module.exports = { listCauses, createTicket, listTickets };
