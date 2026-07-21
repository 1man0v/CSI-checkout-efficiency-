/* Таблица локализации (ключ → перевод). Подтверждено Product Manager: RU/EN по умолчанию, другие языки —
   по запросу; перевод только через таблицу ключей, эталон — английский. Пункт 1 замечаний к прототипу:
   переключатель должен быть выпадающим списком (языков может быть десятки), не парой кнопок — и должен
   реально переключать содержимое экранов, а не только заголовки. Полный перевод заведен для ru/en;
   остальные языки в списке показывают структуру, готовую к расширению, с graceful fallback на английский. */

const LANGUAGES = [
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "tr", label: "Türkçe" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
  { code: "kk", label: "Қазақша" }
];

const I18N = {
  ru: {
    "brand.name": "Set", "brand.subtitle": "Эффективность зоны расчета",
    "role.od": "Операционный директор", "role.rd": "Региональный директор", "role.dm": "Директор магазина",
    "role.od.scope": "Вся сеть", "role.rd.scope": "Свой регион", "role.dm.scope": "Свой магазин",
    "scope.network": "Сеть", "scope.region": "Регион", "scope.store": "Магазин",
    "nav.network": "Дашборд сети", "nav.outliers": "Аутсайдеры", "nav.performance": "Производительность",
    "nav.potential": "Потенциал SCO", "nav.availability": "Доступность", "nav.utilization": "Утилизация",
    "nav.tasks": "Задачи", "nav.other_views": "Другие роли (демо)", "nav.diagnostics": "Диагностика",
    "nav.product_analytics": "Аналитика продукта", "nav.advisor": "ИИ-консультант", "nav.settings": "Настройки (отдельное приложение)",
    "action.filter": "Фильтр", "action.export": "Экспорт CSV", "action.create_task": "Создать задачу",
    "action.create_ticket": "Заявка в ИТ", "action.save": "Сохранить", "action.cancel": "Отмена", "action.close": "Закрыть",
    "action.complete": "Выполнено", "action.escalate": "Эскалировать", "action.approve": "Согласовать", "action.send": "Отправить",
    "action.apply": "Применить", "action.worst_first": "Худшие сначала", "action.best_first": "Лучшие сначала",
    "action.low_availability": "Низкая доступность", "action.low_sco": "Низкая доля SCO", "action.high_potential": "Большой потенциал перетока",
    "action.realtime": "Реальное время", "action.last24h": "Последние 24 часа", "action.last7d": "Последние 7 дней", "action.last30d": "Последние 30 дней",
    "period.label": "Период", "period.custom": "Произвольный период",
    "state.label": "Состояние (демо)", "state.success": "success", "state.loading": "loading", "state.empty": "empty",
    "state.validationError": "validation error", "state.serverError": "server error", "state.auto": "авто (реальный запрос)",
    "kpi.availability": "Доступность КСО", "kpi.sco_share": "Доля чеков КСО", "kpi.sco_load": "Нагрузка SCO", "kpi.pos_load": "Нагрузка POS",
    "kpi.p95_tooltip": "p95 — время, за которое укладываются 95% чеков (95-й процентиль). Чем ниже значение, тем быстрее касса обслуживает покупателей.",
    "toast.export": "CSV-файл подготовлен и скачан", "toast.saved": "Сохранено", "toast.task_created": "Задача создана",
    "toast.task_escalated": "Задача эскалирована", "toast.ticket_created": "Заявка в ИТ создана"
  },
  en: {
    "brand.name": "Set", "brand.subtitle": "Checkout Efficiency",
    "role.od": "Operations Director", "role.rd": "Regional Director", "role.dm": "Store Director",
    "role.od.scope": "Whole network", "role.rd.scope": "Own region", "role.dm.scope": "Own store",
    "scope.network": "Network", "scope.region": "Region", "scope.store": "Store",
    "nav.network": "Network dashboard", "nav.outliers": "Outliers", "nav.performance": "Performance",
    "nav.potential": "SCO potential", "nav.availability": "Availability", "nav.utilization": "Utilization",
    "nav.tasks": "Tasks", "nav.other_views": "Other roles (demo)", "nav.diagnostics": "Diagnostics",
    "nav.product_analytics": "Product analytics", "nav.advisor": "AI advisor", "nav.settings": "Settings (separate app)",
    "action.filter": "Filter", "action.export": "Export CSV", "action.create_task": "Create task",
    "action.create_ticket": "IT ticket", "action.save": "Save", "action.cancel": "Cancel", "action.close": "Close",
    "action.complete": "Complete", "action.escalate": "Escalate", "action.approve": "Approve", "action.send": "Send",
    "action.apply": "Apply", "action.worst_first": "Worst first", "action.best_first": "Best first",
    "action.low_availability": "Low availability", "action.low_sco": "Low SCO share", "action.high_potential": "High shift potential",
    "action.realtime": "Real time", "action.last24h": "Last 24 hours", "action.last7d": "Last 7 days", "action.last30d": "Last 30 days",
    "period.label": "Period", "period.custom": "Custom period",
    "state.label": "State (demo)", "state.success": "success", "state.loading": "loading", "state.empty": "empty",
    "state.validationError": "validation error", "state.serverError": "server error", "state.auto": "auto (real request)",
    "kpi.availability": "SCO availability", "kpi.sco_share": "SCO checkout share", "kpi.sco_load": "SCO load", "kpi.pos_load": "POS load",
    "kpi.p95_tooltip": "p95 — the time within which 95% of checkouts complete (95th percentile). Lower is faster.",
    "toast.export": "CSV file prepared and downloaded", "toast.saved": "Saved", "toast.task_created": "Task created",
    "toast.task_escalated": "Task escalated", "toast.ticket_created": "IT ticket created"
  }
};

let currentLang = localStorage.getItem("set_lang") || "ru";

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || I18N.ru[key] || key;
}
function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("set_lang", lang);
  if (typeof render === "function") render();
}
