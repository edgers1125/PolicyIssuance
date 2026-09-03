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
  Chip,
  Box,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Stack,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
  InputAdornment,
} from "@mui/material";
import TuneIcon from "@mui/icons-material/Tune";
import { useAuth } from "../context/AuthContext";
import { listAgents, getAgentNetrates, updateAgentNetrates } from "../api/client";
import { formatPHP, formatRate } from "../utils/currency";
import { NumberField } from "../components/NumberField";

function groupCoverages(coverages) {
  const byGroup = new Map();
  for (const cov of coverages) {
    const key = `${cov.class_name} — ${cov.variant_name}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(cov);
  }
  return Array.from(byGroup.entries()).map(([name, items]) => ({ name, items }));
}

function RatesDialog({ open, onClose, agent, token, onSaved }) {
  const [coverages, setCoverages] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !agent) return;
    setLoading(true);
    setError("");
    getAgentNetrates(token, agent.id)
      .then((data) => {
        setCoverages(data);
        const initial = {};
        for (const cov of data) {
          if (cov.override) {
            initial[cov.id] = {
              enabled: true,
              netrate_percent: (Number(cov.override.netrate) * 100).toString(),
              maximum_coverage:
                cov.override.maximum_coverage !== null ? String(cov.override.maximum_coverage) : "",
            };
          }
        }
        setOverrides(initial);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, agent, token]);

  function toggleOverride(coverageId) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (next[coverageId]) {
        delete next[coverageId];
      } else {
        next[coverageId] = { enabled: true, netrate_percent: "", maximum_coverage: "" };
      }
      return next;
    });
  }

  function updateOverrideField(coverageId, field, value) {
    setOverrides((prev) => ({ ...prev, [coverageId]: { ...prev[coverageId], [field]: value } }));
  }

  async function handleSave() {
    setError("");
    const entries = Object.entries(overrides);
    for (const [, o] of entries) {
      if (o.netrate_percent === "") {
        setError("Enter a net rate for every custom-rate coverage, or uncheck it.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const netrates = entries.map(([coverage_id, o]) => ({
        coverage_id,
        netrate: Number(o.netrate_percent) / 100,
        maximum_coverage: o.maximum_coverage === "" ? null : Number(o.maximum_coverage),
      }));
      await updateAgentNetrates(token, agent.id, netrates);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!agent) return null;

  const groups = groupCoverages(coverages);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Product Access &amp; Rates — {agent.agent_name}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Every coverage is available to every agent at the standard rate. Check a coverage below
              to give this agent a custom net rate (and, optionally, a personal maximum coverage) instead.
            </Typography>

            {groups.map((group) => (
              <Paper key={group.name} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {group.name}
                </Typography>
                <FormGroup>
                  <Stack spacing={2} divider={<Divider flexItem />}>
                    {group.items.map((cov) => {
                      const override = overrides[cov.id];
                      return (
                        <Box key={cov.id} sx={{ pt: 1 }}>
                          <FormControlLabel
                            sx={{ alignItems: "flex-start" }}
                            control={
                              <Checkbox
                                checked={Boolean(override)}
                                onChange={() => toggleOverride(cov.id)}
                                sx={{ pt: 0.25 }}
                              />
                            }
                            label={
                              <>
                                <Typography variant="body2">{cov.coverage_name}</Typography>
                                <Typography variant="caption" color="text.secondary" component="div">
                                  Standard rate {formatRate(cov.standard_rate)}, max{" "}
                                  {formatPHP(cov.standard_maximum_coverage)}
                                </Typography>
                              </>
                            }
                          />
                          {override && (
                            <OverrideFields cov={cov} override={override} onChange={updateOverrideField} />
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </FormGroup>
              </Paper>
            ))}

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={submitting || loading}>
          {submitting ? "Saving..." : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function OverrideFields({ cov, override, onChange }) {
  return (
    <Stack direction="row" spacing={2} sx={{ pl: 4, mt: 1.5 }}>
      <TextField
        label="Net rate"
        type="number"
        value={override.netrate_percent}
        onChange={(e) => onChange(cov.id, "netrate_percent", e.target.value)}
        size="small"
        fullWidth
        required
        slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
      />
      <NumberField
        label="Maximum coverage (optional)"
        value={override.maximum_coverage}
        onChange={(v) => onChange(cov.id, "maximum_coverage", v)}
        size="small"
        fullWidth
        helperText="Blank = product standard"
        slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
      />
    </Stack>
  );
}

export function MyAgents() {
  const { token, permissions } = useAuth();
  const canViewPremiums = permissions?.includes("VIEW_AGENT_PREMIUMS");
  const canManageRates = permissions?.includes("MANAGE_AGENT_RATES");
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [managingAgent, setManagingAgent] = useState(null);

  function loadAgents() {
    return listAgents(token).then(setAgents);
  }

  useEffect(() => {
    setLoading(true);
    loadAgents()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 700 }}>
        My Agents
      </Typography>

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
        <TableContainer component={Paper} sx={{ borderRadius: 3, overflowX: "auto" }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Agent code</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Work email</TableCell>
                <TableCell>Status</TableCell>
                {canViewPremiums && (
                  <>
                    <TableCell align="right">Premiums generated</TableCell>
                    <TableCell align="right">Last 30 days</TableCell>
                  </>
                )}
                {canManageRates && <TableCell>Special rates</TableCell>}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {agents.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Chip label={a.agent_code} size="small" />
                  </TableCell>
                  <TableCell>{a.agent_name}</TableCell>
                  <TableCell>{a.work_email}</TableCell>
                  <TableCell>
                    <Chip
                      label={a.status}
                      size="small"
                      color={a.status === "ACTIVE" ? "success" : "default"}
                    />
                  </TableCell>
                  {canViewPremiums && (
                    <>
                      <TableCell align="right">{formatPHP(a.premiums_generated)}</TableCell>
                      <TableCell align="right">{formatPHP(a.premiums_generated_30d)}</TableCell>
                    </>
                  )}
                  {canManageRates && (
                    <TableCell>
                      {a.special_rates.length > 0 ? (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ maxWidth: 260 }}>
                          {a.special_rates.map((r) => (
                            <Chip
                              key={r.coverage_code}
                              size="small"
                              variant="outlined"
                              color="primary"
                              label={`${r.coverage_name}: ${formatRate(r.netrate)}`}
                            />
                          ))}
                        </Stack>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  )}
                  <TableCell align="right">
                    {canManageRates ? (
                      <IconButton size="small" onClick={() => setManagingAgent(a)} title="Manage product access & rates">
                        <TuneIcon fontSize="small" />
                      </IconButton>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <RatesDialog
        open={Boolean(managingAgent)}
        onClose={() => setManagingAgent(null)}
        agent={managingAgent}
        token={token}
        onSaved={loadAgents}
      />
    </Container>
  );
}
