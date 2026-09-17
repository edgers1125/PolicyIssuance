import { useEffect, useState } from "react";
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
  TextField,
  MenuItem,
  InputAdornment,
  Stack,
  Button,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useAuth } from "../context/AuthContext";
import { listApplicationsForApproval } from "../api/client";
import { formatPHP } from "../utils/currency";
import { StatusChip, STATUS_LABELS } from "../components/StatusChip";
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
// opening its own dialog. The "Policy Approval" tab of pages/Approvals.jsx —
// no outer Container/heading of its own, since that page supplies the
// shared page chrome + horizontal Tabs above both it and EndorsementApproval.jsx
// (same relationship as MyClients.jsx's own two tabs).
export function PolicyApproval() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(null);

  // Search/filter bar — server-side (see listAllApplicationsQuerySchema),
  // search debounced so it doesn't re-fetch on every keystroke. Search also
  // matches the filing agent's own code/name, unique to this cross-agent view.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [policyTypeFilter, setPolicyTypeFilter] = useState("");
  const hasActiveFilters = Boolean(search || statusFilter || policyTypeFilter);

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

  function handlePolicyTypeFilterChange(value) {
    setPolicyTypeFilter(value);
    setPage(0);
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("");
    setPolicyTypeFilter("");
    setPage(0);
  }

  function loadApplications() {
    setLoading(true);
    setError("");
    return listApplicationsForApproval(token, page + 1, rowsPerPage, {
      search: debouncedSearch,
      status: statusFilter,
      policy_type: policyTypeFilter,
    })
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
  }, [token, page, rowsPerPage, debouncedSearch, statusFilter, policyTypeFilter]);

  return (
    <>
      <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
          <TextField
            placeholder="Search by application #, insured name, or agent"
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
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Type"
            value={policyTypeFilter}
            onChange={(e) => handlePolicyTypeFilterChange(e.target.value)}
            size="small"
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All types</MenuItem>
            {Object.entries(POLICY_TYPE_LABELS).map(([value, label]) => (
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
                  <TableCell>Class / Variant</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Coverage Period</TableCell>
                  <TableCell align="right">Total Premium</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      {hasActiveFilters ? "No applications match your search/filters." : "No policy applications yet."}
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
                      <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{a.application_number}</TableCell>
                      <TableCell>{a.agent_name || a.agent_code}</TableCell>
                      <TableCell>{a.insured_name || "—"}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{a.class_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {a.variant_name}
                        </Typography>
                      </TableCell>
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
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {fmtDate(a.coverage_start_at)} – {fmtDate(a.coverage_end_at)}
                      </TableCell>
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
    </>
  );
}
