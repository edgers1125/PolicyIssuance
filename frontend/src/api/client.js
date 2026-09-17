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
    const err = new Error(data?.error || `Request failed with status ${res.status}`);
    // Some 409s (see lib/policyConflicts.js) carry structured extra fields
    // (e.g. `conflict: { policy_id, ... }`) alongside the message, letting a
    // caller offer a direct follow-up action instead of a dead-end error.
    if (data && typeof data === "object") err.data = data;
    throw err;
  }

  return data;
}

// Builds a query string from a flat {key: value} object, dropping any
// key whose value is undefined/null/"" — shared by every tracker's list*
// function below so an unset search/filter never sends an empty param the
// backend would otherwise have to specifically ignore.
function buildQueryString(params) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") usp.set(key, value);
  }
  return usp.toString();
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

export function createUser(token, { email, first_name, last_name, role_id, permission_ids, agent_id }) {
  return request("/users", {
    method: "POST",
    token,
    body: { email, first_name, last_name, role_id, permission_ids, agent_id },
  });
}

export function updateUser(token, id, payload) {
  return request(`/users/${id}`, { method: "PATCH", token, body: payload });
}

// The Add/Edit User dialogs' "Agent" picker — every INDIVIDUAL agent on
// file (a CORPORATE one has no login of its own), each flagged has_user if
// already linked to a different account.
export function listAgentsForUserLink(token) {
  return request("/users/agents", { token });
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

// Nested class -> variant -> coverage tree for Settings -> Manage Products
// (MANAGE_SETTINGS.MANAGE_PRODUCTS) — create/delete each tier of the catalog.
export function listInsuranceClasses(token) {
  return request("/insurance-classes", { token });
}

export function createInsuranceClass(token, payload) {
  return request("/insurance-classes", { method: "POST", token, body: payload });
}

// payload is { class_name?, description? } — renaming/re-describing, gated
// on MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_DETAILS.
export function updateInsuranceClass(token, id, payload) {
  return request(`/insurance-classes/${id}`, { method: "PATCH", token, body: payload });
}

// payload requires deductible_rate/misc_fee (unlike updateProductVariant
// below, which can clear either back to null) — a new variant must already
// be fully priced: deductible_rate for the policy schedule's Section III
// Deductible/Authorized Repair Limit line (the repair limit itself is just
// that deductible plus a fixed towing amount, so there's no second rate to
// send here), misc_fee as the flat "Miscellaneous" charge every filing under
// this variant will carry (0 is a valid choice).
export function createProductVariant(token, payload) {
  return request("/product-variants", { method: "POST", token, body: payload });
}

export function createProductCoverage(token, payload) {
  return request("/product-coverages", { method: "POST", token, body: payload });
}

export function updateCoverage(token, id, payload) {
  return request(`/coverages/${id}`, { method: "PATCH", token, body: payload });
}

// Settings → Manage Products' "Save" on staged/pending deletions — deletes
// every marked class/variant/coverage/allowable-period together in one
// request/transaction rather than one request per item. payload is
// { class_ids?, variant_ids?, coverage_ids?, period_ids? } — any array can be
// omitted/empty; deleting a class or variant cascades server-side to
// everything under it.
export function batchDeleteCatalogItems(token, payload) {
  return request("/manage-products/batch-delete", { method: "PATCH", token, body: payload });
}

// payload is { deductible_rate?, misc_fee? } — either can be set to a
// number or cleared back to null independently.
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
// filters: { search?, status?, policy_type?, class_id? } — all optional,
// see schemas/policyApplications.js's listApplicationsQuerySchema.
export function listApplications(token, page = 1, pageSize = 20, filters = {}) {
  const qs = buildQueryString({ page, page_size: pageSize, ...filters });
  return request(`/policy-applications?${qs}`, { token });
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
// filters: { search?, status?, class_id? } — see
// schemas/policyQuotations.js's listQuotationsQuerySchema.
export function listQuotations(token, page = 1, pageSize = 20, filters = {}) {
  const qs = buildQueryString({ page, page_size: pageSize, ...filters });
  return request(`/policy-quotations?${qs}`, { token });
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
// filters: { search?, status?, policy_type?, class_id?, agent_id? } — see
// schemas/policyApproval.js's listAllApplicationsQuerySchema.
export function listApplicationsForApproval(token, page = 1, pageSize = 20, filters = {}) {
  const qs = buildQueryString({ page, page_size: pageSize, ...filters });
  return request(`/policy-approval?${qs}`, { token });
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

// The approval dialog's "Reject" action — payload is { remarks } (required).
export function rejectApplication(token, id, payload) {
  return request(`/policy-approval/${id}/reject`, { method: "POST", token, body: payload });
}

export function listAgents(token) {
  return request("/agents", { token });
}

// My Agents' "Add Agent"/"Add Company" action — payload is
// { agent_type, agent_code, agent_name, work_email, company_id?,
// linked_company_id?, new_company? }. company_id links an INDIVIDUAL to an
// existing CORPORATE agency; linked_company_id/new_company instead back a
// CORPORATE agent with a real insured-party Company record (pick one
// existing, or create a new one in the same request) — never both.
export function createAgent(token, payload) {
  return request("/agents", { method: "POST", token, body: payload });
}

// My Agents' "Add Agent" (Company type) dialog's "link an existing company"
// picker — every ACTIVE company not already backing another agency.
export function listCompaniesForAgentLinking(token) {
  return request("/companies/for-agent-linking", { token });
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

// payload is { threshold_seats } — null clears the override back to the
// coverage's own default. The tier menu itself (insured amount per
// occupant + rate) is a separate override — see updateAgentSeatTiers below.
export function updateAgentSeatsBasedPricing(token, agentId, coverageId, coverageInDays, threshold_seats) {
  return request(`/agents/${agentId}/seats-based-pricing/${coverageId}`, {
    method: "PUT",
    token,
    body: { coverage_in_days: coverageInDays, threshold_seats },
  });
}

export function updateAgentSeatTiers(token, agentId, coverageId, coverageInDays, tiers) {
  return request(`/agents/${agentId}/seats-tiers/${coverageId}`, {
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

// payload is { pricing_mode, coverage_in_days, standard_rate?, threshold_seats? }
// — standard_rate only applies when pricing_mode is PERCENTAGE;
// threshold_seats only applies when it's VEHICLE_SEATS_BASED (the tier menu
// itself is a separate replace-all call — see updateSeatTiers below).
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

// tiers is [{ insured_amount_per_occupant, rate_per_excess_seat }] — the
// VEHICLE_SEATS_BASED "Insured amount for each occupant" dropdown's options.
export function updateSeatTiers(token, coverageId, coverageInDays, tiers) {
  return request(`/coverages/${coverageId}/seats-tiers`, {
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
// filters: { search?, policy_status?, class_id? } — see
// schemas/policies.js's listPoliciesQuerySchema.
export function listMyPolicies(token, page = 1, pageSize = 20, filters = {}) {
  const qs = buildQueryString({ page, page_size: pageSize, ...filters });
  return request(`/policies?${qs}`, { token });
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

// My Clients page's "Clients" tab — every customer/company on file for the
// caller's own agent, annotated with premium production. filters: { search?, type? }.
export function listMyClients(token, page = 1, pageSize = 20, filters = {}) {
  const qs = buildQueryString({ page, page_size: pageSize, ...filters });
  return request(`/policies/clients?${qs}`, { token });
}

// In-Lease Backlogs page. filters: { search?, status? } (status is
// PENDING/ACCOMPLISHED — derived, not a stored column, see
// schemas/inLeaseBacklog.js's listInLeaseBacklogQuerySchema).
export function listInLeaseBacklogs(token, page = 1, pageSize = 20, filters = {}) {
  const qs = buildQueryString({ page, page_size: pageSize, ...filters });
  return request(`/inlease-backlogs?${qs}`, { token });
}

// One policy's full in-lease detail (the copyable-fields dialog) — id is the
// Policy's own id.
export function getInLeaseBacklogDetail(token, policyId) {
  return request(`/inlease-backlogs/${policyId}`, { token });
}

// id is the InLeaseBacklog task's own id (detail's current_task_id), not the
// policy's — see routes/inLeaseBacklog.js.
export function accomplishInLeaseTask(token, taskId) {
  return request(`/inlease-backlogs/${taskId}/accomplish`, { method: "POST", token });
}

export function undoInLeaseTask(token, taskId) {
  return request(`/inlease-backlogs/${taskId}/undo`, { method: "POST", token });
}

// Endorsements (routes/endorsements.js, /endorsements) — amendments filed
// against an already-issued Policy without ever rewriting its own row (see
// EndorsementChange). Client Policies page's own two-pane dialog uses
// listEndorsementsForPolicy/getEndorsementContext/previewEndorsementPdf/
// createEndorsementRequest/downloadEndorsementPdf/resendEndorsementEmail;
// the Endorsement Approval tab uses the rest.

// One policy's own endorsement history, every status, oldest first.
export function listEndorsementsForPolicy(token, policyId) {
  return request(`/endorsements/policy/${policyId}`, { token });
}

// The policy's current state (every already-approved endorsement folded
// in) — feeds the "Create Endorsement Request" composer's vehicle/coverage
// pickers and "current value" placeholders, before any endorsement of its
// own exists yet.
export function getEndorsementContext(token, policyId) {
  return request(`/endorsements/policy/${policyId}/context`, { token });
}

// Read-only render of a not-yet-saved batch of changes — payload is
// { policy_id, effective_date, changes: [...] } (see createEndorsementRequest
// below for the changes[] shape). Returns a PDF Blob.
export function previewEndorsementPdf(token, payload) {
  return requestBlob("/endorsements/preview-pdf", { method: "POST", token, body: payload });
}

// Files a new endorsement request — the Client Policies page's "Create
// Endorsement Request" composer's own submit action. payload is
// { policy_id, effective_date, remarks?, send_policy_to_email?,
// send_policy_to_email_on_approval?, changes: [{ change_type,
// policy_vehicle_id?, policy_coverage_id?, new_value?, new_address?,
// remarks? }] } — one or more changes, all filed together in one request.
export function createEndorsementRequest(token, payload) {
  return request("/endorsements", { method: "POST", token, body: payload });
}

// Full detail for one endorsement, including its own change list — backs
// both the create-side history view and the Endorsement Approval review
// dialog.
export function getEndorsement(token, id) {
  return request(`/endorsements/${id}`, { token });
}

// The endorsement's own PDF — pending-watermarked while SUBMITTED, plain
// "REJECTED" stamp once rejected, fully signed once APPROVED.
export function downloadEndorsementPdf(token, id) {
  return requestBlob(`/endorsements/${id}/pdf`, { token });
}

export function resendEndorsementEmail(token, id) {
  return request(`/endorsements/${id}/resend-email`, { method: "POST", token });
}

// The Endorsement Approval queue — every endorsement request in the system,
// from every agent. filters: { search?, status? }.
export function listEndorsementsForApproval(token, page = 1, pageSize = 20, filters = {}) {
  const qs = buildQueryString({ page, page_size: pageSize, ...filters });
  return request(`/endorsements?${qs}`, { token });
}

// Endorsement Approval review dialog's "Create Change" action — adds one
// more line to a still-SUBMITTED endorsement. payload shape matches one
// entry of createEndorsementRequest's own changes[] array.
export function createEndorsementChange(token, id, payload) {
  return request(`/endorsements/${id}/changes`, { method: "POST", token, body: payload });
}

// Edits one existing change line (same payload shape) — change_from is
// always recomputed server-side, never trusted from the client.
export function updateEndorsementChange(token, id, changeId, payload) {
  return request(`/endorsements/${id}/changes/${changeId}`, { method: "PATCH", token, body: payload });
}

export function deleteEndorsementChange(token, id, changeId) {
  return request(`/endorsements/${id}/changes/${changeId}`, { method: "DELETE", token });
}

export function approveEndorsement(token, id) {
  return request(`/endorsements/${id}/approve`, { method: "POST", token });
}

// payload is { remarks } (required).
export function rejectEndorsement(token, id, payload) {
  return request(`/endorsements/${id}/reject`, { method: "POST", token, body: payload });
}

// Accounting (routes/accounting.js, /accounting) — the Accounting page's two
// tabs. GET /overview is unpaginated (one row per agent, mirroring
// listAgents' own shape) since it reads Agent.payable directly rather than
// aggregating the ledger live; GET /transactions is the full paginated
// AgentPayableTransaction audit log across every agent.
export function listAccountingOverview(token) {
  return request("/accounting/overview", { token });
}

// filters: { search?, transaction_type?, agent_id? }.
export function listAccountingTransactions(token, page = 1, pageSize = 20, filters = {}) {
  const qs = buildQueryString({ page, page_size: pageSize, ...filters });
  return request(`/accounting/transactions?${qs}`, { token });
}

// Records a manual payment against an agent's payable balance — payload is
// { agent_id, amount, remarks? }; amount is entered as a plain positive
// number (how much was paid out) and negated server-side.
export function recordAgentPayment(token, payload) {
  return request("/accounting/payments", { method: "POST", token, body: payload });
}
