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
import { listEndorsementsForApproval } from "../api/client";
import { EndorsementReviewDialog } from "../components/EndorsementReviewDialog";

// EndorsementStatus's own label/color mapping — kept local, same precedent
// as every other small enum-display map in this app (StatusChip.jsx is
// specifically ApplicationStatus's own).
const ENDORSEMENT_STATUS_LABELS = { SUBMITTED: "Submitted", APPROVED: "Approved", REJECTED: "Rejected" };
const ENDORSEMENT_STATUS_COLORS = { SUBMITTED: "info", APPROVED: "success", REJECTED: "error" };

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

// The endorsement approval queue — every endorsement request in the system,
// from every agent (routes/endorsements.js, gated on APPROVE_ENDORSEMENT).
// Row click opens EndorsementReviewDialog — the endorsement's own PDF on the
// left, the change-list/"Create Change"/"Approve"/"Reject" panel on the
// right, mirroring ApplicationReviewDialog's own shape. The "Endorsement
// Approval" tab of pages/Approvals.jsx.
export function EndorsementApproval() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(null);

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

  function loadEndorsements() {
    setLoading(true);
    setError("");
    return listEndorsementsForApproval(token, page + 1, rowsPerPage, { search: debouncedSearch, status: statusFilter })
      .then((data) => {
        setRows(data.data);
        setTotal(data.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadEndorsements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, rowsPerPage, debouncedSearch, statusFilter]);

  return (
    <>
      <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
          <TextField
            placeholder="Search by endorsement #, policy #, insured name, or agent"
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
            {Object.entries(ENDORSEMENT_STATUS_LABELS).map(([value, label]) => (
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
                  <TableCell>Endorsement #</TableCell>
                  <TableCell>Policy #</TableCell>
                  <TableCell>Agent</TableCell>
                  <TableCell>Insured</TableCell>
                  <TableCell>Class / Variant</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Effective</TableCell>
                  <TableCell>Filed</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      {hasActiveFilters ? "No endorsements match your search/filters." : "No endorsement requests yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((e) => (
                    <TableRow
                      key={e.id}
                      hover
                      onClick={() => setReviewing({ id: e.id, endorsementNumber: e.endorsement_number })}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{e.endorsement_number}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{e.policy_number}</TableCell>
                      <TableCell>{e.agent_name || e.agent_code}</TableCell>
                      <TableCell>{e.insured_name || "—"}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{e.class_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {e.variant_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={ENDORSEMENT_STATUS_LABELS[e.status] || e.status} color={ENDORSEMENT_STATUS_COLORS[e.status] || "default"} />
                      </TableCell>
                      <TableCell>{fmtDate(e.effective_date)}</TableCell>
                      <TableCell>{fmtDate(e.created_at)}</TableCell>
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
        <EndorsementReviewDialog
          endorsementId={reviewing.id}
          endorsementNumber={reviewing.endorsementNumber}
          token={token}
          onClose={() => setReviewing(null)}
          onDecided={loadEndorsements}
        />
      )}
    </>
  );
}
