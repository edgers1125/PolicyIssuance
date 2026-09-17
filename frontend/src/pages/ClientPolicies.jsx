import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
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
  TextField,
  MenuItem,
  InputAdornment,
  Button,
  Typography,
} from "@mui/material";
import EmailIcon from "@mui/icons-material/Email";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import SearchIcon from "@mui/icons-material/Search";
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
// still-blank signature line. The "Client Policies" tab of MyClients.jsx —
// no outer Container/heading of its own, since that page supplies the
// shared page chrome + horizontal Tabs above both it and Clients.jsx.
export function ClientPoliciesTable() {
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

  // Search/filter bar — server-side (see listPoliciesQuerySchema), search
  // debounced so it doesn't re-fetch on every keystroke.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const hasActiveFilters = Boolean(search || statusFilter);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  function handleStatusFilterChange(value) {
    setStatusFilter(value);
    setPage(0);
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("");
    setPage(0);
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    listMyPolicies(token, page + 1, rowsPerPage, { search: debouncedSearch, policy_status: statusFilter })
      .then((data) => {
        setRows(data.data);
        setTotal(data.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, page, rowsPerPage, debouncedSearch, statusFilter]);

  async function handleResend(policyId, e) {
    e?.stopPropagation();
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
  // `e` is optional so the same handler works both from the table's Actions
  // column (stopPropagation needed there) and from PolicyDetailDialog's own
  // lower-left action bar (no row click underneath to guard against).
  function handleRenew(policyId, e) {
    e?.stopPropagation();
    navigate(`/policy-application?renew=${policyId}`);
  }

  return (
    <>
      <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
          <TextField
            placeholder="Search by policy # or insured name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            fullWidth
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField
            select
            label="Status"
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            {Object.entries(POLICY_STATUS_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          {hasActiveFilters && (
            <Button onClick={clearFilters} size="small">
              Clear filters
            </Button>
          )}
        </Stack>
      </Paper>

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
                  <TableCell>Insured</TableCell>
                  <TableCell>Class / Variant</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Coverage Period</TableCell>
                  <TableCell align="right">Total Premium</TableCell>
                  <TableCell>Issued</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      {hasActiveFilters ? "No policies match your search/filters." : "No policies have been issued for your clients yet."}
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
                      <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{p.policy_number}</TableCell>
                      <TableCell>{p.insured_name || "—"}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{p.class_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {p.variant_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={POLICY_STATUS_LABELS[p.policy_status] || p.policy_status}
                          color={POLICY_STATUS_COLORS[p.policy_status] || "default"}
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {fmtDate(p.effective_date)} – {fmtDate(p.expiry_date)}
                      </TableCell>
                      <TableCell align="right">{formatPHP(p.total_premium)}</TableCell>
                      <TableCell>{fmtDate(p.issue_date)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                          <Tooltip title="Resend to client">
                            <span>
                              <IconButton
                                size="small"
                                onClick={(e) => handleResend(p.id, e)}
                                disabled={resendingId === p.id}
                              >
                                <EmailIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Renew This Policy">
                            <IconButton size="small" onClick={(e) => handleRenew(p.id, e)}>
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
    </>
  );
}
