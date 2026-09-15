import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  IconButton,
  Tooltip,
  Stack,
} from "@mui/material";
import EmailIcon from "@mui/icons-material/Email";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { useAuth } from "../context/AuthContext";
import { listMyPolicies, resendPolicyEmail } from "../api/client";
import { formatPHP } from "../utils/currency";
import { PolicyDetailDialog } from "../components/PolicyDetailDialog";

// PolicyStatus's own label/color mapping — kept local, same precedent as the
// two dialogs' locally-duplicated CHANGE_TYPE_LABELS, since StatusChip.jsx is
// specifically ApplicationStatus's mapping and PolicyStatus is a different
// enum with different values (ACTIVE/EXPIRED/CANCELLED/LAPSED).
const POLICY_STATUS_LABELS = { ACTIVE: "Active", EXPIRED: "Expired", CANCELLED: "Cancelled", LAPSED: "Lapsed" };
const POLICY_STATUS_COLORS = { ACTIVE: "success", EXPIRED: "default", CANCELLED: "error", LAPSED: "warning" };

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

// An agent's own book of already-issued policies across all their clients
// (routes/policies.js, GET /policies — own-agent-scoped, same as Policy
// Applications' own tracker). Row click opens PolicyDetailDialog, which
// renders the final, signed policy PDF (pdf/policyPdf.js) — every branch
// manager portion on it is duly signed, unlike a quotation/application's
// still-blank signature line.
export function ClientPolicies() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  // Which row's "Resend to client" is in flight, and the outcome of the last
  // one — a top-level Alert rather than a per-row one, since only one resend
  // can realistically be in flight at a time from this table.
  const [resendingId, setResendingId] = useState(null);
  const [resendResult, setResendResult] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    listMyPolicies(token, page + 1, rowsPerPage)
      .then((data) => {
        setRows(data.data);
        setTotal(data.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, page, rowsPerPage]);

  async function handleResend(e, policyId) {
    e.stopPropagation();
    setResendingId(policyId);
    setResendResult(null);
    try {
      const res = await resendPolicyEmail(token, policyId);
      setResendResult({ severity: "success", message: `Policy resent to ${res.to}.` });
    } catch (err) {
      setResendResult({ severity: "error", message: err.message });
    } finally {
      setResendingId(null);
    }
  }

  // Opens the Policy Applications tracker's "New Application" wizard,
  // pre-filled from this policy — see PolicyApplications.jsx's own ?renew=
  // deep-link handling (mirrors Quotations.jsx's ?open= link to the
  // converted application) and routes/policies.js's GET /:id/renewal-prefill.
  function handleRenew(e, policyId) {
    e.stopPropagation();
    navigate(`/policy-application?renew=${policyId}`);
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Client Policies
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {resendResult && (
        <Alert severity={resendResult.severity} sx={{ mb: 2 }} onClose={() => setResendResult(null)}>
          {resendResult.message}
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
                  <TableCell>Policy #</TableCell>
                  <TableCell>COC No.</TableCell>
                  <TableCell>SA No.</TableCell>
                  <TableCell>Insured</TableCell>
                  <TableCell>Class</TableCell>
                  <TableCell>Product Variant</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Effective</TableCell>
                  <TableCell>Expiry</TableCell>
                  <TableCell align="right">Total Premium</TableCell>
                  <TableCell>Issued</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      No policies have been issued for your clients yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((p) => (
                    <TableRow
                      key={p.id}
                      hover
                      onClick={() => setSelected({ id: p.id, policyNumber: p.policy_number })}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>{p.policy_number}</TableCell>
                      <TableCell>{p.coc_number || "—"}</TableCell>
                      <TableCell>{p.sa_number || "—"}</TableCell>
                      <TableCell>{p.insured_name || "—"}</TableCell>
                      <TableCell>{p.class_name}</TableCell>
                      <TableCell>{p.variant_name}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={POLICY_STATUS_LABELS[p.policy_status] || p.policy_status}
                          color={POLICY_STATUS_COLORS[p.policy_status] || "default"}
                        />
                      </TableCell>
                      <TableCell>{fmtDate(p.effective_date)}</TableCell>
                      <TableCell>{fmtDate(p.expiry_date)}</TableCell>
                      <TableCell align="right">{formatPHP(p.total_premium)}</TableCell>
                      <TableCell>{fmtDate(p.issue_date)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Resend to client">
                            <span>
                              <IconButton
                                size="small"
                                onClick={(e) => handleResend(e, p.id)}
                                disabled={resendingId === p.id}
                              >
                                <EmailIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Renew This Policy">
                            <IconButton size="small" onClick={(e) => handleRenew(e, p.id)}>
                              <AutorenewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
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

      {selected && (
        <PolicyDetailDialog
          policyId={selected.id}
          policyNumber={selected.policyNumber}
          token={token}
          onClose={() => setSelected(null)}
        />
      )}
    </Container>
  );
}
