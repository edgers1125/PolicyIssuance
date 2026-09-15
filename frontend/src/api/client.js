// VITE_API_URL is an explicit override (e.g. pointing at a staging backend).
// Left unset, this derives the backend's address from whatever host the page
// itself was loaded from, on the known dev port — so the same build works
// from http://localhost:5173 *and* from http://<lan-ip>:5173 when another
// device on the network opens it, without hardcoding "localhost" (which
// would otherwise resolve to that device itself, not this machine, and every
// API call would fail to connect).
const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:4000`;

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

// Same contract as request() but for endpoints that return a PDF instead of
// JSON — the resulting Blob is handed to the caller to open/download.
async function requestBlob(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }

  return res.blob();
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

// Flat list of every active product variant — Settings → Vehicle Rates'
// picker (MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING).
export function listProductVariants(token) {
  return request("/product-variants", { token });
}

// payload is { deductible_rate?, authorized_repair_limit_rate? } — either can
// be set to a number or cleared back to null independently.
export function updateProductVariant(token, id, payload) {
  return request(`/product-variants/${id}`, { method: "PATCH", token, body: payload });
}

export function listMyCustomers(token) {
  return request("/customers", { token });
}

export function createCustomer(token, payload) {
  return request("/customers", { method: "POST", token, body: payload });
}

// Customers connected to a *chosen* agent rather than the caller's own —
// QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION's cross-agent customer picker on
// the New Quotation form, once an agent other than the caller's own has been
// selected. 403s without that permission.
export function listCustomersByAgent(token, agentId) {
  return request(`/customers/agent/${agentId}`, { token });
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

// Same as listCustomersByAgent above, for companies.
export function listCompaniesByAgent(token, agentId) {
  return request(`/companies/agent/${agentId}`, { token });
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

// Renders a PDF from live, not-yet-saved preview data — PolicyApplication's
// "Print / Save as PDF" button, before the application is actually
// submitted. `previewProps` matches backend/src/pdf/theme.js's canonical
// document prop shape (applicationNumber, insuredName, vehicles, coverages, ...).
export function previewApplicationPdf(token, previewProps) {
  return requestBlob("/policy-applications/preview-pdf", { method: "POST", token, body: previewProps });
}

// Paginated, latest-first — the Policy Applications tracker's list view.
export function listApplications(token, page = 1, pageSize = 20) {
  return request(`/policy-applications?page=${page}&page_size=${pageSize}`, { token });
}

// Full detail for one application — the Policy Applications tracker's row
// detail popup. Any recorded PolicyApplicationChange rows are already folded
// in, same as getApplicationForApproval below.
export function getApplication(token, id) {
  return request(`/policy-applications/${id}`, { token });
}

// Every change recorded against one of the caller's own applications, oldest
// first — the Policy Applications tracker detail popup's change-history
// list. Same response shape as listApplicationChanges below, just scoped to
// the caller's own agent.
export function listMyApplicationChanges(token, id) {
  return request(`/policy-applications/${id}/changes`, { token });
}

// PDF download for an already-saved application — the Policy Applications
// tracker detail popup's "Re-export PDF" action. Reflects any recorded
// changes, same as getApplication above.
export function downloadApplicationPdf(token, id) {
  return requestBlob(`/policy-applications/${id}/pdf`, { token });
}

export function resendApplicationEmail(token, id) {
  return request(`/policy-applications/${id}/resend-email`, { method: "POST", token });
}

// payload may include agent_id to file this quotation under an agent other
// than the caller's own — honored only when the caller holds
// QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION (403 otherwise); omitted, it's
// always the caller's own linked agent.
export function createPolicyQuotation(token, payload) {
  return request("/policy-quotations", { method: "POST", token, body: payload });
}

// Every active agent — QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION's "File
// under agent" picker on the New Quotation form. 403s without that permission.
export function listAgentsForQuotation(token) {
  return request("/policy-quotations/agents", { token });
}

// Same as previewApplicationPdf, for QuotationCreator's preview dialog.
export function previewQuotationPdf(token, previewProps) {
  return requestBlob("/policy-quotations/preview-pdf", { method: "POST", token, body: previewProps });
}

// PDF download for an already-saved quotation — the Quotation Tracker
// detail popup's "Re-export PDF" action.
export function downloadQuotationPdf(token, id) {
  return requestBlob(`/policy-quotations/${id}/pdf`, { token });
}

// Paginated, latest-first — the Quotation Tracker's list view.
export function listQuotations(token, page = 1, pageSize = 20) {
  return request(`/policy-quotations?page=${page}&page_size=${pageSize}`, { token });
}

// Full detail for one quotation — the Quotation Tracker's row detail popup.
export function getQuotation(token, id) {
  return request(`/policy-quotations/${id}`, { token });
}

export function resendQuotationEmail(token, id) {
  return request(`/policy-quotations/${id}/resend-email`, { method: "POST", token });
}

// The Quotation Tracker's Actions-column edit action — coverage period,
// whether it's emailed, and the priced coverages only (everything else about
// a quotation is fixed at creation).
export function updateQuotation(token, id, payload) {
  return request(`/policy-quotations/${id}`, { method: "PATCH", token, body: payload });
}

// The Quotation Tracker's Actions-column submit action — converts a
// quotation into a policy application. payload is just the payment info a
// quotation never collected ({ payment_method, payment_remittance,
// bethel_payment_method_id? }); everything else carries over from the
// quotation as-is. Returns the created PolicyApplication.
export function submitQuotation(token, id, payload) {
  return request(`/policy-quotations/${id}/submit`, { method: "POST", token, body: payload });
}

// Policy Approval — the cross-agent queue for users with APPROVE_APPLICATION
// (routes/policyApproval.js, mounted at /policy-approval). Every application
// in the system, not scoped to any one agent, unlike listApplications above.
export function listApplicationsForApproval(token, page = 1, pageSize = 20) {
  return request(`/policy-approval?page=${page}&page_size=${pageSize}`, { token });
}

// PDF download for the Policy Approval table's row detail popup — same
// contract as downloadApplicationPdf, just hitting the non-agent-scoped route.
export function downloadApplicationForApprovalPdf(token, id) {
  return requestBlob(`/policy-approval/${id}/pdf`, { token });
}

// Full JSON detail for one application, not scoped to any agent, with any
// recorded PolicyApplicationChange rows already folded in — backs the
// approval dialog's change form and change list.
export function getApplicationForApproval(token, id) {
  return request(`/policy-approval/${id}`, { token });
}

// Every change recorded against one application, oldest first.
export function listApplicationChanges(token, id) {
  return request(`/policy-approval/${id}/changes`, { token });
}

// Records one change (see the ApplicationChangeType enum) — the approval
// dialog's "Create Change" action. payload is
// { change_type, application_vehicle_id?, application_coverage_id?, new_value?, new_address?, effective_date?, remarks? } —
// new_address (address_line_1, address_line_2?, barangay?, city, province,
// postal_code?, country?) is used instead of new_value only for
// INSURED_ADDRESS_DETAILS; every other change type uses new_value.
export function createApplicationChange(token, id, payload) {
  return request(`/policy-approval/${id}/changes`, { method: "POST", token, body: payload });
}

// Approves the application and issues its Policy — the approval dialog's
// "Approve" action. payload is optional: { coc_number?, sa_number? } — an
// approver can attach either at the moment of approval; both are printed on
// the issued Policy PDF (see backend's pdf/policyPdf.js).
export function approveApplication(token, id, payload) {
  return request(`/policy-approval/${id}/approve`, { method: "POST", token, body: payload });
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

// Client Policies (routes/policies.js, /policies) — an agent's own book of
// already-issued policies across all their clients. Paginated, latest-first.
export function listMyPolicies(token, page = 1, pageSize = 20) {
  return request(`/policies?page=${page}&page_size=${pageSize}`, { token });
}

// Full detail for one policy — the Client Policies page's row detail dialog.
export function getPolicy(token, id) {
  return request(`/policies/${id}`, { token });
}

// The final, signed Policy PDF (pdf/policyPdf.js) — Client Policies page's
// view/download action.
export function downloadPolicyPdf(token, id) {
  return requestBlob(`/policies/${id}/pdf`, { token });
}

// Re-sends the issued policy's own signed PDF to whatever email is on file
// for the insured customer/company — Client Policies page's "Resend to
// client" action.
export function resendPolicyEmail(token, id) {
  return request(`/policies/${id}/resend-email`, { method: "POST", token });
}

// Everything the Policy Application wizard needs to open pre-filled from an
// already-issued Policy — Client Policies page's "Renew This Policy" action.
// See routes/policies.js's GET /:id/renewal-prefill for the full shape
// (existing_customer_id/existing_company_id/existing_vehicle_id/
// existing_address_id so the wizard can reuse each record the same way its
// own search-and-reuse flows already do, plus min_coverage_start_at — the
// source policy's own expiry_date, which coverage_start_at can never precede).
export function getPolicyRenewalPrefill(token, id) {
  return request(`/policies/${id}/renewal-prefill`, { token });
}
