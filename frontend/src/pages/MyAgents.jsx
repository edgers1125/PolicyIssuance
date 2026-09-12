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
  MenuItem,
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
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "../context/AuthContext";
import {
  listAgents,
  listCoverages,
  getAgentNetrates,
  updateAgentNetrates,
  updateAgentValueTiers,
  updateAgentFlatTiers,
} from "../api/client";
import { formatPHP, formatRate } from "../utils/currency";
import { formatPeriodLabel } from "../utils/coveragePeriods";
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

function toValueTierForm(tiers) {
  return (tiers || []).map((t) => ({ min_value: String(t.min_value), rate_percentage: String(t.rate_percentage) }));
}

function toFlatTierForm(tiers) {
  return (tiers || []).map((t) => ({ coverage_amount: String(t.coverage_amount), coverage_price: String(t.coverage_price) }));
}

function sameTiers(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function RatesDialog({ open, onClose, agent, token, onSaved }) {
  const [coverages, setCoverages] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [periodOptions, setPeriodOptions] = useState([]);
  const [coveragePeriodDays, setCoveragePeriodDays] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Every allowable period across every coverage, loaded once per dialog
  // open — rates/tiers below are only ever edited one period at a time, same
  // as the Manage Coverage Pricing page. Defaults to the 1-year period.
  useEffect(() => {
    if (!open) return;
    listCoverages(token)
      .then((data) => {
        const days = Array.from(
          new Set(data.flatMap((c) => (c.allowable_periods || []).map((p) => p.coverage_in_days)))
        ).sort((a, b) => a - b);
        setPeriodOptions(days);
        setCoveragePeriodDays((prev) => (days.includes(prev) ? prev : (days.includes(365) ? 365 : days[0]) ?? ""));
      })
      .catch((err) => setError(err.message));
  }, [open, token]);

  useEffect(() => {
    if (!open || !agent || !coveragePeriodDays) return;
    setLoading(true);
    setError("");
    getAgentNetrates(token, agent.id, coveragePeriodDays)
      .then((data) => {
        setCoverages(data);
        const initial = {};
        for (const cov of data) {
          if (cov.pricing_mode === "PERCENTAGE" && cov.override) {
            initial[cov.id] = {
              netrate_percent: (Number(cov.override.netrate) * 100).toString(),
              maximum_coverage:
                cov.override.maximum_coverage !== null ? String(cov.override.maximum_coverage) : "",
            };
          } else if (cov.pricing_mode === "VALUE_PERCENTAGE" && cov.value_percentage_override) {
            initial[cov.id] = { tiers: toValueTierForm(cov.value_percentage_override) };
          } else if (cov.pricing_mode === "FLAT_TIER" && cov.flat_tier_override) {
            initial[cov.id] = { tiers: toFlatTierForm(cov.flat_tier_override) };
          }
        }
        setOverrides(initial);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, agent, coveragePeriodDays, token]);

  function toggleOverride(cov) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (next[cov.id]) {
        delete next[cov.id];
      } else if (cov.pricing_mode === "PERCENTAGE") {
        next[cov.id] = { netrate_percent: "", maximum_coverage: "" };
      } else {
        next[cov.id] = { tiers: [] };
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
    for (const [coverageId, o] of entries) {
      const cov = coverages.find((c) => c.id === coverageId);
      if (cov.pricing_mode === "PERCENTAGE" && o.netrate_percent === "") {
        setError("Enter a net rate for every custom-rate coverage, or uncheck it.");
        return;
      }
      if (cov.pricing_mode !== "PERCENTAGE" && (!o.tiers || o.tiers.length === 0)) {
        setError(`Add at least one tier for ${cov.coverage_name}, or uncheck it.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      // PERCENTAGE overrides — one bulk replace for the whole agent, as before.
      const netrates = entries
        .filter(([, o]) => "netrate_percent" in o)
        .map(([coverage_id, o]) => ({
          coverage_id,
          netrate: Number(o.netrate_percent) / 100,
          maximum_coverage: o.maximum_coverage === "" ? null : Number(o.maximum_coverage),
        }));
      await updateAgentNetrates(token, agent.id, coveragePeriodDays, netrates);

      // VALUE_PERCENTAGE / FLAT_TIER overrides — each coverage's tier table is
      // its own replace-all endpoint, so only send the ones that actually
      // changed (added, edited, or removed) rather than every coverage.
      for (const cov of coverages) {
        if (cov.pricing_mode === "PERCENTAGE") continue;

        const current = overrides[cov.id]?.tiers || [];
        const original =
          cov.pricing_mode === "VALUE_PERCENTAGE"
            ? toValueTierForm(cov.value_percentage_override)
            : toFlatTierForm(cov.flat_tier_override);
        if (sameTiers(current, original)) continue;

        if (cov.pricing_mode === "VALUE_PERCENTAGE") {
          const tiers = current.map((t) => ({ min_value: Number(t.min_value), rate_percentage: Number(t.rate_percentage) }));
          const minValues = tiers.map((t) => t.min_value);
          if (new Set(minValues).size !== minValues.length) {
            throw new Error(`Each tier for ${cov.coverage_name} needs a distinct minimum value`);
          }
          await updateAgentValueTiers(token, agent.id, cov.id, coveragePeriodDays, tiers);
        } else {
          const tiers = current.map((t) => ({ coverage_amount: Number(t.coverage_amount), coverage_price: Number(t.coverage_price) }));
          const amounts = tiers.map((t) => t.coverage_amount);
          if (new Set(amounts).size !== amounts.length) {
            throw new Error(`Each tier for ${cov.coverage_name} needs a distinct insured value`);
          }
          await updateAgentFlatTiers(token, agent.id, cov.id, coveragePeriodDays, tiers);
        }
      }

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
              Every coverage is available to every agent under its default pricing. Check a coverage below
              to give this agent a custom pricing setup instead — a net rate for a percentage-based
              coverage, or a whole custom tier table for a value/flat-tier one.
            </Typography>

            <TextField
              select
              label="Coverage period"
              value={coveragePeriodDays}
              onChange={(e) => setCoveragePeriodDays(Number(e.target.value))}
              fullWidth
              helperText="Overrides below apply only to this period — a coverage not offered at it won't show up."
            >
              {periodOptions.map((days) => (
                <MenuItem key={days} value={days}>
                  {formatPeriodLabel(days)}
                </MenuItem>
              ))}
            </TextField>

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
                                onChange={() => toggleOverride(cov)}
                                sx={{ pt: 0.25 }}
                              />
                            }
                            label={
                              <>
                                <Typography variant="body2">{cov.coverage_name}</Typography>
                                <Typography variant="caption" color="text.secondary" component="div">
                                  {cov.pricing_mode === "PERCENTAGE" &&
                                    `Standard rate ${formatRate(cov.standard_rate)}, max ${formatPHP(cov.standard_maximum_coverage)}`}
                                  {cov.pricing_mode === "VALUE_PERCENTAGE" &&
                                    "Priced by vehicle-value tiers — check to give this agent a custom tier table"}
                                  {cov.pricing_mode === "FLAT_TIER" &&
                                    "Priced by fixed insured-value tiers — check to give this agent a custom tier menu"}
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
  if (cov.pricing_mode === "PERCENTAGE") {
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

  const fields =
    cov.pricing_mode === "VALUE_PERCENTAGE"
      ? [
          { key: "min_value", label: "Minimum value", adornment: "₱", position: "start" },
          { key: "rate_percentage", label: "Rate", adornment: "%", position: "end" },
        ]
      : [
          { key: "coverage_amount", label: "Insured value", adornment: "₱", position: "start" },
          { key: "coverage_price", label: "Price", adornment: "₱", position: "start" },
        ];
  const emptyRow = Object.fromEntries(fields.map((f) => [f.key, ""]));

  function updateRow(index, key, value) {
    const next = override.tiers.map((t, i) => (i === index ? { ...t, [key]: value } : t));
    onChange(cov.id, "tiers", next);
  }

  function addRow() {
    onChange(cov.id, "tiers", [...override.tiers, emptyRow]);
  }

  function removeRow(index) {
    onChange(
      cov.id,
      "tiers",
      override.tiers.filter((_, i) => i !== index)
    );
  }

  return (
    <Stack spacing={1.5} sx={{ pl: 4, mt: 1.5 }}>
      {override.tiers.map((tier, index) => (
        <Stack key={index} direction="row" spacing={1} alignItems="center">
          {fields.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              value={tier[f.key]}
              onChange={(v) => updateRow(index, f.key, v)}
              size="small"
              fullWidth
              slotProps={{
                input:
                  f.position === "start"
                    ? { startAdornment: <InputAdornment position="start">{f.adornment}</InputAdornment> }
                    : { endAdornment: <InputAdornment position="end">{f.adornment}</InputAdornment> },
              }}
            />
          ))}
          <IconButton size="small" onClick={() => removeRow(index)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Button size="small" startIcon={<AddIcon />} onClick={addRow} sx={{ alignSelf: "flex-start" }}>
        Add tier
      </Button>
    </Stack>
  );
}

export function MyAgents() {
  const { token, permissions } = useAuth();
  const canViewPremiums = permissions?.includes("MANAGE_AGENTS.VIEW_AGENT_PREMIUMS");
  const canManageRates = permissions?.includes("MANAGE_AGENTS.MANAGE_AGENT_RATES");
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
