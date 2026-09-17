import { useEffect, useMemo, useState } from "react";
import {
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
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  updateCoverage,
  getCoveragePricing,
  updateCoveragePricingMode,
  updateValuePercentageTiers,
  updateFlatTiers,
  updateSeatTiers,
  createAllowablePeriod,
} from "../api/client";
import { NumberField } from "./NumberField";
import { formatPeriodLabel } from "../utils/coveragePeriods";

const PRICING_MODES = [
  { value: "PERCENTAGE", label: "Percentage of coverage amount", description: "Agent enters a coverage amount and premium, floored by the net rate." },
  { value: "VALUE_PERCENTAGE", label: "Percentage of vehicle value", description: "A tiered rate is applied automatically based on the vehicle's current (depreciated) value." },
  { value: "FLAT_TIER", label: "Fixed insured-value tiers", description: "The agent picks from a fixed menu of insured values, each with its own fixed price." },
  { value: "VEHICLE_SEATS_BASED", label: "Vehicle seat count", description: "The agent picks an insured amount per occupant; coverage_amount is seats × that amount, and the premium floor is (seats beyond a threshold) × that tier's own rate." },
];

function toValueTierForm(tiers) {
  return tiers.map((t) => ({ min_value: String(t.min_value), rate_percentage: String(t.rate_percentage) }));
}

function toFlatTierForm(tiers) {
  return tiers.map((t) => ({ coverage_amount: String(t.coverage_amount), coverage_price: String(t.coverage_price) }));
}

