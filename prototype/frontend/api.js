// Тонкий fetch-клиент к REST API прототипа. Никаких моков — все данные идут через сеть в SQLite.
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function apiRequest(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* пусто */ }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Ошибка запроса (${res.status})`);
  return data;
}
const api = {
  getStores: (params) => apiRequest("GET", "/api/stores?" + new URLSearchParams(params || {})),
  getStore: (id) => apiRequest("GET", `/api/stores/${id}`),
  getTechnicalCauses: () => apiRequest("GET", "/api/technical-causes"),
  createTicket: (body) => apiRequest("POST", "/api/tickets", body),
  getSettings: (region) => apiRequest("GET", "/api/settings?" + new URLSearchParams(region ? { region } : {})),
  updateSettings: (body) => apiRequest("PUT", "/api/settings", body),
  getApprovals: () => apiRequest("GET", "/api/settings/approvals"),
  resolveApproval: (id, decision) => apiRequest("POST", `/api/settings/approvals/${id}`, { decision }),
  getTasks: (storeId) => apiRequest("GET", "/api/tasks?" + new URLSearchParams(storeId ? { storeId } : {})),
  createTask: (body) => apiRequest("POST", "/api/tasks", body),
  updateTaskStatus: (id, status) => apiRequest("PATCH", `/api/tasks/${id}`, { status }),
  escalateTask: (id) => apiRequest("POST", `/api/tasks/${id}/escalate`),
  getDiagnostics: (search) => apiRequest("GET", "/api/diagnostics?" + new URLSearchParams(search ? { search } : {})),
  getUsage: () => apiRequest("GET", "/api/usage"),
  askAdvisor: (q) => apiRequest("GET", "/api/advisor?" + new URLSearchParams({ q })),
  getDailySeries: (params) => apiRequest("GET", "/api/analytics/daily?" + new URLSearchParams(params || {})),
  getRegionsSummary: (params) => apiRequest("GET", "/api/analytics/regions?" + new URLSearchParams(params || {})),
  getHourlySeries: (params) => apiRequest("GET", "/api/analytics/hourly?" + new URLSearchParams(params || {})),
  getRegisterHistory: (id) => apiRequest("GET", `/api/registers/${id}/history`)
};
