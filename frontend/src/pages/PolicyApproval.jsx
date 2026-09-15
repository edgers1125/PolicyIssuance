import { useEffect, useState } from "react";
import {
  Container,
  Typography,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TablePagination,
  Box,
  Alert,
  CircularProgress,
  Chip,
} from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { listApplicationsForApproval } from "../api/client";
import { formatPHP } from "../utils/currency";
import { StatusChip } from "../components/StatusChip";
import { ApplicationReviewDialog } from "../components/ApplicationReviewDialog";

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

// ApplicationPolicyType's own label/color mapping — kept local, same
// precedent as PolicyApplications.jsx's own copy of this.
const POLICY_TYPE_LABELS = { NEW_POLICY: "New Policy", RENEWAL: "Renewal" };
const POLICY_TYPE_COLORS = { NEW_POLICY: "default", RENEWAL: "info" };

// The approval queue — every application in the system, from every agent
// (routes/policyApproval.js, gated on APPROVE_APPLICATION rather than
// CREATE_APPLICATION, so an approver who isn't also an agent can still see
// it). Row click opens ApplicationReviewDialog — one wide popup with the
// PDF on the left and the change-history/"Create Change"/"Approve" panel on
// the right, side by side, rather than a separate Actions-column button
// opening its own dialog.
export function PolicyApproval() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(null);

  function loadApplications() {
    setLoading(true);
    setError("");
    return listApplicationsForApproval(token, page + 1, rowsPerPage)
      .then((data) => {
        setRows(data.data);
        setTotal(data.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, rowsPerPage]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Policy Approval
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Application #</TableCell>
                  <TableCell>Agent</TableCell>
                  <TableCell>Insured</TableCell>
                  <TableCell>Class</TableCell>
                  <TableCell>Product Variant</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Insured From</TableCell>
                  <TableCell>Insured To</TableCell>
                  <TableCell align="right">Total Premium</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      No policy applications yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((a) => (
                    <TableRow
                      key={a.id}
                      hover
                      onClick={() => setReviewing({ id: a.id, applicationNumber: a.application_number })}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>{a.application_number}</TableCell>
                      <TableCell>{a.agent_name || a.agent_code}</TableCell>
                      <TableCell>{a.insured_name || "—"}</TableCell>
                      <TableCell>{a.class_name}</TableCell>
                      <TableCell>{a.variant_name}</TableCell>
                      <TableCell>
                        <StatusChip status={a.status} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={POLICY_TYPE_LABELS[a.policy_type] || a.policy_type}
                          color={POLICY_TYPE_COLORS[a.policy_type] || "default"}
                        />
                      </TableCell>
                      <TableCell>{fmtDate(a.coverage_start_at)}</TableCell>
                      <TableCell>{fmtDate(a.coverage_end_at)}</TableCell>
                      <TableCell align="right">{formatPHP(a.total_premium)}</TableCell>
                      <TableCell>{fmtDate(a.created_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </Paper>
      )}

      {reviewing && (
        <ApplicationReviewDialog
          applicationId={reviewing.id}
          applicationNumber={reviewing.applicationNumber}
          token={token}
          onClose={() => setReviewing(null)}
          onApproved={loadApplications}
        />
      )}
    </Container>
  );
}
