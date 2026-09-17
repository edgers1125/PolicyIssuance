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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import { useAuth } from "../context/AuthContext";
import { listAccountingTransactions, listAccountingOverview, recordAgentPayment } from "../api/client";
import { formatPHP } from "../utils/currency";
import { NumberField } from "../components/NumberField";

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

// AgentPayableTransactionType's own label/color mapping — kept local, same
// precedent as every other small-enum label map in this app (StatusChip.jsx
// is specifically ApplicationStatus's). ISSUANCE/ENDORSEMENT credit an
// agent's balance (green/info); CANCELLED_POLICY/PAYMENT debit it
// (error/default) — see AgentPayableTransaction's own schema comment.
const TRANSACTION_TYPE_LABELS = {
  ISSUANCE: "Issuance",
  ENDORSEMENT: "Endorsement",
  CANCELLED_POLICY: "Cancelled Policy",
  PAYMENT: "Payment",
};
const TRANSACTION_TYPE_COLORS = {
  ISSUANCE: "success",
  ENDORSEMENT: "info",
  CANCELLED_POLICY: "error",
  PAYMENT: "default",
};

// Record Payment dialog — the only client-facing way to create an
// AgentPayableTransaction (see schemas/agentPayables.js's own note on why
// transaction_type isn't accepted from the client at all). Sources its own
// Agent picker from GET /accounting/overview rather than GET /agents, since
// a MANAGE_ACCOUNTING-only caller may not hold MANAGE_AGENTS.
function RecordPaymentDialog({ onClose, onRecorded }) {
  const { token } = useAuth();
  const [agents, setAgents] = useState([]);
  const [agent, setAgent] = useState(null);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listAccountingOverview(token)
      .then(setAgents)
      .catch((err) => setError(err.message));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await recordAgentPayment(token, {
        agent_id: agent.id,
        amount: Number(amount),
        remarks: remarks || undefined,
      });
      onRecorded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Record Payment</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2}>
            <Autocomplete
              options={agents}
              getOptionLabel={(o) => `${o.agent_name} (${o.agent_code})`}
              value={agent}
              onChange={(e, value) => setAgent(value)}
              renderInput={(params) => <TextField {...params} label="Agent" required autoFocus />}
            />
            <NumberField label="Amount paid" value={amount} onChange={setAmount} required fullWidth />
            <TextField
              label="Remarks (optional)"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!agent || !amount || submitting}>
            {submitting ? "Recording..." : "Record Payment"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// The Accounting page's "Transactions" tab — every AgentPayableTransaction in
// the system, from every agent, newest first (routes/accounting.js's GET
// /transactions). Same server-paginated, streamlined table shape as
// PolicyApproval.jsx/Quotations.jsx (monospace reference numbers, a
// fixed-width type Chip) — see CLAUDE.md's own note on keeping future
// tracker tables consistent with this convention.
export function AccountingTransactions() {
  const { token, permissions } = useAuth();
  const canRecordPayment = permissions?.includes("MANAGE_ACCOUNTING.RECORD_PAYMENT");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const hasActiveFilters = Boolean(search || typeFilter);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  function handleTypeFilterChange(value) {
    setTypeFilter(value);
    setPage(0);
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setTypeFilter("");
    setPage(0);
  }

  function loadTransactions() {
    setLoading(true);
    setError("");
    return listAccountingTransactions(token, page + 1, rowsPerPage, {
      search: debouncedSearch,
      transaction_type: typeFilter,
    })
      .then((data) => {
        setRows(data.data);
        setTotal(data.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, rowsPerPage, debouncedSearch, typeFilter]);

  return (
    <>
      {canRecordPayment && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setRecording(true)}>
            Record Payment
          </Button>
        </Box>
      )}

      <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
          <TextField
            placeholder="Search by agent or policy #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            fullWidth
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField
            select
            label="Type"
            value={typeFilter}
            onChange={(e) => handleTypeFilterChange(e.target.value)}
            size="small"
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All types</MenuItem>
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
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
                  <TableCell>Date</TableCell>
                  <TableCell>Agent</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Policy #</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Remarks</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      {hasActiveFilters ? "No transactions match your search/filters." : "No transactions yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((t) => {
                    const amount = Number(t.amount);
                    return (
                      <TableRow key={t.id} hover>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(t.created_at)}</TableCell>
                        <TableCell>{t.agent_name || t.agent_code}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={TRANSACTION_TYPE_LABELS[t.transaction_type] || t.transaction_type}
                            color={TRANSACTION_TYPE_COLORS[t.transaction_type] || "default"}
                          />
                        </TableCell>
                        <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{t.policy_number || "—"}</TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: amount < 0 ? "error.main" : "success.main" }}
                          >
                            {amount < 0 ? "-" : "+"}
                            {formatPHP(Math.abs(amount))}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {t.remarks || "—"}
                          {t.created_by_name && (
                            <Typography variant="caption" color="text.secondary" component="div">
                              by {t.created_by_name}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
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

      {recording && <RecordPaymentDialog onClose={() => setRecording(false)} onRecorded={loadTransactions} />}
    </>
  );
}
