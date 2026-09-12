import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Box,
  Button,
  IconButton,
  Alert,
  CircularProgress,
  Stack,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  InputAdornment,
  Divider,
  Autocomplete,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "../context/AuthContext";
import {
  listCoverages,
  updateCoverage,
  getCoveragePricing,
  updateCoveragePricingMode,
  updateValuePercentageTiers,
  updateFlatTiers,
  createAllowablePeriod,
} from "../api/client";
import { CoverageSelector } from "../components/CoverageSelector";
import { NumberField } from "../components/NumberField";
import { formatPeriodLabel } from "../utils/coveragePeriods";

const PRICING_MODES = [
  { value: "PERCENTAGE", label: "Percentage of coverage amount", description: "Agent enters a coverage amount and premium, floored by the net rate." },
  { value: "VALUE_PERCENTAGE", label: "Percentage of vehicle value", description: "A tiered rate is applied automatically based on the vehicle's current (depreciated) value." },
  { value: "FLAT_TIER", label: "Fixed insured-value tiers", description: "The agent picks from a fixed menu of insured values, each with its own fixed price." },
];

function toValueTierForm(tiers) {
  return tiers.map((t) => ({ min_value: String(t.min_value), rate_percentage: String(t.rate_percentage) }));
}

function toFlatTierForm(tiers) {
  return tiers.map((t) => ({ coverage_amount: String(t.coverage_amount), coverage_price: String(t.coverage_price) }));
}

