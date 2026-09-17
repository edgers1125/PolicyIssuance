import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Box,
  Stack,
  Typography,
  TextField,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Grid,
  InputAdornment,
  Alert,
  CircularProgress,
  Button,
  MenuItem,
  Divider,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useAuth } from "../context/AuthContext";
import { getQuotation, getProductCatalog, updateQuotation, previewQuotationPdf } from "../api/client";
import { formatPHP, formatRate } from "../utils/currency";
import { formatPeriodLabel } from "../utils/coveragePeriods";
import { currentVehicleValue, findApplicableValueTier } from "../utils/vehicleValue";
import { NumberField } from "../components/NumberField";
import { PdfViewer } from "../components/PdfViewer";

const DOC_STAMPS_RATE = 0.125;
const VAT_RATE = 0.12;
const LGT_RATE = 0.002;

// Same as QuotationCreator.jsx's helper of the same name — coverage_end_at
// is always start-plus-whole-days, never entered directly.
function addDaysToLocalDateTime(value, days) {
  if (!value || !Number.isFinite(days)) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The Date object -> "YYYY-MM-DDTHH:mm" a <input type="datetime-local">
// wants. Deliberately reads UTC components, not local ones: the rest of
// this app (QuotationCreator.jsx included) sends a datetime-local value
// straight to the server as a naive string, which z.coerce.date() then
// parses in the *server's* timezone (UTC — see backend/src/index.js's
// container, which sets no TZ) — never the browser's. Using local getters
// here would silently shift the date by the browser/server offset the
// moment an unrelated field on the same quotation gets edited and this
// value is simply resubmitted unchanged.
function toLocalDateTimeInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Mirrors QuotationCreator.jsx's resolveCoverageSelection — client-side,
// non-authoritative pricing preview (the server always recomputes and
// enforces this independently on save). Vehicles here are the quotation's
// own fixed list (never edited from this dialog), not user-entered ones.
function resolveCoverageSelection(cov, selection, vehicles, addressValue) {
  if (!selection) return null;

  const scopedToAll = selection.vehicle_indices === null || selection.vehicle_indices === undefined;
  const targetIndices =
    vehicles.length === 0 ? [null] : scopedToAll ? vehicles.map((_, i) => i) : selection.vehicle_indices;

  if (targetIndices.length === 0) {
    return { coverage_amount: 0, premium_amount: 0, payable_to_bethel: 0, pending: true, noVehicleSelected: true };
  }

  const count = targetIndices.length;
  const enteredPremium = Number(selection.premium_amount) || 0;

  let totalCoverageAmount = 0;
  let totalPayable = 0;
  let maxPayablePerVehicle = 0;

  for (const idx of targetIndices) {
    let coverageAmount;
    let payablePerVehicle;

    if (cov.pricing_mode === "VALUE_PERCENTAGE") {
      const vehicle = idx !== null ? vehicles[idx] : null;
      // Motor prices off the targeted vehicle's own (depreciated) value;
      // Property has no vehicles at all, so it prices off the quotation's
      // fixed risk address value instead (never edited from this dialog).
      const targetValue = vehicle
        ? currentVehicleValue(vehicle.estimated_value, vehicle.initial_assessment_date || new Date())
        : Number(addressValue) || null;
      if (targetValue === null || targetValue === undefined) {
        return { coverage_amount: 0, premium_amount: 0, payable_to_bethel: 0, pending: true };
      }
      const tier = findApplicableValueTier(cov.value_percentage_tiers, targetValue);
      if (!tier) {
        return { coverage_amount: 0, premium_amount: 0, payable_to_bethel: 0, pending: true, noTier: true };
      }
      coverageAmount = targetValue;
      payablePerVehicle = targetValue * (Number(tier.rate_percentage) / 100);
    } else if (cov.pricing_mode === "FLAT_TIER") {
      const tier = (cov.tier_based_prices || []).find(
        (t) => String(t.coverage_amount) === String(selection.coverage_amount)
      );
      if (!tier) {
        return { coverage_amount: 0, premium_amount: 0, payable_to_bethel: 0, pending: true };
      }
      coverageAmount = Number(tier.coverage_amount);
      payablePerVehicle = Number(tier.coverage_price);
    } else if (cov.pricing_mode === "VEHICLE_SEATS_BASED") {
      // Property has no vehicles at all — seat-based pricing has nothing to
      // key off in that case.
      if (idx === null) {
        return { coverage_amount: 0, premium_amount: 0, payable_to_bethel: 0, pending: true };
      }
      const seats = Number(vehicles[idx]?.no_of_seats);
      if (!Number.isFinite(seats) || seats <= 0) {
        return { coverage_amount: 0, premium_amount: 0, payable_to_bethel: 0, pending: true };
      }
      if (cov.seats_threshold === null || cov.seats_threshold === undefined) {
        return { coverage_amount: 0, premium_amount: 0, payable_to_bethel: 0, pending: true, noTier: true };
      }
      // selection.coverage_amount is the agent's chosen "insured amount for
      // each occupant" — the tier key, same convention as FLAT_TIER's own
      // coverage_amount — not the final total insured value.
      const tier = (cov.seats_tier_prices || []).find(
        (t) => String(t.insured_amount_per_occupant) === String(selection.coverage_amount)
      );
      if (!tier) {
        return { coverage_amount: 0, premium_amount: 0, payable_to_bethel: 0, pending: true };
      }
      const excessSeats = Math.max(0, seats - Number(cov.seats_threshold));
      coverageAmount = seats * Number(tier.insured_amount_per_occupant);
      payablePerVehicle = excessSeats * Number(tier.rate_per_excess_seat);
    } else {
      coverageAmount = Number(selection.coverage_amount) || 0;
      payablePerVehicle = coverageAmount * Number(cov.rate);
    }

    totalCoverageAmount += coverageAmount;
    totalPayable += payablePerVehicle;
    maxPayablePerVehicle = Math.max(maxPayablePerVehicle, payablePerVehicle);
  }

  return {
    coverage_amount: totalCoverageAmount,
    payable_to_bethel: totalPayable,
    premium_amount: enteredPremium * count,
    pending: false,
    minPremiumPerVehicle: maxPayablePerVehicle,
    belowMinimum:
      Boolean(selection.premium_amount) && Math.round(enteredPremium * 100) < Math.round(maxPayablePerVehicle * 100),
    exceedsMax:
      cov.pricing_mode === "PERCENTAGE" && (Number(selection.coverage_amount) || 0) > Number(cov.effective_maximum_coverage),
    agentEarnings: enteredPremium * count - totalPayable,
    hasPremium: Boolean(selection.premium_amount),
    effectiveRate: totalCoverageAmount > 0 ? totalPayable / totalCoverageAmount : 0,
  };
}

function coverageAllowsPeriod(cov, days) {
  return Boolean(days) && (cov.allowable_periods || []).some((p) => p.coverage_in_days === days);
}

function coverageIsPriced(cov) {
  return cov.has_pricing !== false;
}

// Regroups the quotation's already-expanded-per-vehicle coverage rows back
// into one editable selection per coverage_id — see backend
// toQuotationDetail's vehicle_index for how each row maps onto
// detail.vehicles. A coverage covering every one of the quotation's vehicles
// is treated as "whole policy" (vehicle_indices: null), matching how it's
// stored the moment it's re-saved with vehicle_indices left unset.
function reconstructSelections(detail, isMotor) {
  const groups = new Map();
  for (const c of detail.coverages) {
    if (!groups.has(c.coverage_id)) {
      groups.set(c.coverage_id, { indices: [], amount: c.amount, premium: c.premium });
    }
    const g = groups.get(c.coverage_id);
    if (isMotor && c.vehicle_index !== null && c.vehicle_index !== undefined) {
      g.indices.push(c.vehicle_index);
    }
  }
  const selections = {};
  for (const [coverageId, g] of groups.entries()) {
    const scopedToAll = !isMotor || g.indices.length >= detail.vehicles.length;
    selections[coverageId] = {
      coverage_amount: String(g.amount),
      premium_amount: String(g.premium),
      vehicle_indices: scopedToAll ? null : g.indices,
    };
  }
  return selections;
}

export function EditQuotationDialog({ quotationId, token, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [detail, setDetail] = useState(null);
  const [rawCoverages, setRawCoverages] = useState([]);

  const [coverageStartAt, setCoverageStartAt] = useState("");
  const [coveragePeriodDays, setCoveragePeriodDays] = useState("");
  const [coverageSelections, setCoverageSelections] = useState({});
  const [sendPolicyToEmail, setSendPolicyToEmail] = useState(true);
  // Snapshot of the form's state right after loading — "Preview changes"
  // stays disabled until something actually differs from this, since
  // previewing/saving an unchanged quotation (including the delivery
  // checkbox's own pre-checked default below) has nothing to show.
  const [initialSnapshot, setInitialSnapshot] = useState(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewPdfError, setPreviewPdfError] = useState("");

  useEffect(() => {
    if (!quotationId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([getQuotation(token, quotationId), getProductCatalog(token)])
      .then(([q, catalog]) => {
        if (cancelled) return;
        const isMotor = q.class_name === "Motor";
        setDetail(q);
        const startAt = toLocalDateTimeInput(q.coverage_start_at);
        setCoverageStartAt(startAt);
        const days = Math.round((new Date(q.coverage_end_at) - new Date(q.coverage_start_at)) / (24 * 60 * 60 * 1000));
        setCoveragePeriodDays(days);
        const selections = reconstructSelections(q, isMotor);
        setCoverageSelections(selections);
        // Pre-checked regardless of what this quotation was last saved with —
        // every revision defaults to notifying the client, since that's the
        // sensible default for "I just changed something about their
        // quotation," not a reflection of the stored value.
        setSendPolicyToEmail(true);
        setInitialSnapshot({ coverageStartAt: startAt, coveragePeriodDays: days, coverageSelections: selections, sendPolicyToEmail: true });

        const variant = catalog
          .flatMap((cls) => cls.product_variants)
          .find((v) => v.id === q.product_variant_id);
        setRawCoverages(variant ? variant.product_coverages : []);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [quotationId, token]);

  const isMotor = detail?.class_name === "Motor";
  const coverageVehicles = isMotor ? detail?.vehicles || [] : [];
  // Property's VALUE_PERCENTAGE stand-in for a vehicle's own value — the
  // quotation's own risk address, fixed at creation (never edited here).
  const riskAddressValue = detail?.class_name === "Property" ? detail?.risk_address_value ?? null : null;

  const coverages = rawCoverages.map((cov) => {
    const period = (cov.allowable_periods || []).find((p) => p.coverage_in_days === coveragePeriodDays);
    return period
      ? {
          ...cov,
          rate: period.rate,
          effective_maximum_coverage: period.effective_maximum_coverage,
          is_custom_rate: period.is_custom_rate,
          value_percentage_tiers: period.value_percentage_tiers,
          tier_based_prices: period.tier_based_prices,
          seats_threshold: period.seats_threshold,
          seats_tier_prices: period.seats_tier_prices,
          has_custom_tiers: period.has_custom_tiers,
          has_pricing: period.has_pricing,
        }
      : cov;
  });

  const availablePeriodDays = Array.from(
    new Set(coverages.flatMap((c) => (c.allowable_periods || []).map((p) => p.coverage_in_days)))
  ).sort((a, b) => a - b);

  const coverageEndAt = coverageStartAt && coveragePeriodDays
    ? addDaysToLocalDateTime(coverageStartAt, Number(coveragePeriodDays))
    : "";

  const totalPremium = Object.entries(coverageSelections).reduce((sum, [coverageId, selection]) => {
    const cov = coverages.find((c) => c.id === coverageId);
    if (!cov) return sum;
    const resolved = resolveCoverageSelection(cov, selection, coverageVehicles, riskAddressValue);
    return sum + (resolved?.premium_amount || 0);
  }, 0);
  const docStamps = totalPremium * DOC_STAMPS_RATE;
  const vat = totalPremium * VAT_RATE;
  const lgt = totalPremium * LGT_RATE;
  const miscAmount = Number(detail?.misc) || 0;
  const totalAmount = totalPremium + docStamps + vat + lgt + miscAmount;

  // "Preview changes" has nothing to show until the form actually diverges
  // from what was just loaded — comparing against initialSnapshot rather
  // than the raw DB record, since sendPolicyToEmail's own pre-checked
  // default above isn't itself a change the agent made.
  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    return (
      coverageStartAt !== initialSnapshot.coverageStartAt ||
      coveragePeriodDays !== initialSnapshot.coveragePeriodDays ||
      sendPolicyToEmail !== initialSnapshot.sendPolicyToEmail ||
      JSON.stringify(coverageSelections) !== JSON.stringify(initialSnapshot.coverageSelections)
    );
  }, [coverageStartAt, coveragePeriodDays, coverageSelections, sendPolicyToEmail, initialSnapshot]);

  function togglePeriod(days) {
    const next = coveragePeriodDays === days ? "" : days;
    setCoveragePeriodDays(next);
    setCoverageSelections((prev) => {
      if (!next) return {};
      const filtered = {};
      for (const [coverageId, sel] of Object.entries(prev)) {
        const cov = coverages.find((c) => c.id === coverageId);
        if (cov && coverageAllowsPeriod(cov, next)) filtered[coverageId] = sel;
      }
      return filtered;
    });
  }

  function toggleCoverage(coverageId) {
    const cov = coverages.find((c) => c.id === coverageId);
    if (!cov || !coverageAllowsPeriod(cov, coveragePeriodDays)) return;
    setCoverageSelections((prev) => {
      const next = { ...prev };
      if (next[coverageId]) {
        delete next[coverageId];
      } else if (!coverageIsPriced(cov)) {
        return prev;
      } else {
        next[coverageId] = { coverage_amount: "", premium_amount: "", vehicle_indices: null };
      }
      return next;
    });
  }

  function updateCoverageField(coverageId, field, value) {
    setCoverageSelections((prev) => ({ ...prev, [coverageId]: { ...prev[coverageId], [field]: value } }));
  }

  function buildPreviewProps() {
    return {
      applicationNumber: detail.quotation_number,
      isQuotation: true,
      classNameLabel: detail.class_name,
      variantName: detail.variant_name,
      insuredName: detail.insured_name,
      insuredAddress: detail.insured_address,
      agentCode: detail.agent_code,
      coverageStartAt,
      coverageEndAt,
      // documentPreviewPropsSchema's vehicle fields are optional strings —
      // they accept being omitted, but not an explicit null, which is
      // exactly what a DB-backed nullable column with nothing set comes
      // back as (unlike QuotationCreator's own form state, which always
      // initializes these to "").
      vehicles: coverageVehicles.map((v) => ({
        plate_number: v.plate_number || "",
        mv_file_no: v.mv_file_no || "",
        engine_number: v.engine_number || "",
        chassis_number: v.chassis_number || "",
        make: v.make || "",
        model: v.model || "",
        year_model: v.year_model ?? "",
        vehicle_type: v.vehicle_type || "",
        color: v.color || "",
        no_of_seats: v.no_of_seats ?? "",
      })),
      coverages: Object.entries(coverageSelections).map(([id, sel]) => {
        const cov = coverages.find((c) => c.id === id);
        const resolved = cov ? resolveCoverageSelection(cov, sel, coverageVehicles, riskAddressValue) : null;
        return {
          name: cov?.coverage_name || "",
          clause: cov?.clause || "",
          amount: resolved?.coverage_amount || 0,
          premium: resolved?.premium_amount || 0,
          pricing_mode: cov?.pricing_mode,
        };
      }),
      deductibleRate: detail.deductible_rate,
      totalPremium,
      docStamps,
      vat,
      lgt,
      misc: miscAmount,
      totalAmount,
      remarks: detail.remarks || "",
      renewingPolicyNumber: detail.renewed_policy_number || undefined,
    };
  }

  function handleOpenPreview() {
    setError("");
    const entries = Object.entries(coverageSelections);
    if (entries.length === 0) {
      setError("Select at least one coverage.");
      return;
    }
    if (!coverageStartAt || !coveragePeriodDays || !coverageEndAt) {
      setError("Set the coverage period.");
      return;
    }
    for (const [coverageId, selection] of entries) {
      const cov = coverages.find((c) => c.id === coverageId);
      const resolved = resolveCoverageSelection(cov, selection, coverageVehicles, riskAddressValue);
      if (resolved.pending) {
        setError(`Finish pricing ${cov.coverage_name} before previewing.`);
        return;
      }
      if (resolved.exceedsMax) {
        setError(`Coverage amount for ${cov.coverage_name} exceeds the maximum for this coverage.`);
        return;
      }
      if (!resolved.hasPremium || resolved.belowMinimum) {
        setError(`Enter a valid premium for ${cov.coverage_name}.`);
        return;
      }
    }
    setPreviewOpen(true);
  }

  useEffect(() => {
    if (!previewOpen) return;
    let cancelled = false;
    let objectUrl = null;
    setPreviewPdfLoading(true);
    setPreviewPdfError("");
    previewQuotationPdf(token, buildPreviewProps())
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewPdfUrl(objectUrl);
      })
      .catch((err) => !cancelled && setPreviewPdfError(err.message))
      .finally(() => !cancelled && setPreviewPdfLoading(false));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPreviewPdfUrl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen]);

  async function handleConfirmSave() {
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        coverage_start_at: coverageStartAt,
        coverage_end_at: coverageEndAt,
        send_policy_to_email: sendPolicyToEmail,
        coverages: Object.entries(coverageSelections).map(([coverage_id, v]) => {
          const cov = coverages.find((c) => c.id === coverage_id);
          return {
            coverage_id,
            // VALUE_PERCENTAGE never collects a coverage_amount from the
            // agent (the server computes its own from the vehicle/address
            // value) — coverage_amount is only required by the schema to
            // reject an unfilled-in PERCENTAGE/FLAT_TIER/VEHICLE_SEATS_BASED
            // selection, so send a harmless positive placeholder here
            // instead of the unset 0.
            coverage_amount: cov?.pricing_mode === "VALUE_PERCENTAGE" ? 1 : Number(v.coverage_amount) || 0,
            premium_amount: Number(v.premium_amount) || 0,
            vehicle_indices: v.vehicle_indices ?? null,
          };
        }),
      };
      const updated = await updateQuotation(token, quotationId, payload);
      onSaved?.(updated);
      onClose();
    } catch (err) {
      setError(err.message);
      setPreviewOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={Boolean(quotationId)} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {detail ? `Edit Quotation ${detail.quotation_number}` : "Edit Quotation"}
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : !detail ? (
          <Alert severity="error">{error || "Quotation not found."}</Alert>
        ) : (
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}

            <Typography variant="body2" color="text.secondary">
              {detail.insured_name} &mdash; {detail.class_name} / {detail.variant_name}
            </Typography>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Insured from"
                  type="datetime-local"
                  value={coverageStartAt}
                  onChange={(e) => setCoverageStartAt(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Insured to"
                  type="datetime-local"
                  value={coverageEndAt}
                  slotProps={{ inputLabel: { shrink: true } }}
                  disabled
                  fullWidth
                  helperText="Computed from the insured-from date and the selected period"
                />
              </Grid>
            </Grid>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Coverage Period
              </Typography>
              <FormGroup row>
                {availablePeriodDays.map((days) => (
                  <FormControlLabel
                    key={days}
                    control={<Checkbox checked={coveragePeriodDays === days} onChange={() => togglePeriod(days)} />}
                    label={formatPeriodLabel(days)}
                  />
                ))}
              </FormGroup>
            </Box>

            <Divider />

            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Coverages
            </Typography>

            <Stack spacing={1.5} divider={<Divider />}>
              {coverages.map((cov) => {
                const selection = coverageSelections[cov.id];
                const resolved = selection ? resolveCoverageSelection(cov, selection, coverageVehicles, riskAddressValue) : null;
                const periodAllowed = coverageAllowsPeriod(cov, coveragePeriodDays);
                const isPriced = !periodAllowed || coverageIsPriced(cov);
                return (
                  <Box key={cov.id}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={Boolean(selection)}
                          onChange={() => toggleCoverage(cov.id)}
                          disabled={!periodAllowed || !isPriced}
                        />
                      }
                      label={
                        (cov.pricing_mode === "PERCENTAGE"
                          ? `${cov.coverage_name} (max ${formatPHP(cov.effective_maximum_coverage ?? cov.maximum_coverage)})`
                          : cov.coverage_name) +
                        (!periodAllowed && coveragePeriodDays
                          ? ` — not offered for the ${formatPeriodLabel(coveragePeriodDays).toLowerCase()} period`
                          : periodAllowed && !isPriced
                            ? " — pricing not yet configured for this period"
                            : "")
                      }
                    />
                    {selection && (
                      <Box sx={{ pl: 4, pb: 1 }}>
                        {cov.pricing_mode === "PERCENTAGE" && (
                          <Grid container spacing={2} sx={{ mb: 1 }}>
                            <Grid size={6}>
                              <NumberField
                                label="Coverage amount"
                                value={selection.coverage_amount}
                                onChange={(v) => updateCoverageField(cov.id, "coverage_amount", v)}
                                required
                                fullWidth
                                size="small"
                                error={resolved.exceedsMax}
                                helperText={resolved.exceedsMax ? "Exceeds the maximum for this coverage" : ""}
                                slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                              />
                            </Grid>
                          </Grid>
                        )}
                        {cov.pricing_mode === "FLAT_TIER" && (
                          <TextField
                            select
                            label="Insured value"
                            value={resolved.pending ? "" : String(selection.coverage_amount)}
                            onChange={(e) => updateCoverageField(cov.id, "coverage_amount", e.target.value)}
                            required
                            fullWidth
                            size="small"
                            sx={{ mb: 1 }}
                          >
                            {(cov.tier_based_prices || []).map((tier) => (
                              <MenuItem key={tier.id} value={String(tier.coverage_amount)}>
                                {formatPHP(tier.coverage_amount)} — {formatPHP(tier.coverage_price)}
                              </MenuItem>
                            ))}
                          </TextField>
                        )}
                        {cov.pricing_mode === "VEHICLE_SEATS_BASED" && (
                          <TextField
                            select
                            label="Insured amount for each occupant"
                            value={
                              (cov.seats_tier_prices || []).some(
                                (t) => String(t.insured_amount_per_occupant) === String(selection.coverage_amount)
                              )
                                ? String(selection.coverage_amount)
                                : ""
                            }
                            onChange={(e) => updateCoverageField(cov.id, "coverage_amount", e.target.value)}
                            required
                            fullWidth
                            size="small"
                            sx={{ mb: 1 }}
                          >
                            {(cov.seats_tier_prices || []).map((tier) => (
                              <MenuItem
                                key={tier.insured_amount_per_occupant}
                                value={String(tier.insured_amount_per_occupant)}
                              >
                                {formatPHP(tier.insured_amount_per_occupant)}/occupant — {formatPHP(tier.rate_per_excess_seat)}/excess seat
                              </MenuItem>
                            ))}
                          </TextField>
                        )}
                        {!resolved.pending && (
                          <>
                            <NumberField
                              label="Premium amount (your price)"
                              value={selection.premium_amount}
                              onChange={(v) => updateCoverageField(cov.id, "premium_amount", v)}
                              required
                              fullWidth
                              size="small"
                              error={resolved.belowMinimum}
                              helperText={
                                resolved.belowMinimum
                                  ? `Below the amount payable to Bethel of ${formatPHP(resolved.minPremiumPerVehicle)}`
                                  : ""
                              }
                              slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                            />
                            <Alert severity="success" sx={{ mt: 1 }}>
                              Payable to Bethel: <strong>{formatPHP(resolved.payable_to_bethel)}</strong>
                              {resolved.hasPremium && !resolved.belowMinimum && (
                                <> &mdash; Your profit: <strong>{formatPHP(resolved.agentEarnings)}</strong></>
                              )}
                            </Alert>
                          </>
                        )}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Stack>

            <Divider />

            {/* Same breakdown QuotationCreator.jsx's own "Charges" section
                shows before creating a quotation — misc is display-only here
                (unlike there): PATCH /policy-quotations/:id only ever
                touches coverage period, delivery, and coverages, so there's
                nothing to edit it into. */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Charges
              </Typography>
              <Stack spacing={0.5}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Premium
                  </Typography>
                  <Typography variant="body2">{formatPHP(totalPremium)}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Doc. Stamps (12.5%)
                  </Typography>
                  <Typography variant="body2">{formatPHP(docStamps)}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    V.A.T. (12%)
                  </Typography>
                  <Typography variant="body2">{formatPHP(vat)}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    L.G.T. (0.2%)
                  </Typography>
                  <Typography variant="body2">{formatPHP(lgt)}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Miscellaneous
                  </Typography>
                  <Typography variant="body2">{formatPHP(miscAmount)}</Typography>
                </Box>
                <Divider />
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Total Php.
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {formatPHP(totalAmount)}
                  </Typography>
                </Box>
              </Stack>
            </Box>

            <Divider />

            {/* Bottom-most, not grouped with Coverage Period above — whether
                the client gets emailed about this edit is a separate,
                last-thing-to-decide question, unrelated to the coverage
                dates. Pre-checked by default (see initialSnapshot above);
                unlike the "email this quotation" checkbox at creation, a
                revision has already been seen once, so this defaults to
                notifying the client of the change rather than a first
                delivery. */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Delivery
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox checked={sendPolicyToEmail} onChange={(e) => setSendPolicyToEmail(e.target.checked)} />
                }
                label="Email this revised quotation to the client"
              />
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleOpenPreview} disabled={loading || !detail || !isDirty}>
          Preview changes
        </Button>
      </DialogActions>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Preview updated quotation</DialogTitle>
        <DialogContent>
          <Box sx={{ my: 1 }}>
            <PdfViewer url={previewPdfUrl} loading={previewPdfLoading} error={previewPdfError} />
          </Box>
          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)} disabled={submitting}>
            Back to editing
          </Button>
          <Button variant="contained" onClick={handleConfirmSave} disabled={submitting || previewPdfLoading}>
            {submitting ? "Saving..." : "Confirm and save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
