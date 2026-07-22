// Заменяет frontend/api.js в офлайн-сборке: тот же объект `api` с теми же именами методов
// (app.js не меняется ни на строчку), но вместо fetch() к REST API вызывает
// window.OfflineBackend напрямую и оборачивает результат в Promise — сохраняет тот же
// async-интерфейс и то же поведение при ошибках (ApiError с .message из тела ответа).
(function () {
  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  function ok(value) { return Promise.resolve(value); }
  function notFound(value, message) { return value == null ? Promise.reject(new ApiError(404, message)) : Promise.resolve(value); }
  function mutation(result) {
    if (result.status >= 400) return Promise.reject(new ApiError(result.status, (result.body && result.body.error) || `Ошибка запроса (${result.status})`));
    return Promise.resolve(result.body);
  }
  const B = () => window.OfflineBackend;

  window.api = {
    getStores: params => ok(B().listStores(params || {})),
    getStore: id => notFound(B().getStore(id), "Магазин не найден"),
    getTechnicalCauses: () => ok(B().listCauses()),
    createTicket: body => mutation(B().createTicket(body || {})),
    getSettings: region => ok(B().getSettings(region || null)),
    updateSettings: body => mutation(B().updateSettings(body || {})),
    getApprovals: () => ok(B().listApprovals()),
    resolveApproval: (id, decision) => mutation(B().resolveApproval(id, decision)),
    getTasks: storeId => ok(B().listTasks(storeId || null)),
    createTask: body => mutation(B().createTask(body || {})),
    updateTaskStatus: (id, status) => mutation(B().updateTaskStatus(id, status)),
    escalateTask: id => mutation(B().escalateTask(id)),
    getDiagnostics: search => ok(B().diagnostics(search || "")),
    getUsage: () => ok(B().usageStats()),
    askAdvisor: q => ok(B().askAdvisor(q || "")),
    getDailySeries: params => ok(B().dailySeries(params || {})),
    getCountsSeries: params => ok(B().countsSeries(params || {})),
    getRegionsSummary: params => ok(B().regionsSummary(params || {})),
    getHourlySeries: params => ok(B().hourlySeries(params || {})),
    getHourlyLoadProfile: params => ok(B().hourlyLoadProfile(params || {})),
    getPosSummary: params => ok(B().posSummary(params || {})),
    getRegisterHistory: id => notFound(B().registerHistory(id), "Касса не найдена")
  };
})();
