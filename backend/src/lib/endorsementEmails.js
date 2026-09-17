// Content for the two automatic emails an EndorsementRequest can trigger —
// mirrors lib/applicationEmails.js's own pair (buildSubmissionEmailContent/
// buildApprovalEmailContent), kept as a separate file since these describe a
// different document (an amendment to an already-issued policy, not a new
// one) even though the shape is identical.

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

// Sent the moment an endorsement request is filed (POST /endorsements) when
// send_policy_to_email is checked — the client's early notice that an
// amendment has been requested against their policy, attached as a
// PENDING-APPROVAL-watermarked draft of the endorsement PDF.
function buildEndorsementSubmittedEmailContent({ insuredName, policyNumber, endorsementNumber }) {
  const subject = `Endorsement Request Filed Against Your Bethel Insurance Policy ${policyNumber}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111">
      <p>Dear ${insuredName},</p>
      <p>An endorsement request (No. ${endorsementNumber}) has been filed against your policy (No. ${policyNumber}) with Bethel General Insurance and Surety Corp., and is now under review.</p>
      <p>Please find a draft of the requested endorsement attached as a PDF for your reference. You will receive another notice once it has been approved.</p>
    </div>
  `;
  const text = [
    `Dear ${insuredName},`,
    "",
    `An endorsement request (No. ${endorsementNumber}) has been filed against your policy (No. ${policyNumber}) with Bethel General Insurance and Surety Corp., and is now under review.`,
    "",
    "Please find a draft of the requested endorsement attached as a PDF for your reference. You will receive another notice once it has been approved.",
  ].join("\n");

  return { subject, html, text };
}

// Sent only once POST /endorsements/:id/approve actually approves the
// request, when send_policy_to_email_on_approval is checked — the final,
// signed endorsement PDF.
function buildEndorsementApprovedEmailContent({ insuredName, policyNumber, endorsementNumber, effectiveDate }) {
  const subject = `Endorsement ${endorsementNumber} to Your Bethel Insurance Policy ${policyNumber} Has Been Approved`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111">
      <p>Dear ${insuredName},</p>
      <p>We are pleased to inform you that endorsement No. ${endorsementNumber} to your policy (No. ${policyNumber}) has been approved, effective ${fmtDate(effectiveDate)}.</p>
      <p>Please find the approved endorsement attached as a PDF. Thank you for choosing Bethel General Insurance and Surety Corp.</p>
    </div>
  `;
  const text = [
    `Dear ${insuredName},`,
    "",
    `We are pleased to inform you that endorsement No. ${endorsementNumber} to your policy (No. ${policyNumber}) has been approved, effective ${fmtDate(effectiveDate)}.`,
    "",
    "Please find the approved endorsement attached as a PDF. Thank you for choosing Bethel General Insurance and Surety Corp.",
  ].join("\n");

  return { subject, html, text };
}

module.exports = { buildEndorsementSubmittedEmailContent, buildEndorsementApprovedEmailContent };
