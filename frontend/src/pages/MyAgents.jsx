import { useEffect, useState } from "react";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";
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
  FormControl,
  FormLabel,
  RadioGroup,
  Radio,
  Autocomplete,
  Divider,
  InputAdornment,
} from "@mui/material";
import TuneIcon from "@mui/icons-material/Tune";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { useAuth } from "../context/AuthContext";
import {
  listAgents,
  createAgent,
  updateAgent,
  listCoverages,
  listCompaniesForAgentLinking,
  getAgentNetrates,
  updateAgentNetrates,
  updateAgentValueTiers,
  updateAgentFlatTiers,
  updateAgentSeatsBasedPricing,
  updateAgentSeatTiers,
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

function toSeatTierForm(tiers) {
  return (tiers || []).map((t) => ({
    insured_amount_per_occupant: String(t.insured_amount_per_occupant),
  }));
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
  // Set once GET /:id/netrates comes back — true when this agent is an
  // individual linked to a company (Agent.company_id), meaning what's shown
  // below is the company's own rates (see lib/coveragePricing.js's own
  // resolution) and editing here is disabled; the company's own row is
  // where these actually get changed.
  const [inheritedFrom, setInheritedFrom] = useState(null);
  // Snapshot of `overrides` right after it's (re)loaded from the server —
  // "dirty" is whatever has since diverged from this, not "overrides has any
  // entries at all" (an agent can legitimately already have saved overrides
  // on file). Kept in sync after a successful save too, so reopening the
  // same agent/period afterward doesn't look dirty against stale data.
  const [loadedOverrides, setLoadedOverrides] = useState({});

  // Every allowable period across every coverage — keyed on the AGENT
  // changing (via `agent?.id`, not the dialog's own `open` toggling), so
  // reopening the SAME agent shows whatever was last typed instead of
  // re-fetching and clobbering it. Rates/tiers are only ever edited one
  // period at a time, same as the Manage Coverage Pricing page. Defaults to
  // the 1-year period.
  useEffect(() => {
    if (!agent) return;
    listCoverages(token)
      .then((data) => {
        const days = Array.from(
          new Set(data.flatMap((c) => (c.allowable_periods || []).map((p) => p.coverage_in_days)))
        ).sort((a, b) => a - b);
        setPeriodOptions(days);
        setCoveragePeriodDays((prev) => (days.includes(prev) ? prev : (days.includes(365) ? 365 : days[0]) ?? ""));
      })
      .catch((err) => setError(err.message));
  }, [agent?.id, token]);

  // Same "key off the agent id, not `open`" reasoning as above — this one
  // also legitimately re-runs when `coveragePeriodDays` itself changes
  // (switching periods for the same agent has to load that period's own
  // overrides), just never merely because the dialog was closed and reopened
  // for the same agent+period.
  useEffect(() => {
    if (!agent || !coveragePeriodDays) return;
    setLoading(true);
    setError("");
    getAgentNetrates(token, agent.id, coveragePeriodDays)
      .then((data) => {
        setCoverages(data.coverages);
        setInheritedFrom(data.is_inherited ? data.company_name : null);
        const initial = {};
        for (const cov of data.coverages) {
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
          } else if (cov.pricing_mode === "VEHICLE_SEATS_BASED" && (cov.seats_pricing_override || cov.seat_tier_override)) {
            initial[cov.id] = {
              threshold_amount: cov.seats_pricing_override ? String(cov.seats_pricing_override.threshold_amount) : "",
              exceed_threshold_amount: cov.seats_pricing_override ? String(cov.seats_pricing_override.exceed_threshold_amount) : "",
              exceed_threshold_price: cov.seats_pricing_override ? String(cov.seats_pricing_override.exceed_threshold_price) : "",
              tiers: toSeatTierForm(cov.seat_tier_override),
            };
          }
        }
        setOverrides(initial);
        setLoadedOverrides(initial);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [agent?.id, coveragePeriodDays, token]);

  useUnsavedChanges("rates-dialog", open && JSON.stringify(overrides) !== JSON.stringify(loadedOverrides));

  function toggleOverride(cov) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (next[cov.id]) {
        delete next[cov.id];
      } else if (cov.pricing_mode === "PERCENTAGE") {
        next[cov.id] = { netrate_percent: "", maximum_coverage: "" };
      } else if (cov.pricing_mode === "VEHICLE_SEATS_BASED") {
        next[cov.id] = { threshold_amount: "", exceed_threshold_amount: "", exceed_threshold_price: "", tiers: [] };
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
      if (
        cov.pricing_mode === "VEHICLE_SEATS_BASED" &&
        (o.threshold_amount === "" || o.exceed_threshold_amount === "" || o.exceed_threshold_price === "")
      ) {
        setError(`Enter a threshold, bracket amount, and bracket price for ${cov.coverage_name}, or uncheck it.`);
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

        if (cov.pricing_mode === "VEHICLE_SEATS_BASED") {
          const current = overrides[cov.id] || {};
          const currentThreshold = current.threshold_amount ?? null;
          const currentExceedAmount = current.exceed_threshold_amount ?? null;
          const currentExceedPrice = current.exceed_threshold_price ?? null;
          const originalThreshold = cov.seats_pricing_override ? String(cov.seats_pricing_override.threshold_amount) : null;
          const originalExceedAmount = cov.seats_pricing_override ? String(cov.seats_pricing_override.exceed_threshold_amount) : null;
          const originalExceedPrice = cov.seats_pricing_override ? String(cov.seats_pricing_override.exceed_threshold_price) : null;
          if (
            currentThreshold !== originalThreshold ||
            currentExceedAmount !== originalExceedAmount ||
            currentExceedPrice !== originalExceedPrice
          ) {
            const cleared = currentThreshold === null || currentThreshold === "";
            await updateAgentSeatsBasedPricing(token, agent.id, cov.id, coveragePeriodDays, {
              threshold_amount: cleared ? null : Number(currentThreshold),
              exceed_threshold_amount: cleared ? null : Number(currentExceedAmount),
              exceed_threshold_price: cleared ? null : Number(currentExceedPrice),
            });
          }

          const currentTiers = overrides[cov.id]?.tiers || [];
          const originalTiers = toSeatTierForm(cov.seat_tier_override);
          if (!sameTiers(currentTiers, originalTiers)) {
            const tiers = currentTiers.map((t) => ({
              insured_amount_per_occupant: Number(t.insured_amount_per_occupant),
            }));
            const amounts = tiers.map((t) => t.insured_amount_per_occupant);
            if (new Set(amounts).size !== amounts.length) {
              throw new Error(`Each tier for ${cov.coverage_name} needs a distinct insured amount per occupant`);
            }
            await updateAgentSeatTiers(token, agent.id, cov.id, coveragePeriodDays, tiers);
          }
          continue;
        }

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

      setLoadedOverrides(overrides);
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" keepMounted>
      <DialogTitle>Product Access &amp; Rates — {agent.agent_name}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2}>
            {inheritedFrom ? (
              <Alert severity="info">
                This agent's rates are managed via <strong>{inheritedFrom}</strong> — shown below read-only.
                Open {inheritedFrom}'s own "Manage product access &amp; rates" to change them.
              </Alert>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Every coverage is available to every agent under its default pricing. Check a coverage below
                to give this agent a custom pricing setup instead — a net rate for a percentage-based
                coverage, or a whole custom tier table for a value/flat-tier one.
              </Typography>
            )}

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
                                disabled={Boolean(inheritedFrom)}
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
                                  {cov.pricing_mode === "VEHICLE_SEATS_BASED" &&
                                    (cov.standard_seats_pricing
                                      ? `${formatPHP(cov.standard_seats_pricing.threshold_amount)} threshold, ${formatPHP(cov.standard_seats_pricing.exceed_threshold_price)} per ${formatPHP(cov.standard_seats_pricing.exceed_threshold_amount)} excess`
                                      : "Priced by vehicle seat count — check to give this agent a custom threshold/bracket charge")}
                                </Typography>
                              </>
                            }
                          />
                          {override && (
                            <OverrideFields
                              cov={cov}
                              override={override}
                              onChange={updateOverrideField}
                              disabled={Boolean(inheritedFrom)}
                            />
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
        <Button onClick={onClose}>{inheritedFrom ? "Close" : "Cancel"}</Button>
        {!inheritedFrom && (
          <Button variant="contained" onClick={handleSave} disabled={submitting || loading}>
            {submitting ? "Saving..." : "Save changes"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function OverrideFields({ cov, override, onChange, disabled }) {
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
          disabled={disabled}
          slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
        />
        <NumberField
          label="Maximum coverage (optional)"
          value={override.maximum_coverage}
          onChange={(v) => onChange(cov.id, "maximum_coverage", v)}
          size="small"
          fullWidth
          disabled={disabled}
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
      : cov.pricing_mode === "VEHICLE_SEATS_BASED"
        ? [{ key: "insured_amount_per_occupant", label: "Insured amount/occupant", adornment: "₱", position: "start" }]
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
      {cov.pricing_mode === "VEHICLE_SEATS_BASED" && (
        <Stack direction="row" spacing={1}>
          <NumberField
            label="Threshold"
            value={override.threshold_amount}
            onChange={(v) => onChange(cov.id, "threshold_amount", v)}
            size="small"
            fullWidth
            disabled={disabled}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
          />
          <NumberField
            label="Bracket amount"
            value={override.exceed_threshold_amount}
            onChange={(v) => onChange(cov.id, "exceed_threshold_amount", v)}
            size="small"
            fullWidth
            disabled={disabled}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
          />
          <NumberField
            label="Bracket price"
            value={override.exceed_threshold_price}
            onChange={(v) => onChange(cov.id, "exceed_threshold_price", v)}
            size="small"
            fullWidth
            disabled={disabled}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
          />
        </Stack>
      )}
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
              disabled={disabled}
              slotProps={{
                input:
                  f.position === "start"
                    ? { startAdornment: <InputAdornment position="start">{f.adornment}</InputAdornment> }
                    : { endAdornment: <InputAdornment position="end">{f.adornment}</InputAdornment> },
              }}
            />
          ))}
          <IconButton size="small" onClick={() => removeRow(index)} disabled={disabled}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Button size="small" startIcon={<AddIcon />} onClick={addRow} sx={{ alignSelf: "flex-start" }} disabled={disabled}>
        Add tier
      </Button>
    </Stack>
  );
}

// The My Agents page's "Add Agent" action — registers either an INDIVIDUAL
// agent (an actual person; optionally an employee of an existing company,
// picked from the same roster) or a CORPORATE one (an agency/company, with
// no login of its own — see Agent.company_id's schema comment). Agents are
// only ever created here now; connecting a person to one for login purposes
// happens on Manage Users' own Agent picker instead (see GET /users/agents).
const emptyNewCompanyForm = { company_code: "", company_name: "", tin_no: "", email: "" };

function AddAgentDialog({ open, onClose, agents, token, onCreated }) {
  const [agentType, setAgentType] = useState("INDIVIDUAL");
  const [agentCode, setAgentCode] = useState("");
  const [agentName, setAgentName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState("30");
  const [company, setCompany] = useState(null);
  // Only meaningful for agentType CORPORATE — whether (and how) this agency
  // is backed by a real insured-party Company record (Agent.linked_company_id).
  // A company agent must always be backed by one — "existing" or "new" only,
  // no "none" option (backend's own createAgentSchema refinement enforces
  // this too, so this is UI-side symmetry, not the only guard).
  const [companyLinkMode, setCompanyLinkMode] = useState("existing");
  const [linkableCompanies, setLinkableCompanies] = useState([]);
  const [linkedCompany, setLinkedCompany] = useState(null);
  const [newCompanyForm, setNewCompanyForm] = useState(emptyNewCompanyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const companyOptions = agents.filter((a) => a.agent_type === "CORPORATE");

  // Loaded once per dialog open — every ACTIVE company not already backing
  // another agency (see GET /companies/for-agent-linking).
  useEffect(() => {
    if (!open) return;
    listCompaniesForAgentLinking(token)
      .then(setLinkableCompanies)
      .catch((err) => setError(err.message));
  }, [open, token]);

  function reset() {
    setAgentType("INDIVIDUAL");
    setAgentCode("");
    setAgentName("");
    setWorkEmail("");
    setPaymentTermsDays("30");
    setCompany(null);
    setCompanyLinkMode("existing");
    setLinkedCompany(null);
    setNewCompanyForm(emptyNewCompanyForm);
    setError("");
  }

  // Closing (Cancel/X/backdrop) never discards the in-progress draft — only
  // a successful create does (see handleSubmit below). See CLAUDE.md's
  // unsaved-changes convention.
  function handleClose() {
    onClose();
  }

  const isDirty =
    agentType !== "INDIVIDUAL" ||
    agentCode !== "" ||
    agentName !== "" ||
    workEmail !== "" ||
    paymentTermsDays !== "30" ||
    company !== null ||
    companyLinkMode !== "existing" ||
    linkedCompany !== null ||
    newCompanyForm.company_code !== "" ||
    newCompanyForm.company_name !== "" ||
    newCompanyForm.tin_no !== "" ||
    newCompanyForm.email !== "";
  useUnsavedChanges("add-agent-dialog", open && isDirty);

  // A CORPORATE agent is always backed by a real Company record now (either
  // branch — select existing or create new, no "none" option) and takes its
  // own name/code/work email straight from that company instead of the
  // caller retyping the same three values twice — see routes/agents.js's
  // POST /, which derives (and overrides whatever's sent for) these fields
  // server-side whenever linked_company_id/new_company is present. Omitted
  // here entirely in that case, same "let the server derive it" convention
  // as every other field this app computes rather than trusts the client for.
  const isCompanyBacked = agentType === "CORPORATE";
  // What the Company name/Agent code/Work email fields display (read-only)
  // while company-backed — mirrors whichever company record is currently
  // selected/being filled in below, live, so the mapping is visible before
  // submitting rather than only discovered afterward.
  const derivedAgentName = companyLinkMode === "existing" ? linkedCompany?.company_name || "" : newCompanyForm.company_name;
  const derivedAgentCode = companyLinkMode === "existing" ? linkedCompany?.company_code || "" : newCompanyForm.company_code;
  const derivedWorkEmail = companyLinkMode === "existing" ? linkedCompany?.email || "" : newCompanyForm.email;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await createAgent(token, {
        agent_type: agentType,
        agent_code: isCompanyBacked ? undefined : agentCode,
        agent_name: isCompanyBacked ? undefined : agentName,
        work_email: isCompanyBacked ? undefined : workEmail,
        payment_terms_days: Number(paymentTermsDays),
        company_id: agentType === "INDIVIDUAL" && company ? company.id : undefined,
        linked_company_id:
          agentType === "CORPORATE" && companyLinkMode === "existing" && linkedCompany ? linkedCompany.id : undefined,
        new_company:
          agentType === "CORPORATE" && companyLinkMode === "new"
            ? {
                company_code: newCompanyForm.company_code,
                company_name: newCompanyForm.company_name,
                tin_no: newCompanyForm.tin_no || undefined,
                email: newCompanyForm.email,
              }
            : undefined,
      });
      onCreated();
      reset();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" keepMounted>
      <DialogTitle>Add Agent</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Agent type</FormLabel>
              <RadioGroup
                row
                value={agentType}
                onChange={(e) => {
                  setAgentType(e.target.value);
                  setCompany(null);
                }}
              >
                <FormControlLabel value="INDIVIDUAL" control={<Radio />} label="Individual" />
                <FormControlLabel value="CORPORATE" control={<Radio />} label="Company" />
              </RadioGroup>
            </FormControl>

            <TextField
              label={agentType === "CORPORATE" ? "Company name" : "Full name"}
              value={isCompanyBacked ? derivedAgentName : agentName}
              onChange={(e) => setAgentName(e.target.value)}
              required={!isCompanyBacked}
              disabled={isCompanyBacked}
              helperText={isCompanyBacked ? "Taken from the company record below" : undefined}
              fullWidth
              autoFocus={!isCompanyBacked}
            />
            <TextField
              label="Agent code"
              value={isCompanyBacked ? derivedAgentCode : agentCode}
              onChange={(e) => setAgentCode(e.target.value)}
              required={!isCompanyBacked}
              disabled={isCompanyBacked}
              helperText={isCompanyBacked ? "Taken from the company record below" : undefined}
              fullWidth
            />
            <TextField
              label="Work email"
              type="email"
              value={isCompanyBacked ? derivedWorkEmail : workEmail}
              onChange={(e) => setWorkEmail(e.target.value)}
              required={!isCompanyBacked}
              disabled={isCompanyBacked}
              helperText={isCompanyBacked ? "Taken from the company record below" : undefined}
              fullWidth
            />
            <TextField
              label="Payment terms (days)"
              type="number"
              value={paymentTermsDays}
              onChange={(e) => setPaymentTermsDays(e.target.value)}
              required
              fullWidth
              helperText="How many days after a policy is issued (or a coverage-adding endorsement is approved) its own commission becomes overdue for payment."
              slotProps={{ htmlInput: { min: 0, step: 1 } }}
            />

            {agentType === "INDIVIDUAL" && (
              <Autocomplete
                options={companyOptions}
                getOptionLabel={(o) => o.agent_name}
                value={company}
                onChange={(e, value) => setCompany(value)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Company (optional)"
                    helperText="Leave blank if this agent isn't part of a company — their own rates apply. Set it later, or here, to have this agent's pricing follow the company's instead."
                  />
                )}
              />
            )}

            {agentType === "CORPORATE" && (
              <FormControl>
                <FormLabel>Insured-party company record</FormLabel>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Every company agent must be backed by a real Company record, so it (and every agent employed under
                  it) can also be selected as an insured party when filing an application or quotation.
                </Typography>
                <RadioGroup
                  row
                  value={companyLinkMode}
                  onChange={(e) => {
                    setCompanyLinkMode(e.target.value);
                    setLinkedCompany(null);
                    setNewCompanyForm(emptyNewCompanyForm);
                  }}
                >
                  <FormControlLabel value="existing" control={<Radio />} label="Select existing" />
                  <FormControlLabel value="new" control={<Radio />} label="Create new" />
                </RadioGroup>
              </FormControl>
            )}

            {agentType === "CORPORATE" && companyLinkMode === "existing" && (
              <Autocomplete
                options={linkableCompanies}
                getOptionLabel={(o) => `${o.company_name} (${o.company_code})`}
                value={linkedCompany}
                onChange={(e, value) => setLinkedCompany(value)}
                renderInput={(params) => <TextField {...params} label="Company" required />}
              />
            )}

            {agentType === "CORPORATE" && companyLinkMode === "new" && (
              <Stack spacing={2}>
                <TextField
                  label="Company code"
                  value={newCompanyForm.company_code}
                  onChange={(e) => setNewCompanyForm({ ...newCompanyForm, company_code: e.target.value })}
                  required
                  fullWidth
                />
                <TextField
                  label="Company name"
                  value={newCompanyForm.company_name}
                  onChange={(e) => setNewCompanyForm({ ...newCompanyForm, company_name: e.target.value })}
                  required
                  fullWidth
                />
                <TextField
                  label="TIN (optional)"
                  value={newCompanyForm.tin_no}
                  onChange={(e) => setNewCompanyForm({ ...newCompanyForm, tin_no: e.target.value })}
                  fullWidth
                />
                <TextField
                  label="Company email"
                  type="email"
                  value={newCompanyForm.email}
                  onChange={(e) => setNewCompanyForm({ ...newCompanyForm, email: e.target.value })}
                  required
                  fullWidth
                />
              </Stack>
            )}

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? "Creating..." : "Create agent"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// My Agents' small "Edit" affordance next to a row's payment terms — the
// only edit path for an already-created agent's own basic fields today (see
// PATCH /agents/:id's own note). Deliberately its own tiny dialog rather
// than folded into AddAgentDialog, which is create-only.
function EditPaymentTermsDialog({ open, onClose, agent, token, onSaved }) {
  const [paymentTermsDays, setPaymentTermsDays] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (agent) setPaymentTermsDays(String(agent.payment_terms_days ?? ""));
  }, [agent]);

  const isDirty = agent && paymentTermsDays !== String(agent.payment_terms_days ?? "");
  useUnsavedChanges(`edit-agent-payment-terms-${agent?.id || "none"}`, open && Boolean(isDirty));

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await updateAgent(token, agent.id, { payment_terms_days: Number(paymentTermsDays) });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" keepMounted>
      <DialogTitle>Edit Payment Terms</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2}>
            {agent && (
              <Typography variant="body2" color="text.secondary">
                {agent.agent_name} ({agent.agent_code})
              </Typography>
            )}
            <TextField
              label="Payment terms (days)"
              type="number"
              value={paymentTermsDays}
              onChange={(e) => setPaymentTermsDays(e.target.value)}
              required
              fullWidth
              autoFocus
              slotProps={{ htmlInput: { min: 0, step: 1 } }}
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting || !isDirty}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export function MyAgents() {
  const { token, permissions } = useAuth();
  const canViewPremiums = permissions?.includes("MANAGE_AGENTS.VIEW_AGENT_PREMIUMS");
  const canManageRates = permissions?.includes("MANAGE_AGENTS.MANAGE_AGENT_RATES");
  const canAddAgent = permissions?.includes("MANAGE_AGENTS.ADD_AGENT");
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Split from `ratesOpen` so closing the dialog never loses which agent it
  // was open for — RatesDialog itself is what decides whether to reload data
  // for the (possibly unchanged) agent, see its own effects above.
  const [managingAgent, setManagingAgent] = useState(null);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingTermsAgent, setEditingTermsAgent] = useState(null);
  const [editTermsOpen, setEditTermsOpen] = useState(false);

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
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          My Agents
        </Typography>
        {canAddAgent && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add Agent
          </Button>
        )}
      </Box>

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
                <TableCell>Type</TableCell>
                <TableCell>Work email</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Payment Terms</TableCell>
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
                  <TableCell>
                    {a.agent_name}
                    {a.company_name && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        Under {a.company_name}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={a.agent_type === "CORPORATE" ? "Company" : "Individual"}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{a.work_email}</TableCell>
                  <TableCell>
                    <Chip
                      label={a.status}
                      size="small"
                      color={a.status === "ACTIVE" ? "success" : "default"}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
                      <Typography variant="body2">{a.payment_terms_days} days</Typography>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setEditingTermsAgent(a);
                          setEditTermsOpen(true);
                        }}
                        title="Edit payment terms"
                      >
                        <EditIcon fontSize="inherit" />
                      </IconButton>
                    </Stack>
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
                        <Stack direction="row" spacing={0.5} useFlexGap sx={{ maxWidth: 260, flexWrap: "wrap" }}>
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
                      <IconButton
                        size="small"
                        onClick={() => {
                          setManagingAgent(a);
                          setRatesOpen(true);
                        }}
                        title="Manage product access & rates"
                      >
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
        open={ratesOpen}
        onClose={() => setRatesOpen(false)}
        agent={managingAgent}
        token={token}
        onSaved={loadAgents}
      />

      <AddAgentDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        agents={agents}
        token={token}
        onCreated={loadAgents}
      />

      <EditPaymentTermsDialog
        open={editTermsOpen}
        onClose={() => setEditTermsOpen(false)}
        agent={editingTermsAgent}
        token={token}
        onSaved={loadAgents}
      />
    </Container>
  );
}
