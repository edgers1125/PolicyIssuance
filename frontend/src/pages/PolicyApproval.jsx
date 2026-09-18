import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Container,
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
  Dialog,
  DialogContent,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import { useAuth } from "../context/AuthContext";
import { listApplicationsForApproval, getApplicationForApproval } from "../api/client";
import { formatPHP } from "../utils/currency";
import { StatusChip, STATUS_LABELS } from "../components/StatusChip";
import { ApplicationReviewDialog } from "../components/ApplicationReviewDialog";
import { PolicyApplication } from "./PolicyApplication";

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
// opening its own dialog. Rendered directly by PolicyApplications.jsx (the
// /policy-application route, "Policy Issuance" in the sidebar) whenever the
// caller holds APPROVE_APPLICATION — that page picks exactly one of this or
// its own agent-scoped tracker/"New Application" flow to show, never both
// (own Container/heading here, same as that other view, since either one is
// this route's entire page now — previously this was Approvals.jsx's own
// "Policy Approval" tab, before that page was narrowed down to
// Endorsements.jsx and this got absorbed here instead).
export function PolicyApproval() {
  const { token, permissions } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // Gates the "New Admin Application" action below — files an application
  // under a chosen agent and immediately approves it (POST
  // /policy-approval/admin-applications), rather than a regular CREATE_APPLICATION
  // filing into the ordinary queue. Lives here rather than on
  // PolicyApplications.jsx/the Policy Applications page because
  // APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION is a sub-permission of
  // APPROVE_APPLICATION, not CREATE_APPLICATION — a caller could hold it
  // without holding CREATE_APPLICATION at all (an approver isn't necessarily
  // a filing agent), so that other page's own CREATE_APPLICATION gate would
  // block them from ever reaching it there.
  const canAdminCreate = permissions?.includes("APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Split "which application" from "is the dialog open" so ApplicationReviewDialog
  // (rendered unconditionally, keepMounted below) keeps its in-progress draft
  // across a Cancel/X/backdrop close — only re-fetching when a genuinely
  // different application is opened. See UnsavedChangesContext.jsx.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewingApp, setReviewingApp] = useState(null);
  const [creatingAdmin, setCreatingAdmin] = useState(false);

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

  // Mirrors PolicyApplications.jsx's own ?open= deep link — Quotations.jsx's
  // own "For Issuance" status chip routes here instead of to that other
  // (agent-scoped) tracker, since this is where the application is actually
  // waiting on a decision. The number isn't in the URL, so this fetches the
  // one application's detail for the dialog title rather than waiting on/
  // searching the (possibly different-paginated) table rows.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    let cancelled = false;
    getApplicationForApproval(token, openId)
      .then((app) => {
        if (cancelled) return;
        setReviewingApp({ id: app.id, applicationNumber: app.application_number });
        setReviewOpen(true);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => {
        if (cancelled) return;
        const next = new URLSearchParams(searchParams);
        next.delete("open");
        setSearchParams(next, { replace: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Policy Applications
        </Typography>
        {canAdminCreate && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreatingAdmin(true)}>
            New Admin Application
          </Button>
        )}
      </Box>

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
                      onClick={() => {
                        setReviewingApp({ id: a.id, applicationNumber: a.application_number });
                        setReviewOpen(true);
                      }}
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

      <ApplicationReviewDialog
        open={reviewOpen}
        applicationId={reviewingApp?.id ?? null}
        applicationNumber={reviewingApp?.applicationNumber}
        token={token}
        onClose={() => setReviewOpen(false)}
        onApproved={loadApplications}
      />

      <Dialog open={creatingAdmin} onClose={() => setCreatingAdmin(false)} fullWidth maxWidth="sm" scroll="paper" keepMounted>
        <DialogContent>
          <PolicyApplication
            adminMode
            onClose={() => setCreatingAdmin(false)}
            onCreated={() => {
              setCreatingAdmin(false);
              loadApplications();
            }}
          />
        </DialogContent>
      </Dialog>
    </Container>
  );
}
