// Content for the two automatic emails a PolicyApplication can trigger —
// kept as one shared lib (unlike the PDF builders in src/pdf/, which are
// deliberately duplicated per document layout) because this is the *same*
// wording reused verbatim from three call sites (POST /policy-applications,
// POST /policy-quotations/:id/submit, POST /policy-approval/:id/approve),
// not a per-document layout that could ever need to diverge.

const PAYMENT_METHOD_LABELS = {
  CASH: "Cash",
  CHECK: "Check",
  CREDIT_CARD: "Credit Card",
  BANK_TRANSFER: "Bank Transfer",
  ONLINE_PAYMENT: "Online Payment",
};

function formatMoney(value) {
  const n = Number(value || 0);
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

// Sent the moment an application is filed/submitted (fresh, or via
// quotation submit) when send_policy_to_email is checked — governed
// entirely by that flag, independent of send_policy_to_email_on_approval
// below. `detail` is the same flat shape toApplicationDetail() produces,
// plus payment_method/payment_remittance/agent_name (all already on it).
function buildSubmissionEmailContent(detail) {
  const paymentMethodLabel = PAYMENT_METHOD_LABELS[detail.payment_method] || detail.payment_method;
  const remittanceNote = detail.payment_remittance === "THROUGH_AGENT" ? " (through your agent)" : " (directly to Bethel)";
  const agentName = detail.agent_name || detail.agent_code;

  const subject = `Your Bethel Insurance Policy Application ${detail.application_number} is Now Under Approval`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111">
      <p>Dear ${detail.insured_name},</p>
      <p>Your policy application (No. ${detail.application_number}) with Bethel General Insurance and Surety Corp. is now under approval. Kindly settle your payment amount of <strong>${formatMoney(detail.total_amount)}</strong> to your esteemed agent, ${agentName}, with your mode of payment: <strong>${paymentMethodLabel}</strong>${remittanceNote}. Thank you.</p>
      <p>Please find your policy application attached as a PDF for your reference.</p>
    </div>
  `;
  const text = [
    `Dear ${detail.insured_name},`,
    "",
    `Your policy application (No. ${detail.application_number}) with Bethel General Insurance and Surety Corp. is now under approval. Kindly settle your payment amount of ${formatMoney(detail.total_amount)} to your esteemed agent, ${agentName}, with your mode of payment: ${paymentMethodLabel}${remittanceNote}. Thank you.`,
    "",
    "Please find your policy application attached as a PDF for your reference.",
  ].join("\n");

  return { subject, html, text };
}

// Sent only once POST /policy-approval/:id/approve actually approves the
// application, when send_policy_to_email_on_approval is checked. `detail`
// here is the application's own corrected detail (post-applyChangesToDetail)
// plus the freshly issued policy's number/effective/expiry dates.
function buildApprovalEmailContent(detail) {
  const subject = `Your Bethel Insurance Policy ${detail.policy_number} Has Been Approved`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111">
      <p>Dear ${detail.insured_name},</p>
      <p>We are pleased to inform you that your policy application (No. ${detail.application_number}) has been approved and issued as <strong>Policy No. ${detail.policy_number}</strong>, effective ${fmtDate(detail.coverage_start_at)} to ${fmtDate(detail.coverage_end_at)}.</p>
      <p>Please find your approved policy attached as a PDF. Thank you for choosing Bethel General Insurance and Surety Corp.</p>
    </div>
  `;
  const text = [
    `Dear ${detail.insured_name},`,
    "",
    `We are pleased to inform you that your policy application (No. ${detail.application_number}) has been approved and issued as Policy No. ${detail.policy_number}, effective ${fmtDate(detail.coverage_start_at)} to ${fmtDate(detail.coverage_end_at)}.`,
    "",
    "Please find your approved policy attached as a PDF. Thank you for choosing Bethel General Insurance and Surety Corp.",
  ].join("\n");

  return { subject, html, text };
}

module.exports = { buildSubmissionEmailContent, buildApprovalEmailContent };
