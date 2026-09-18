import { Chip } from "@mui/material";

// Shared by PolicyApplications.jsx (an agent's own tracker) and
// PolicyApproval.jsx (the cross-agent approval queue) — both render the same
// ApplicationStatus values, so the label/color mapping lives in one place.
// STATUS_LABELS is also exported so both pages' own status-filter dropdown
// can list the same options/labels instead of a third duplicated map.
export const STATUS_LABELS = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const STATUS_COLORS = {
  SUBMITTED: "info",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "error",
};

export function StatusChip({ status }) {
  return <Chip size="small" label={STATUS_LABELS[status] || status} color={STATUS_COLORS[status] || "default"} />;
}
