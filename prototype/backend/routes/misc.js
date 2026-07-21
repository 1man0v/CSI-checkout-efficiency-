// SCR-11 (Диагностика): полный доступ, включая коммерческие метрики (подтверждено PM 2026-07-21).
function diagnostics(db, search) {
  const rows = db.prepare(`
    SELECT r.*, s.number, s.name, s.sco_share_pct
    FROM registers r JOIN stores s ON s.id = r.store_id
    ORDER BY r.id
  `).all();
  const withRevenue = rows.map(r => ({ ...r, revenue_week: Math.round(r.checks_week * 780), store_label: `${r.number} «${r.name}»` }));
  if (!search) return withRevenue.slice(0, 20);
  const needle = search.toLowerCase();
  return withRevenue.filter(r => r.id.toLowerCase().includes(needle) || r.store_label.toLowerCase().includes(needle)).slice(0, 20);
}

// SCR-12 (Аналитика продукта)
function usageStats(db) {
  return db.prepare("SELECT * FROM usage_stats ORDER BY opens DESC").all();
}

// SCR-13 (ИИ-консультант) — сценарный пример из requirements/02-system/ai-advisor-concept.md, раздел 11.
const SCRIPTED_ANSWERS = {
  "что сегодня мешает эффективности магазина?": {
    conclusion: "Основная причина снижения эффективности — недоступность КСО в пиковый период.",
    facts: [
      "В 12:00 наблюдалась пиковая нагрузка (20 чеков против среднего 15.4/час)",
      "Доступность КСО за период составила 72%",
      "Простой КСО (110 минут) пришелся на период 12:00–13:00 — совпадает с пиковой нагрузкой"
    ],
    hypothesis: { name: "КСО недоступны в пиковые часы", confidence: 0.91 },
    recommendations: [
      "Проверить причины недоступности КСО: блокировки, ошибки оборудования, бумагу, эквайринг",
      "Обеспечить контроль КСО в часы пик"
    ]
  }
};
function askAdvisor(question) {
  const key = (question || "").trim().toLowerCase();
  return SCRIPTED_ANSWERS[key] || {
    conclusion: "Демо поддерживает сценарный ответ только для примера из документации.",
    facts: ["Попробуйте вопрос: «Что сегодня мешает эффективности магазина?»"],
    hypothesis: { name: "—", confidence: 0 },
    recommendations: []
  };
}

module.exports = { diagnostics, usageStats, askAdvisor };