function sameTiers(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Sentinel option the period Autocomplete injects when the typed number of
// days doesn't match any of the coverage's existing periods — picking it
// opens the "Add Coverage Period" dialog instead of selecting a period.
function isAddNewOption(option) {
  return Boolean(option) && typeof option === "object" && option.addNew;
}

export function ManageCoveragePricing() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [coverages, setCoverages] = useState([]);
  const [coverageId, setCoverageId] = useState("");
  const [coveragePeriodDays, setCoveragePeriodDays] = useState("");
  const [loading, setLoading] = useState(true);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [addPeriodOpen, setAddPeriodOpen] = useState(false);
  const [addPeriodDraft, setAddPeriodDraft] = useState("");
  const [addPeriodSubmitting, setAddPeriodSubmitting] = useState(false);
  const [addPeriodError, setAddPeriodError] = useState("");

  const [maximumCoverage, setMaximumCoverage] = useState("");
  const [originalMaximumCoverage, setOriginalMaximumCoverage] = useState("");
  const [pricingMode, setPricingMode] = useState("PERCENTAGE");
  const [originalPricingMode, setOriginalPricingMode] = useState("PERCENTAGE");
  const [standardRatePercent, setStandardRatePercent] = useState("");
  const [originalStandardRatePercent, setOriginalStandardRatePercent] = useState("");
  const [valueTiers, setValueTiers] = useState([]);
  const [originalValueTiers, setOriginalValueTiers] = useState([]);
  const [flatTiers, setFlatTiers] = useState([]);
  const [originalFlatTiers, setOriginalFlatTiers] = useState([]);

  useEffect(() => {
    setLoading(true);
    listCoverages(token)
      .then((data) => {
        setCoverages(data);
        if (data.length > 0) {
          setCoverageId(data[0].id);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const selectedCoverage = coverages.find((c) => c.id === coverageId);
  const availablePeriods = selectedCoverage?.allowable_periods || [];

  // maximum_coverage lives on the plain coverage record itself (not the
  // pricing-mode-specific data below), so it's sourced straight from the
  // already-loaded `coverages` list rather than another round trip.
  useEffect(() => {
    const cov = coverages.find((c) => c.id === coverageId);
    if (!cov) return;
    const mc = String(cov.maximum_coverage);
    setMaximumCoverage(mc);
    setOriginalMaximumCoverage(mc);
  }, [coverageId, coverages]);

  // A different coverage has its own (possibly entirely different) set of
  // periods — default to its first one whenever the currently-selected
  // period doesn't actually belong to it (a fresh coverage, or one whose
  // periods changed under it).
  useEffect(() => {
    if (availablePeriods.some((p) => p.coverage_in_days === coveragePeriodDays)) return;
    setCoveragePeriodDays(availablePeriods[0]?.coverage_in_days ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverageId, availablePeriods.map((p) => p.coverage_in_days).join(",")]);

  useEffect(() => {
    if (!coverageId || !coveragePeriodDays) return;
    setPricingLoading(true);
    setError("");
    setSaved(false);
    getCoveragePricing(token, coverageId, coveragePeriodDays)
      .then((data) => {
        setPricingMode(data.pricing_mode);
        setOriginalPricingMode(data.pricing_mode);
        const ratePercent = data.standard_rate !== null ? (Number(data.standard_rate) * 100).toString() : "";
        setStandardRatePercent(ratePercent);
        setOriginalStandardRatePercent(ratePercent);
        const vTiers = toValueTierForm(data.value_percentage_tiers);
        const fTiers = toFlatTierForm(data.tier_based_prices);
        setValueTiers(vTiers);
        setOriginalValueTiers(vTiers);
        setFlatTiers(fTiers);
        setOriginalFlatTiers(fTiers);
      })
      .catch((err) => setError(err.message))
      .finally(() => setPricingLoading(false));
  }, [coverageId, coveragePeriodDays, token]);

  function handleCoverageChange(newCoverageId) {
    setCoverageId(newCoverageId);
  }

  function openAddPeriodDialog(days) {
    setAddPeriodDraft(days ? String(days) : "");
    setAddPeriodError("");
    setAddPeriodOpen(true);
  }

  async function handleCreatePeriod() {
    const days = Number(addPeriodDraft);
    if (!Number.isInteger(days) || days <= 0) {
      setAddPeriodError("Enter a whole number of days greater than 0");
      return;
    }
    if (availablePeriods.some((p) => p.coverage_in_days === days)) {
      setAddPeriodError(`This coverage already has a ${days}-day period`);
      return;
    }
    setAddPeriodSubmitting(true);
    setAddPeriodError("");
    try {
      const period = await createAllowablePeriod(token, coverageId, days);
      setCoverages((prev) =>
        prev.map((c) =>
          c.id === coverageId
            ? {
                ...c,
                allowable_periods: [...c.allowable_periods, period].sort(
                  (a, b) => a.coverage_in_days - b.coverage_in_days
                ),
              }
            : c
        )
      );
      setCoveragePeriodDays(period.coverage_in_days);
      setAddPeriodOpen(false);
    } catch (err) {
      setAddPeriodError(err.message);
    } finally {
      setAddPeriodSubmitting(false);
    }
  }

  const isDirty = useMemo(
    () =>
      maximumCoverage !== originalMaximumCoverage ||
      pricingMode !== originalPricingMode ||
      standardRatePercent !== originalStandardRatePercent ||
      !sameTiers(valueTiers, originalValueTiers) ||
      !sameTiers(flatTiers, originalFlatTiers),
    [
      maximumCoverage,
      originalMaximumCoverage,
      pricingMode,
      originalPricingMode,
      standardRatePercent,
      originalStandardRatePercent,
      valueTiers,
      originalValueTiers,
      flatTiers,
      originalFlatTiers,
    ]
  );

  function handleCancel() {
    setMaximumCoverage(originalMaximumCoverage);
    setPricingMode(originalPricingMode);
    setStandardRatePercent(originalStandardRatePercent);
    setValueTiers(originalValueTiers);
    setFlatTiers(originalFlatTiers);
    setError("");
  }

  function addValueTier() {
    setValueTiers((prev) => [...prev, { min_value: "", rate_percentage: "" }]);
  }

  function updateValueTier(index, field, value) {
    setValueTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function removeValueTier(index) {
    setValueTiers((prev) => prev.filter((_, i) => i !== index));
  }

  function addFlatTier() {
    setFlatTiers((prev) => [...prev, { coverage_amount: "", coverage_price: "" }]);
  }

  function updateFlatTier(index, field, value) {
    setFlatTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function removeFlatTier(index) {
    setFlatTiers((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (maximumCoverage !== originalMaximumCoverage) {
        const updated = await updateCoverage(token, coverageId, { maximum_coverage: Number(maximumCoverage) });
        setCoverages((prev) =>
          prev.map((c) => (c.id === coverageId ? { ...c, maximum_coverage: updated.maximum_coverage } : c))
        );
      }
      if (pricingMode === "VALUE_PERCENTAGE") {
        const tiers = valueTiers.map((t) => ({ min_value: Number(t.min_value), rate_percentage: Number(t.rate_percentage) }));
        const minValues = tiers.map((t) => t.min_value);
        if (new Set(minValues).size !== minValues.length) {
          throw new Error("Each tier needs a distinct minimum value");
        }
        await updateValuePercentageTiers(token, coverageId, coveragePeriodDays, tiers);
      }
      if (pricingMode === "FLAT_TIER") {
        const tiers = flatTiers.map((t) => ({ coverage_amount: Number(t.coverage_amount), coverage_price: Number(t.coverage_price) }));
        const amounts = tiers.map((t) => t.coverage_amount);
        if (new Set(amounts).size !== amounts.length) {
          throw new Error("Each tier needs a distinct insured value");
        }
        await updateFlatTiers(token, coverageId, coveragePeriodDays, tiers);
      }
      const modeChanged = pricingMode !== originalPricingMode;
      const rateChanged = pricingMode === "PERCENTAGE" && standardRatePercent !== originalStandardRatePercent;
      if (modeChanged || rateChanged) {
        if (pricingMode === "PERCENTAGE" && !standardRatePercent) {
          throw new Error("Enter a standard rate for this coverage");
        }
        await updateCoveragePricingMode(token, coverageId, {
          pricing_mode: pricingMode,
          coverage_in_days: coveragePeriodDays,
          ...(pricingMode === "PERCENTAGE" ? { standard_rate: Number(standardRatePercent) / 100 } : {}),
        });
      }

      const refreshed = await getCoveragePricing(token, coverageId, coveragePeriodDays);
      setPricingMode(refreshed.pricing_mode);
      setOriginalPricingMode(refreshed.pricing_mode);
      const ratePercent = refreshed.standard_rate !== null ? (Number(refreshed.standard_rate) * 100).toString() : "";
      setStandardRatePercent(ratePercent);
      setOriginalStandardRatePercent(ratePercent);
      const vTiers = toValueTierForm(refreshed.value_percentage_tiers);
      const fTiers = toFlatTierForm(refreshed.tier_based_prices);
      setValueTiers(vTiers);
      setOriginalValueTiers(vTiers);
      setFlatTiers(fTiers);
      setOriginalFlatTiers(fTiers);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
        <IconButton onClick={() => navigate("/settings")} edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Manage Coverage Pricing
        </Typography>
      </Box>

      <Stack spacing={2}>
        <CoverageSelector coverages={coverages} value={coverageId} onChange={handleCoverageChange} />

        <Autocomplete
          disabled={!coverageId}
          options={availablePeriods.map((p) => p.coverage_in_days)}
          getOptionLabel={(option) => (typeof option === "number" ? formatPeriodLabel(option) : option.label)}
          value={coveragePeriodDays || null}
          onChange={(e, newValue) => {
            if (newValue == null) return;
            if (isAddNewOption(newValue)) {
              openAddPeriodDialog(newValue.days);
              return;
            }
            setCoveragePeriodDays(newValue);
          }}
          filterOptions={(options, params) => {
            const input = params.inputValue.trim();
            const filtered = options.filter((days) => formatPeriodLabel(days).toLowerCase().includes(input.toLowerCase()));
            const typedDays = Number(input);
            if (input && Number.isInteger(typedDays) && typedDays > 0 && !options.includes(typedDays)) {
              filtered.push({ addNew: true, days: typedDays, label: `Add "${typedDays}"-day period…` });
            }
            return filtered;
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Coverage period"
              required
              helperText="Pricing below applies only to this period — type a number of days not already listed to add a new one."
            />
          )}
          fullWidth
        />

        {coverageId && availablePeriods.length === 0 && (
          <Alert severity="info">
            This coverage has no allowable period yet — type a number of days into the field above and choose
            "Add" to create one before setting its pricing.
          </Alert>
        )}

        <NumberField
          label="Maximum coverage"
          value={maximumCoverage}
          onChange={setMaximumCoverage}
          fullWidth
          helperText="Used whenever an agent doesn't have a personal maximum for this coverage."
          slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
        />

        {coveragePeriodDays && (pricingLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            <FormControl>
              <FormLabel sx={{ mb: 1 }}>Pricing mode</FormLabel>
              <RadioGroup value={pricingMode} onChange={(e) => setPricingMode(e.target.value)}>
                {PRICING_MODES.map((mode) => (
                  <Paper key={mode.value} variant="outlined" sx={{ mb: 1, p: 1.5 }}>
                    <FormControlLabel
                      value={mode.value}
                      control={<Radio />}
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {mode.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {mode.description}
                          </Typography>
                        </Box>
                      }
                      sx={{ alignItems: "flex-start", m: 0 }}
                    />
                  </Paper>
                ))}
              </RadioGroup>
            </FormControl>

            {pricingMode === "PERCENTAGE" && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                  Standard rate — {formatPeriodLabel(coveragePeriodDays)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                  Used whenever an agent doesn't have a custom net rate for this coverage at this period — the
                  premium an agent charges can never come in under coverage amount × this rate.
                </Typography>
                <NumberField
                  label="Standard rate"
                  value={standardRatePercent}
                  onChange={setStandardRatePercent}
                  fullWidth
                  slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                />
              </Paper>
            )}

            {pricingMode === "VALUE_PERCENTAGE" && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                  Value tiers — {formatPeriodLabel(coveragePeriodDays)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                  The tier with the highest minimum value that's still at or below the vehicle's current value is
                  applied — e.g. a ₱405,000 vehicle with a 1.07% tier starting at ₱0 pays ₱4,333.50.
                </Typography>
                <Stack spacing={1.5}>
                  {valueTiers.map((tier, index) => (
                    <Box key={index} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      <NumberField
                        label="Minimum value"
                        value={tier.min_value}
                        onChange={(v) => updateValueTier(index, "min_value", v)}
                        fullWidth
                        slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                      />
                      <NumberField
                        label="Rate"
                        value={tier.rate_percentage}
                        onChange={(v) => updateValueTier(index, "rate_percentage", v)}
                        fullWidth
                        slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                      />
                      <IconButton onClick={() => removeValueTier(index)} size="small">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                  <Button startIcon={<AddIcon />} onClick={addValueTier} sx={{ alignSelf: "flex-start" }}>
                    Add tier
                  </Button>
                </Stack>
              </Paper>
            )}

            {pricingMode === "FLAT_TIER" && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                  Insured value tiers — {formatPeriodLabel(coveragePeriodDays)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                  The agent picks one of these insured values when applying this coverage, and the matching price is
                  used automatically.
                </Typography>
                <Stack spacing={1.5}>
                  {flatTiers.map((tier, index) => (
                    <Box key={index} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      <NumberField
                        label="Insured value"
                        value={tier.coverage_amount}
                        onChange={(v) => updateFlatTier(index, "coverage_amount", v)}
                        fullWidth
                        slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                      />
                      <NumberField
                        label="Price"
                        value={tier.coverage_price}
                        onChange={(v) => updateFlatTier(index, "coverage_price", v)}
                        fullWidth
                        slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                      />
                      <IconButton onClick={() => removeFlatTier(index)} size="small">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                  <Button startIcon={<AddIcon />} onClick={addFlatTier} sx={{ alignSelf: "flex-start" }}>
                    Add tier
                  </Button>
                </Stack>
              </Paper>
            )}

            <Divider />

            <Box sx={{ display: "flex", gap: 2 }}>
              <Button variant="contained" onClick={handleSave} disabled={!isDirty || saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              {isDirty && (
                <Button onClick={handleCancel} disabled={saving}>
                  Cancel
                </Button>
              )}
            </Box>

            {saved && !isDirty && <Alert severity="success">Saved.</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
          </>
        ))}
      </Stack>

      <Dialog open={addPeriodOpen} onClose={() => setAddPeriodOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add Coverage Period</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                Insurance class: <strong>{selectedCoverage?.class_name}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Product variant: <strong>{selectedCoverage?.variant_name}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Coverage: <strong>{selectedCoverage?.coverage_name}</strong>
              </Typography>
            </Stack>
            <NumberField
              label="Number of days"
              value={addPeriodDraft}
              onChange={setAddPeriodDraft}
              fullWidth
              autoFocus
              helperText="A brand-new period starts with no pricing configured — set its rate/tiers next."
            />
            {addPeriodError && <Alert severity="error">{addPeriodError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddPeriodOpen(false)} disabled={addPeriodSubmitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreatePeriod} disabled={addPeriodSubmitting}>
            {addPeriodSubmitting ? "Adding..." : "Add period"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
