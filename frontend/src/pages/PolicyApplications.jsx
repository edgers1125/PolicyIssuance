import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogContent,
  TextField,
  MenuItem,
  InputAdornment,
  Stack,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { useAuth } from "../context/AuthContext";
import {
  listApplications,
  getApplication,
  resendApplicationEmail,
  downloadApplicationPdf,
  getPolicyRenewalPrefill,
} from "../api/client";
import { formatPHP } from "../utils/currency";
import { StatusChip, STATUS_LABELS } from "../components/StatusChip";
import { ApplicationDetailDialog } from "../components/ApplicationDetailDialog";
import { PolicyApplication as PolicyApplicationCreator } from "./PolicyApplication";

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export function PolicyApplications() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Set only via the ?renew= deep link below — handed to PolicyApplicationCreator
  // to pre-fill the wizard from an already-issued Policy (Client Policies
  // page's "Renew This Policy" action).
  const [renewalPrefill, setRenewalPrefill] = useState(null);

  // Search/filter bar — search is debounced (see the effect below) so it
  // doesn't re-fetch on every keystroke; status applies immediately. Both are
  // server-side (see listApplicationsQuerySchema), not a client-side filter
  // over just the current page.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Deep-link from the Quotation Tracker's "For Issuance" status — clicking
  // the converted application's number there routes here with ?open=<id>
  // and this opens straight into that application's detail popup, the same
  // one a row click would. The number isn't in the URL (just the id), so
  // this fetches the one application's detail for the dialog title rather
  // than waiting on/searching the (possibly different-paginated) table rows.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    let cancelled = false;
    getApplication(token, openId)
      .then((app) => {
        if (cancelled) return;
        setSelected({ id: app.id, applicationNumber: app.application_number });
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

  // Fetches everything the wizard needs to open pre-filled from an
  // already-issued Policy (routes/policies.js's GET /:id/renewal-prefill)
  // and opens the "New Application" dialog with it, replacing whatever the
  // dialog currently holds — shared by the ?renew= deep link below (Client
  // Policies page's "Renew This Policy" action) and PolicyApplication.jsx's
  // own onRenewalRequested (a vehicle/address conflict surfaced mid-wizard,
  // proactively or as a submit-time 409 — see lib/policyConflicts.js).
  function openRenewalPrefill(policyId) {
    return getPolicyRenewalPrefill(token, policyId)
      .then((prefill) => {
        setRenewalPrefill(prefill);
        setCreateOpen(true);
      })
      .catch((err) => setError(err.message));
  }

  // Deep-link from the Client Policies page's "Renew This Policy" action —
  // routes here with ?renew=<policyId>. Same param-stripping pattern as
  // ?open= above.
  useEffect(() => {
    const renewId = searchParams.get("renew");
    if (!renewId) return;
    let cancelled = false;
    openRenewalPrefill(renewId).finally(() => {
      if (cancelled) return;
      const next = new URLSearchParams(searchParams);
      next.delete("renew");
      setSearchParams(next, { replace: true });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function loadApplications() {
    setLoading(true);
    setError("");
    return listApplications(token, page + 1, rowsPerPage, {
      search: debouncedSearch,
      status: statusFilter,
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
  }, [token, page, rowsPerPage, debouncedSearch, statusFilter]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Policy Applications
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setRenewalPrefill(null);
            setCreateOpen(true);
          }}
        >
          New Application
        </Button>
      </Box>

      <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
          <TextField
            placeholder="Search by application # or insured name"
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
                  <TableCell>Insured</TableCell>
                  <TableCell>Class / Variant</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Coverage Period</TableCell>
                  <TableCell align="right">Total Premium</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      {hasActiveFilters ? "No applications match your search/filters." : "No policy applications yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((a) => (
                    <TableRow
                      key={a.id}
                      hover
                      onClick={() => setSelected({ id: a.id, applicationNumber: a.application_number })}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{a.application_number}</TableCell>
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

      {selected && (
        <ApplicationDetailDialog
          applicationId={selected.id}
          applicationNumber={selected.applicationNumber}
          token={token}
          onClose={() => setSelected(null)}
          downloadPdf={downloadApplicationPdf}
          resendEmail={resendApplicationEmail}
        />
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        fullWidth
        maxWidth="sm"
        scroll="paper"
        keepMounted
      >
        <DialogContent>
          <PolicyApplicationCreator
            // Forces a full remount whenever the renewal target changes
            // (including from onRenewalRequested while this same dialog is
            // already open) — a fresh instance rather than trying to patch
            // renewalPrefill onto a wizard that may already be mid-filled,
            // which could otherwise leave a stale mix of the abandoned
            // attempt and the new prefill. Closing (Cancel/X/backdrop) only
            // ever flips createOpen off — renewalPrefill is deliberately
            // left alone so the wizard's in-progress draft (this same
            // component instance, kept alive by the Dialog's own
            // keepMounted) survives a close/reopen; only the explicit "New
            // Application" button and a fresh ?renew= deep link reset it.
            key={renewalPrefill?.renewed_policy_id || "new"}
            onClose={() => setCreateOpen(false)}
            onCreated={loadApplications}
            renewalPrefill={renewalPrefill}
            onRenewalRequested={openRenewalPrefill}
          />
        </DialogContent>
      </Dialog>
    </Container>
  );
}
