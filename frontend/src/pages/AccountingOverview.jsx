import { useEffect, useState } from "react";
import {
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Box,
  Alert,
  CircularProgress,
  Chip,
  Typography,
  Stack,
} from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { listAccountingOverview } from "../api/client";
import { formatPHP } from "../utils/currency";

// The Accounting page's "Overview" tab (and its default/first one) — one row
// per agent: identity, premium production, and the agent's current payable
// balance. Unpaginated, same "small, complete roster" convention as
// MyAgents.jsx (GET /accounting/overview mirrors that page's own agent list
// shape) — reads Agent.payable directly rather than summing the ledger live,
// which is the whole point of that denormalized column (see its own schema
// comment); the Transactions tab is where the full ledger is actually
// browsable for auditing.
export function AccountingOverview() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    listAccountingOverview(token)
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <>
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
                  <TableCell>Agent</TableCell>
                  <TableCell align="right">Premiums Generated</TableCell>
                  <TableCell align="right">Last 30 Days</TableCell>
                  <TableCell align="right">Payable Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      No agents yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((a) => {
                    const payable = Number(a.payable);
                    return (
                      <TableRow key={a.id} hover>
                        <TableCell>
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <Chip label={a.agent_code} size="small" />
                            <Typography variant="body2">{a.agent_name}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{formatPHP(a.premiums_generated)}</TableCell>
                        <TableCell align="right">{formatPHP(a.premiums_generated_30d)}</TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: payable > 0 ? "warning.main" : "text.primary" }}
                          >
                            {formatPHP(payable)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </>
  );
}
