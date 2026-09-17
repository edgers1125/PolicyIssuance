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
  Stack,
  TextField,
  MenuItem,
  InputAdornment,
  Button,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useAuth } from "../context/AuthContext";
import { listMyClients } from "../api/client";
import { formatPHP } from "../utils/currency";

const TYPE_LABELS = { INDIVIDUAL: "Individual", CORPORATE: "Corporate" };
const TYPE_COLORS = { INDIVIDUAL: "info", CORPORATE: "default" };

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

// The "Clients" tab of MyClients.jsx — every customer/company on file for
// the caller's own agent (routes/policies.js, GET /policies/clients), even
// one that hasn't been issued a policy yet, ranked by how much premium
// they've produced for this agent in the last 30 days. No row-click detail
// dialog — a client isn't itself a document the way a policy/application is;
// "Client Policies" (the other tab) is where an individual policy is opened.
export function Clients() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  useEffect(() => {
    setLoading(true);
    setError("");
    listMyClients(token, page + 1, rowsPerPage, { search: debouncedSearch, type: typeFilter })
      .then((data) => {
        setRows(data.data);
        setTotal(data.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, page, rowsPerPage, debouncedSearch, typeFilter]);

  return (
    <>
      <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
          <TextField
            placeholder="Search by name or email"
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
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All types</MenuItem>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
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
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Contact</TableCell>
                  <TableCell align="right">Premiums (Last 30 Days)</TableCell>
                  <TableCell align="right">Total Policies</TableCell>
                  <TableCell>Last Policy</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      {hasActiveFilters ? "No clients match your search/filters." : "No clients are on file for your agent account yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((c) => (
                    <TableRow key={c.id} hover>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>
                        <Chip size="small" label={TYPE_LABELS[c.type] || c.type} color={TYPE_COLORS[c.type] || "default"} />
                      </TableCell>
                      <TableCell>{c.email || "—"}</TableCell>
                      <TableCell>{c.contact || "—"}</TableCell>
                      <TableCell align="right">{formatPHP(c.premiums_last_30_days)}</TableCell>
                      <TableCell align="right">{c.total_policies}</TableCell>
                      <TableCell>{fmtDate(c.last_policy_date)}</TableCell>
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
    </>
  );
}
