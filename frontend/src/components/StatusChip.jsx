import { Chip } from "@mui/material";

// Shared by PolicyApplications.jsx (an agent's own tracker) and
// PolicyApproval.jsx (the cross-agent approval queue) — both render the same
// ApplicationStatus values, so the label/color mapping lives in one place.
const STATUS_LABELS = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  FOR_EDIT_MANAGER: "For Edit (Manager)",
  FOR_EDIT_UNDERWRITING: "For Edit (Underwriting)",
  PENDING_MANAGER_APPROVAL: "Pending Manager Approval",
  PENDING_UNDERWRITING_APPROVAL: "Pending Underwriting Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const STATUS_COLORS = {
  DRAFT: "default",
  SUBMITTED: "info",
  FOR_EDIT_MANAGER: "warning",
  FOR_EDIT_UNDERWRITING: "warning",
  PENDING_MANAGER_APPROVAL: "info",
  PENDING_UNDERWRITING_APPROVAL: "info",
  APPROVED: "success",
  REJECTED: "error",
};

export function StatusChip({ status }) {
  return <Chip size="small" label={STATUS_LABELS[status] || status} color={STATUS_COLORS[status] || "default"} />;
}