function toSeatTierForm(tiers) {
  return tiers.map((t) => ({
    insured_amount_per_occupant: String(t.insured_amount_per_occupant),
    rate_per_excess_seat: String(t.rate_per_excess_seat),
  }));
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

// The period/mode/rate/tier editing surface for one coverage — embedded in
// Settings → Manage Products' "Edit Coverage" dialog (its Pricing section)
// rather than living on its own page. `coverage` needs { id, coverage_name,
// maximum_coverage, allowable_periods: [{ id, coverage_in_days }] } —
// class/variant context for the "Add Coverage Period" dialog is passed
// separately via `contextLabel` since the caller already has it on hand from
// the class→variant→coverage tree. `onChanged` fires after any successful
// save (maximum_coverage, pricing mode/rate/tiers, or a newly added period)
// so the caller can refresh its own copy of the coverage list/tree.
export function CoveragePricingEditor({ token, coverage, contextLabel, onChanged }) {
  const [allowablePeriods, setAllowablePeriods] = useState(coverage.allowable_periods || []);
  const [coveragePeriodDays, setCoveragePeriodDays] = useState("");
  const [pricingLoading, setPricingLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [addPeriodOpen, setAddPeriodOpen] = useState(false);
  const [addPeriodDraft, setAddPeriodDraft] = useState("");
  const [addPeriodSubmitting, setAddPeriodSubmitting] = useState(false);
  const [addPeriodError, setAddPeriodError] = useState("");

  const [maximumCoverage, setMaximumCoverage] = useState(String(coverage.maximum_coverage));
  const [originalMaximumCoverage, setOriginalMaximumCoverage] = useState(String(coverage.maximum_coverage));
  const [pricingMode, setPricingMode] = useState("PERCENTAGE");
  const [originalPricingMode, setOriginalPricingMode] = useState("PERCENTAGE");
  const [standardRatePercent, setStandardRatePercent] = useState("");
  const [originalStandardRatePercent, setOriginalStandardRatePercent] = useState("");
  const [valueTiers, setValueTiers] = useState([]);
  const [originalValueTiers, setOriginalValueTiers] = useState([]);
  const [flatTiers, setFlatTiers] = useState([]);
  const [originalFlatTiers, setOriginalFlatTiers] = useState([]);
  const [thresholdSeats, setThresholdSeats] = useState("");
  const [originalThresholdSeats, setOriginalThresholdSeats] = useState("");
  const [seatTiers, setSeatTiers] = useState([]);
  const [originalSeatTiers, setOriginalSeatTiers] = useState([]);

  // A different coverage has its own (possibly entirely different) set of
  // periods — default to its first one whenever the currently-selected
  // period doesn't actually belong to it (a fresh coverage, or one whose
  // periods changed under it).
  useEffect(() => {
    setAllowablePeriods(coverage.allowable_periods || []);
    if ((coverage.allowable_periods || []).some((p) => p.coverage_in_days === coveragePeriodDays)) return;
    setCoveragePeriodDays(coverage.allowable_periods?.[0]?.coverage_in_days ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverage.id]);

  useEffect(() => {
    setMaximumCoverage(String(coverage.maximum_coverage));
    setOriginalMaximumCoverage(String(coverage.maximum_coverage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverage.id]);

  useEffect(() => {
    if (!coveragePeriodDays) return;
    setPricingLoading(true);
    setError("");
    setSaved(false);
    getCoveragePricing(token, coverage.id, coveragePeriodDays)
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
        const threshold = data.threshold_seats !== null ? String(data.threshold_seats) : "";
        setThresholdSeats(threshold);
        setOriginalThresholdSeats(threshold);
        const sTiers = toSeatTierForm(data.seat_tier_prices || []);
        setSeatTiers(sTiers);
        setOriginalSeatTiers(sTiers);
      })
      .catch((err) => setError(err.message))
      .finally(() => setPricingLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverage.id, coveragePeriodDays, token]);

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
    if (allowablePeriods.some((p) => p.coverage_in_days === days)) {
      setAddPeriodError(`This coverage already has a ${days}-day period`);
      return;
    }
    setAddPeriodSubmitting(true);
    setAddPeriodError("");
    try {
      const period = await createAllowablePeriod(token, coverage.id, days);
      setAllowablePeriods((prev) => [...prev, period].sort((a, b) => a.coverage_in_days - b.coverage_in_days));
      setCoveragePeriodDays(period.coverage_in_days);
      setAddPeriodOpen(false);
      onChanged?.();
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
      !sameTiers(flatTiers, originalFlatTiers) ||
      thresholdSeats !== originalThresholdSeats ||
      !sameTiers(seatTiers, originalSeatTiers),
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
      thresholdSeats,
      originalThresholdSeats,
      seatTiers,
      originalSeatTiers,
    ]
  );

  function handleCancel() {
    setMaximumCoverage(originalMaximumCoverage);
    setPricingMode(originalPricingMode);
    setStandardRatePercent(originalStandardRatePercent);
    setValueTiers(originalValueTiers);
    setFlatTiers(originalFlatTiers);
    setThresholdSeats(originalThresholdSeats);
    setSeatTiers(originalSeatTiers);
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

  function addSeatTier() {
    setSeatTiers((prev) => [...prev, { insured_amount_per_occupant: "", rate_per_excess_seat: "" }]);
  }

  function updateSeatTier(index, field, value) {
    setSeatTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function removeSeatTier(index) {
    setSeatTiers((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (maximumCoverage !== originalMaximumCoverage) {
        await updateCoverage(token, coverage.id, { maximum_coverage: Number(maximumCoverage) });
      }
      if (pricingMode === "VALUE_PERCENTAGE") {
        const tiers = valueTiers.map((t) => ({ min_value: Number(t.min_value), rate_percentage: Number(t.rate_percentage) }));
        const minValues = tiers.map((t) => t.min_value);
        if (new Set(minValues).size !== minValues.length) {
          throw new Error("Each tier needs a distinct minimum value");
        }
        await updateValuePercentageTiers(token, coverage.id, coveragePeriodDays, tiers);
      }
      if (pricingMode === "FLAT_TIER") {
        const tiers = flatTiers.map((t) => ({ coverage_amount: Number(t.coverage_amount), coverage_price: Number(t.coverage_price) }));
        const amounts = tiers.map((t) => t.coverage_amount);
        if (new Set(amounts).size !== amounts.length) {
          throw new Error("Each tier needs a distinct insured value");
        }
        await updateFlatTiers(token, coverage.id, coveragePeriodDays, tiers);
      }
      if (pricingMode === "VEHICLE_SEATS_BASED") {
        const tiers = seatTiers.map((t) => ({
          insured_amount_per_occupant: Number(t.insured_amount_per_occupant),
          rate_per_excess_seat: Number(t.rate_per_excess_seat),
        }));
        const amounts = tiers.map((t) => t.insured_amount_per_occupant);
        if (new Set(amounts).size !== amounts.length) {
          throw new Error("Each tier needs a distinct insured amount per occupant");
        }
        await updateSeatTiers(token, coverage.id, coveragePeriodDays, tiers);
      }
      const modeChanged = pricingMode !== originalPricingMode;
      const rateChanged = pricingMode === "PERCENTAGE" && standardRatePercent !== originalStandardRatePercent;
      const thresholdChanged = pricingMode === "VEHICLE_SEATS_BASED" && thresholdSeats !== originalThresholdSeats;
      if (modeChanged || rateChanged || thresholdChanged) {
        if (pricingMode === "PERCENTAGE" && !standardRatePercent) {
          throw new Error("Enter a standard rate for this coverage");
        }
        if (pricingMode === "VEHICLE_SEATS_BASED" && thresholdSeats === "") {
          throw new Error("Enter a seat threshold for this coverage");
        }
        await updateCoveragePricingMode(token, coverage.id, {
          pricing_mode: pricingMode,
          coverage_in_days: coveragePeriodDays,
          ...(pricingMode === "PERCENTAGE" ? { standard_rate: Number(standardRatePercent) / 100 } : {}),
          ...(pricingMode === "VEHICLE_SEATS_BASED" ? { threshold_seats: Number(thresholdSeats) } : {}),
        });
      }

      setOriginalMaximumCoverage(maximumCoverage);
      const refreshed = await getCoveragePricing(token, coverage.id, coveragePeriodDays);
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
      const threshold = refreshed.threshold_seats !== null ? String(refreshed.threshold_seats) : "";
      setThresholdSeats(threshold);
      setOriginalThresholdSeats(threshold);
      const sTiers = toSeatTierForm(refreshed.seat_tier_prices || []);
      setSeatTiers(sTiers);
      setOriginalSeatTiers(sTiers);
      setSaved(true);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Autocomplete
        options={allowablePeriods.map((p) => p.coverage_in_days)}
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

      {allowablePeriods.length === 0 && (
        <Alert severity="info">
          This coverage has no allowable period yet — type a number of days into the field above and choose "Add"
          to create one before setting its pricing.
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
                Used whenever an agent doesn't have a custom net rate for this coverage at this period — the premium
                an agent charges can never come in under coverage amount × this rate.
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

          {pricingMode === "VEHICLE_SEATS_BASED" && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                Seat threshold — {formatPeriodLabel(coveragePeriodDays)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                No charge for seats at or below the threshold — only seats beyond it are charged, at whichever tier's
                rate the agent picks below (e.g. a 7-seat threshold on a 15-seater charges for 8 seats).
              </Typography>
              <NumberField
                label="Seat threshold"
                value={thresholdSeats}
                onChange={setThresholdSeats}
                fullWidth
                slotProps={{ input: { endAdornment: <InputAdornment position="end">seats</InputAdornment> } }}
              />
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                Insured amount per occupant — {formatPeriodLabel(coveragePeriodDays)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                The agent picks one of these amounts; coverage_amount becomes seats × that amount, and the premium
                floor is (seats beyond the threshold) × this tier's own rate — e.g. 15 seats at ₱100,000/occupant
                with a 7-seat threshold insures ₱1,500,000 and floors the premium at 8 × this tier's rate.
              </Typography>
              <Stack spacing={1.5}>
                {seatTiers.map((tier, index) => (
                  <Box key={index} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <NumberField
                      label="Insured amount per occupant"
                      value={tier.insured_amount_per_occupant}
                      onChange={(v) => updateSeatTier(index, "insured_amount_per_occupant", v)}
                      fullWidth
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                    />
                    <NumberField
                      label="Rate per excess seat"
                      value={tier.rate_per_excess_seat}
                      onChange={(v) => updateSeatTier(index, "rate_per_excess_seat", v)}
                      fullWidth
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                    />
                    <IconButton onClick={() => removeSeatTier(index)} size="small">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Button startIcon={<AddIcon />} onClick={addSeatTier} sx={{ alignSelf: "flex-start" }}>
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

      <Dialog open={addPeriodOpen} onClose={() => setAddPeriodOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add Coverage Period</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {contextLabel && (
              <Typography variant="body2" color="text.secondary">
                {contextLabel}
              </Typography>
            )}
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
    </Stack>
  );
}
