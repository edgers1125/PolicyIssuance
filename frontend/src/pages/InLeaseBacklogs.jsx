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
  Stack,
  TextField,
  MenuItem,
  InputAdornment,
  Button,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useAuth } from "../context/AuthContext";
import { listInLeaseBacklogs } from "../api/client";
import { InLeaseDetailDialog } from "../components/InLeaseDetailDialog";

const TASK_TYPE_LABELS = { FOR_UPLOAD: "For Upload", FOR_ENDORSEMENT: "For Endorsement" };
const STATUS_LABELS = { PENDING: "Pending", ACCOMPLISHED: "Accomplished" };
const STATUS_COLORS = { PENDING: "warning", ACCOMPLISHED: "success" };

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

// A running list of every issued policy, oldest-issued first — each row is
// one policy's own in-lease task queue (today, always just a single
// FOR_UPLOAD task created at issuance; see routes/policyApproval.js's
// POST /:id/approve), collapsed down to "which task is next" for that
// policy. Row click opens InLeaseDetailDialog for the copyable field view +
// the confirm-and-submit action. Cross-agent, same reasoning as Policy
// Approval — this is a back-office queue, not a per-agent tracker.
export function InLeaseBacklogs() {
  const { token, permissions } = useAuth();
  const canMarkDone = permissions?.includes("MANAGE_INLEASE.MARK_DONE");
  const canMarkUndone = permissions?.includes("MANAGE_INLEASE.MARK_UNDONE");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPolicyId, setSelectedPolicyId] = useState(null);

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

  function loadBacklogs() {
    setLoading(true);
    setError("");
    return listInLeaseBacklogs(token, page + 1, rowsPerPage, { search: debouncedSearch, status: statusFilter })
      .then((data) => {
        setRows(data.data);
        setTotal(data.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadBacklogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, rowsPerPage, debouncedSearch, statusFilter]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          In-Lease Backlogs
        </Typography>
      </Box>

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
                  <TableCell>Policy #</TableCell>
                  <TableCell>Insured</TableCell>
                  <TableCell>Class</TableCell>
                  <TableCell>Product Variant</TableCell>
                  <TableCell>Issued</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Current Task</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      {hasActiveFilters ? "No policies match your search/filters." : "No policies have been issued yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id} hover onClick={() => setSelectedPolicyId(r.id)} sx={{ cursor: "pointer" }}>
                      <TableCell>{r.policy_number}</TableCell>
                      <TableCell>{r.insured_name || "—"}</TableCell>
                      <TableCell>{r.class_name}</TableCell>
                      <TableCell>{r.variant_name}</TableCell>
                      <TableCell>{fmtDate(r.issue_date)}</TableCell>
                      <TableCell>
                        <Chip size="small" label={STATUS_LABELS[r.status] || r.status} color={STATUS_COLORS[r.status] || "default"} />
                      </TableCell>
                      <TableCell>{r.current_task_type ? TASK_TYPE_LABELS[r.current_task_type] || r.current_task_type : "—"}</TableCell>
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

      {selectedPolicyId && (
        <InLeaseDetailDialog
          policyId={selectedPolicyId}
          token={token}
          canMarkDone={canMarkDone}
          canMarkUndone={canMarkUndone}
          onClose={() => setSelectedPolicyId(null)}
          onChanged={loadBacklogs}
        />
      )}
    </Container>
  );
}
