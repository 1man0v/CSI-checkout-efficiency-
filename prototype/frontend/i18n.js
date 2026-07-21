/* Демонстрационная таблица локализации (ключ → RU/EN).
   Подтверждено Product Manager: RU/EN по умолчанию, другие языки — по запросу; перевод только через таблицу ключей,
   эталон — английский (requirements/04-quality/quality-requirements.md). Здесь покрыт представительный набор
   ключей (навигация, заголовки экранов, общие действия) — не полный словарь всего текста продукта. */

const I18N = {
  ru: {
    "brand.name": "Set",
    "brand.subtitle": "Эффективность зоны расчета",
    "role.od": "Операционный директор",
    "role.rd": "Региональный директор",
    "role.dm": "Директор магазина",
    "role.od.scope": "Вся сеть",
    "role.rd.scope": "Свой регион",
    "role.dm.scope": "Свой магазин",
    "nav.network": "Дашборд сети",
    "nav.outliers": "Аутсайдеры",
    "nav.performance": "Производительность",
    "nav.potential": "Потенциал SCO",
    "nav.availability": "Доступность",
    "nav.utilization": "Утилизация",
    "nav.tasks": "Задачи",
    "nav.other_views": "Другие роли (демо)",
    "nav.diagnostics": "Диагностика",
    "nav.product_analytics": "Аналитика продукта",
    "nav.advisor": "ИИ-консультант",
    "nav.settings": "Настройки (отдельное приложение)",
    "action.filter": "Фильтр",
    "action.export": "Экспорт",
    "action.create_task": "Создать задачу",
    "action.create_ticket": "Заявка в ИТ",
    "action.save": "Сохранить",
    "action.cancel": "Отмена",
    "action.close": "Закрыть",
    "action.complete": "Выполнено",
    "action.escalate": "Эскалировать",
    "action.approve": "Согласовать",
    "action.send": "Отправить",
    "state.label": "Состояние (демо)",
    "state.success": "success",
    "state.loading": "loading",
    "state.empty": "empty",
    "state.validationError": "validation error",
    "state.serverError": "server error",
    "toast.export": "Экспорт запущен (демо, без реального файла)",
    "toast.saved": "Сохранено",
    "toast.task_created": "Задача создана",
    "toast.task_escalated": "Задача эскалирована",
    "toast.ticket_created": "Заявка в ИТ создана"
  },
  en: {
    "brand.name": "Set",
    "brand.subtitle": "Checkout Efficiency",
    "role.od": "Operations Director",
    "role.rd": "Regional Director",
    "role.dm": "Store Director",
    "role.od.scope": "Whole network",
    "role.rd.scope": "Own region",
    "role.dm.scope": "Own store",
    "nav.network": "Network dashboard",
    "nav.outliers": "Outliers",
    "nav.performance": "Performance",
    "nav.potential": "SCO potential",
    "nav.availability": "Availability",
    "nav.utilization": "Utilization",
    "nav.tasks": "Tasks",
    "nav.other_views": "Other roles (demo)",
    "nav.diagnostics": "Diagnostics",
    "nav.product_analytics": "Product analytics",
    "nav.advisor": "AI advisor",
    "nav.settings": "Settings (separate app)",
    "action.filter": "Filter",
    "action.export": "Export",
    "action.create_task": "Create task",
    "action.create_ticket": "IT ticket",
    "action.save": "Save",
    "action.cancel": "Cancel",
    "action.close": "Close",
    "action.complete": "Complete",
    "action.escalate": "Escalate",
    "action.approve": "Approve",
    "action.send": "Send",
    "state.label": "State (demo)",
    "state.success": "success",
    "state.loading": "loading",
    "state.empty": "empty",
    "state.validationError": "validation error",
    "state.serverError": "server error",
    "toast.export": "Export started (demo, no real file)",
    "toast.saved": "Saved",
    "toast.task_created": "Task created",
    "toast.task_escalated": "Task escalated",
    "toast.ticket_created": "IT ticket created"
  }
};

let currentLang = localStorage.getItem("set_lang") || "ru";

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || I18N.ru[key] || key;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("set_lang", lang);
  ["ru", "en"].forEach(l => {
    const btn = document.getElementById("lang-" + l);
    if (btn) btn.classList.toggle("active", l === lang);
  });
  if (typeof render === "function") render();
}
