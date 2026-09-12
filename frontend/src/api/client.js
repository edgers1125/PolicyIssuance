const API_URL = import.meta.env.VITE_API_URL;

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }

  return data;
}

export function login(email, password) {
  return request("/auth/login", { method: "POST", body: { email, password } });
}

export function getMe(token) {
  return request("/me", { token });
}

export function setPassword(inviteToken, password) {
  return request("/auth/set-password", { method: "POST", body: { token: inviteToken, password } });
}

export function forgotPassword(email) {
  return request("/auth/forgot-password", { method: "POST", body: { email } });
}

export function listUsers(token) {
  return request("/users", { token });
}

export function listRoles(token) {
  return request("/users/roles", { token });
}

export function listPermissions(token) {
  return request("/users/permissions", { token });
}

export function createUser(token, { email, first_name, last_name, role_id, permission_ids, make_agent, agent_code }) {
  return request("/users", {
    method: "POST",
    token,
    body: { email, first_name, last_name, role_id, permission_ids, make_agent, agent_code },
  });
}

export function updateUser(token, id, payload) {
  return request(`/users/${id}`, { method: "PATCH", token, body: payload });
}

export function updateRolePermissions(token, roleId, permissionIds) {
  return request(`/users/roles/${roleId}/permissions`, {
    method: "PUT",
    token,
    body: { permission_ids: permissionIds },
  });
}

export function createRole(token, { role_name, description, permission_ids }) {
  return request("/users/roles", {
    method: "POST",
    token,
    body: { role_name, description, permission_ids },
  });
}

export function getProductCatalog(token) {
  return request("/product-catalog", { token });
}

export function listCoverages(token) {
  return request("/coverages", { token });
}

export function updateCoverage(token, id, payload) {
  return request(`/coverages/${id}`, { method: "PATCH", token, body: payload });
}

export function listMyCustomers(token) {
  return request("/customers", { token });
}

export function createCustomer(token, payload) {
  return request("/customers", { method: "POST", token, body: payload });
}

export function updateCustomer(token, id, payload) {
  return request(`/customers/${id}`, { method: "PATCH", token, body: payload });
}

export function listMyCompanies(token) {
  return request("/companies", { token });
}

export function createCompany(token, payload) {
  return request("/companies", { method: "POST", token, body: payload });
}

export function updateCompany(token, id, payload) {
  return request(`/companies/${id}`, { method: "PATCH", token, body: payload });
}

export function updateVehicle(token, id, payload) {
  return request(`/vehicles/${id}`, { method: "PATCH", token, body: payload });
}

// A 404 here just means the plate isn't on file anywhere — that's an expected
// outcome (it's a new vehicle), not an error, so it resolves to null instead
// of throwing.
export async function lookupVehicleByPlate(token, plateNumber) {
  const headers = { Authorization: `Bearer ${token}` };
  const res = await fetch(`${API_URL}/vehicles/lookup?plate_number=${encodeURIComponent(plateNumber)}`, { headers });
  if (res.status === 404) {
    return null;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export function updateAddress(token, id, payload) {
  return request(`/addresses/${id}`, { method: "PATCH", token, body: payload });
}

export function createPolicyApplication(token, payload) {
  return request("/policy-applications", { method: "POST", token, body: payload });
}

export function createPolicyQuotation(token, payload) {
  return request("/policy-quotations", { method: "POST", token, body: payload });
}

// Paginated, latest-first — the Quotation Tracker's list view.
export function listQuotations(token, page = 1, pageSize = 20) {
  return request(`/policy-quotations?page=${page}&page_size=${pageSize}`, { token });
}

export function listAgents(token) {
  return request("/agents", { token });
}

// Every rate/tier below is scoped to one allowable period (coverageInDays) —
// an agent can have a different override for a coverage's 180-day period
// than its 365-day one.
export function getAgentNetrates(token, agentId, coverageInDays) {
  return request(`/agents/${agentId}/netrates?coverage_in_days=${coverageInDays}`, { token });
}

export function updateAgentNetrates(token, agentId, coverageInDays, netrates) {
  return request(`/agents/${agentId}/netrates`, {
    method: "PUT",
    token,
    body: { coverage_in_days: coverageInDays, netrates },
  });
}

export function updateAgentValueTiers(token, agentId, coverageId, coverageInDays, tiers) {
  return request(`/agents/${agentId}/value-percentage-tiers/${coverageId}`, {
    method: "PUT",
    token,
    body: { coverage_in_days: coverageInDays, tiers },
  });
}

export function updateAgentFlatTiers(token, agentId, coverageId, coverageInDays, tiers) {
  return request(`/agents/${agentId}/flat-tiers/${coverageId}`, {
    method: "PUT",
    token,
    body: { coverage_in_days: coverageInDays, tiers },
  });
}

export function listPaymentMethods(token) {
  return request("/payment-methods", { token });
}

export function createPaymentMethod(token, name) {
  return request("/payment-methods", { method: "POST", token, body: { name } });
}

export function deletePaymentMethod(token, id) {
  return request(`/payment-methods/${id}`, { method: "DELETE", token });
}

// Every pricing read/write below is scoped to one of the coverage's
// allowable periods (coverageInDays) — a coverage can charge differently for
// its 180-day period than its 365-day one.
export function getCoveragePricing(token, coverageId, coverageInDays) {
  return request(`/coverages/${coverageId}/pricing?coverage_in_days=${coverageInDays}`, { token });
}

// payload is { pricing_mode, coverage_in_days, standard_rate? } —
// standard_rate only applies (and is only saved) when pricing_mode is PERCENTAGE.
export function updateCoveragePricingMode(token, coverageId, payload) {
  return request(`/coverages/${coverageId}/pricing`, { method: "PATCH", token, body: payload });
}

export function updateValuePercentageTiers(token, coverageId, coverageInDays, tiers) {
  return request(`/coverages/${coverageId}/value-percentage-tiers`, {
    method: "PUT",
    token,
    body: { coverage_in_days: coverageInDays, tiers },
  });
}

export function updateFlatTiers(token, coverageId, coverageInDays, tiers) {
  return request(`/coverages/${coverageId}/flat-tiers`, {
    method: "PUT",
    token,
    body: { coverage_in_days: coverageInDays, tiers },
  });
}

// Adds a new allowable period to a coverage — used from the Manage Coverage
// Pricing page's period picker when the admin wants a day count that isn't
// already one of the coverage's options.
export function createAllowablePeriod(token, coverageId, coverageInDays) {
  return request(`/coverages/${coverageId}/allowable-periods`, {
    method: "POST",
    token,
    body: { coverage_in_days: coverageInDays },
  });
}
