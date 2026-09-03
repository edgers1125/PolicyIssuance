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

export function createPolicyApplication(token, payload) {
  return request("/policy-applications", { method: "POST", token, body: payload });
}

export function listAgents(token) {
  return request("/agents", { token });
}

export function getAgentNetrates(token, agentId) {
  return request(`/agents/${agentId}/netrates`, { token });
}

export function updateAgentNetrates(token, agentId, netrates) {
  return request(`/agents/${agentId}/netrates`, { method: "PUT", token, body: { netrates } });
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
