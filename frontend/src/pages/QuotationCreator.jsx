import { useEffect, useRef, useState } from "react";
import {
  Container,
  Typography,
  Paper,
  Box,
  Stack,
  TextField,
  MenuItem,
  Autocomplete,
  Button,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Alert,
  CircularProgress,
  Divider,
  Grid,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import { useAuth } from "../context/AuthContext";
import {
  getProductCatalog,
  listMyCustomers,
  createCustomer,
  updateCustomer,
  listMyCompanies,
  createCompany,
  updateCompany,
  listCustomersByAgent,
  listCompaniesByAgent,
  listAgentsForQuotation,
  updateVehicle,
  lookupVehicleByPlate,
  updateAddress,
  createPolicyQuotation,
  previewQuotationPdf,
} from "../api/client";
import { formatPHP, formatRate } from "../utils/currency";
import { formatPeriodLabel } from "../utils/coveragePeriods";
import { currentVehicleValue, findApplicableValueTier } from "../utils/vehicleValue";
import { NumberField } from "../components/NumberField";
import { PdfViewer } from "../components/PdfViewer";

const emptyCustomer = {
  first_name: "",
  last_name: "",
  middle_name: "",
  email: "",
  mobile_number: "",
  birthday: "",
  gender: "",
  existing_customer_id: null,
};

const emptyCompany = {
  company_code: "",
  company_name: "",
  tin_no: "",
  email: "",
  existing_company_id: null,
};

const emptyVehicle = {
  plate_number: "",
  mv_file_no: "",
  engine_number: "",
  chassis_number: "",
  // Only ever set here when this row was populated from an existing
  // (matched/reused) vehicle — a brand-new row leaves this blank and
  // inherits the filing's own variantId at submit time instead (see
  // handleConfirmSubmit's vehicles payload) — every vehicle on one filing
  // must resolve to the same Motor product variant (see
  // Vehicle.product_variant_id), so there's no separate per-row picker.
  product_variant_id: "",
  make: "",
  model: "",
  year_model: "",
  vehicle_type: "",
  color: "",
  no_of_seats: "",
  estimated_value: "",
  // Set automatically the first time an estimated value is ever recorded —
  // never entered directly, and never sent back to the server.
  initial_assessment_date: null,
  existing_vehicle_id: null,
  // Set once the agent confirms a plate match against a vehicle on file for a
  // different party — keeps the fields editable (unlike a normal same-party
  // reuse) and tells the backend to move ownership over on submit.
  reassign_owner: false,
};

const emptyAddress = {
  address_line_1: "",
  address_line_2: "",
  barangay: "",
  city: "",
  province: "",
  postal_code: "",
  country: "Philippines",
  existing_address_id: null,
  // Only meaningful for a Property risk address — VALUE_PERCENTAGE coverage
  // pricing prices off this the same way it prices off a vehicle's
  // estimated_value for Motor. Unlike a vehicle, this never locks/depreciates.
  estimated_value: "",
};

// Standard Philippine non-life insurance statutory rates, applied to total premium —
// mirrors the same constants the backend uses when actually submitting.
const DOC_STAMPS_RATE = 0.125;
const VAT_RATE = 0.12;
const LGT_RATE = 0.002;

// Resolves a single vehicle's current (depreciated) value the same way the
// server does for a brand-new one: "now" is its assessment date, since it's
// being assessed for the first time right this moment.
function vehicleCurrentValue(vehicle) {
  if (!vehicle) return null;
  return currentVehicleValue(vehicle.estimated_value, vehicle.initial_assessment_date || new Date());
}

// coverage_end_at is never entered directly — it's always coverage_start_at
// plus whichever allowable period (in whole calendar days) the agent picked,
// computed the same way here as the server re-derives and enforces it.
function addDaysToLocalDateTime(value, days) {
  if (!value || !Number.isFinite(days)) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Resolves a selected coverage, branching on its pricing mode. This mirrors
// (non-authoritatively — the server always recomputes and enforces it
// independently) what the backend does in policyApplications.js, so the
// on-screen total and preview match what will actually be charged. Every
// pricing mode now works the same way from the agent's side: coverage_amount
// and what's owed to Bethel for it (payable_to_bethel) are resolved
// automatically —
//  - PERCENTAGE: the agent's own entered coverage_amount, priced at their net rate.
//  - VALUE_PERCENTAGE: fully automatic off each targeted vehicle's own
//    current (depreciated) value and this coverage's value tiers — each
//    vehicle can land on a different tier.
//  - FLAT_TIER: the agent chose one of this coverage's fixed tiers (stored as
//    coverage_amount on the selection); its paired price is the floor.
// premium_amount is always the agent's own asking price — one per-vehicle
// figure, applied uniformly to every targeted vehicle and summed, same as
// coverage_amount for PERCENTAGE/FLAT_TIER. It's never assumed equal to
// payable_to_bethel; agentEarnings (their profit) is the difference. A
// selection with no vehicle_indices applies to the whole policy — every
// vehicle on the application; one with a specific (possibly multi-vehicle)
// list applies to just those.
function resolveCoverageSelection(cov, selection, vehicles, addressValue) {
  if (!selection) return null;

  // Property has no vehicle concept at all — treat it as a single virtual
  // target so a coverage still resolves normally instead of looking like "no
  // vehicle selected."
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
  // The highest per-vehicle payable-to-bethel among the targeted vehicles —
  // PERCENTAGE and FLAT_TIER give every targeted vehicle the same floor, but
  // VALUE_PERCENTAGE can vary per vehicle (each can land on a different
  // tier). The server validates each vehicle's row independently, so the
  // single entered premium has to clear all of them, i.e. the highest one.
  let maxPayablePerVehicle = 0;

  for (const idx of targetIndices) {
    let coverageAmount;
    let payablePerVehicle;

    if (cov.pricing_mode === "VALUE_PERCENTAGE") {
      // Motor prices off the targeted vehicle's own (depreciated) value;
      // Property has no vehicles at all, so it prices off the risk
      // address's own estimated value instead.
      const targetValue = idx !== null ? vehicleCurrentValue(vehicles[idx]) : Number(addressValue) || null;
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
      Boolean(selection.premium_amount) &&
      Math.round(enteredPremium * 100) < Math.round(maxPayablePerVehicle * 100),
    exceedsMax:
      cov.pricing_mode === "PERCENTAGE" &&
      (Number(selection.coverage_amount) || 0) > Number(cov.effective_maximum_coverage),
    agentEarnings: enteredPremium * count - totalPayable,
    hasPremium: Boolean(selection.premium_amount),
    // A single "rate" only makes sense to show when every targeted vehicle
    // landed on the same tier — otherwise this is the blended (weighted
    // average) rate instead of picking one vehicle's tier arbitrarily.
    effectiveRate: totalCoverageAmount > 0 ? totalPayable / totalCoverageAmount : 0,
  };
}

function isCustomerComplete(c) {
  return Boolean(c.first_name && c.last_name && c.email);
}

function isCompanyComplete(c) {
  return Boolean(c.company_code && c.company_name && c.email);
}

function isVehicleComplete(v) {
  return Boolean(v.plate_number && v.mv_file_no && v.engine_number && v.chassis_number && v.no_of_seats);
}

function isAddressComplete(a) {
  return Boolean(a.address_line_1 && a.city && a.province);
}

// Display-only — this date is never entered directly, so there's no
// corresponding parse-back function.
function formatAssessmentDate(date) {
  if (!date) return "Not yet assessed";
  return new Date(date).toLocaleDateString();
}

function CustomerEditDialog({ open, onClose, customer, token, onSaved }) {
  const [form, setForm] = useState(emptyCustomer);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (customer) {
      setForm({
        first_name: customer.first_name,
        last_name: customer.last_name,
        middle_name: customer.middle_name || "",
        email: customer.email,
        mobile_number: customer.mobile_number || "",
        birthday: customer.birthday ? customer.birthday.slice(0, 10) : "",
        gender: customer.gender || "",
        existing_customer_id: customer.existing_customer_id,
      });
      setError("");
    }
  }, [customer]);

  async function handleSave() {
    setError("");
    setSubmitting(true);
    try {
      const updated = await updateCustomer(token, form.existing_customer_id, form);
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit Customer</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="First name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Last name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Middle name"
                value={form.middle_name}
                onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Mobile number"
                value={form.mobile_number}
                onChange={(e) => setForm({ ...form, mobile_number: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Birthday"
                type="date"
                value={form.birthday}
                onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            </Grid>
            <Grid size={12}>
              <TextField
                select
                label="Gender"
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                fullWidth
              >
                <MenuItem value="Male">Male</MenuItem>
                <MenuItem value="Female">Female</MenuItem>
              </TextField>
            </Grid>
          </Grid>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={submitting}>
          {submitting ? "Saving..." : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CompanyEditDialog({ open, onClose, company, token, onSaved }) {
  const [form, setForm] = useState(emptyCompany);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (company) {
      setForm({
        company_code: company.company_code,
        company_name: company.company_name,
        tin_no: company.tin_no || "",
        email: company.email,
        existing_company_id: company.existing_company_id,
      });
      setError("");
    }
  }, [company]);

  async function handleSave() {
    setError("");
    setSubmitting(true);
    try {
      const updated = await updateCompany(token, form.existing_company_id, form);
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit Company</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Company code"
                value={form.company_code}
                onChange={(e) => setForm({ ...form, company_code: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Company name"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="TIN"
                value={form.tin_no}
                onChange={(e) => setForm({ ...form, tin_no: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                fullWidth
              />
            </Grid>
          </Grid>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={submitting}>
          {submitting ? "Saving..." : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// localOnly skips the PATCH entirely and just hands the edited fields back —
// needed for a vehicle that's on file for a *different* party pending
// reassignment, since agentCanEditVehicle (rightly) 403s a direct edit until
// that reassignment actually happens at submission time. The edits still
// take effect the same way: they're carried in local state and persisted
// then, exactly like the rest of a reassign_owner vehicle's fields already are.
function VehicleEditDialog({ open, onClose, vehicle, token, onSaved, localOnly, variants }) {
  const [form, setForm] = useState(emptyVehicle);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (vehicle) {
      setForm({ ...vehicle });
      setError("");
    }
  }, [vehicle]);

  async function handleSave() {
    if (localOnly) {
      onSaved({ ...form, id: form.existing_vehicle_id });
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const updated = await updateVehicle(token, form.existing_vehicle_id, form);
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit Vehicle</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Plate number"
                value={form.plate_number}
                onChange={(e) => setForm({ ...form, plate_number: e.target.value })}
                required
                fullWidth
                // In localOnly mode (a vehicle pending reassignment), the
                // backend deliberately never writes plate_number back during
                // that reassignment — see the reassign_owner branches in
                // policyApplications.js/policyQuotations.js — so editing it
                // here would silently not persist. A real correction is a
                // separate action: reset this vehicle row entirely and, if
                // needed, correct the plate via a normal (non-reassignment)
                // Edit Vehicle after it's already on file.
                disabled={localOnly}
                helperText={localOnly ? "Fixed during reassignment — correct it separately afterward if it's wrong" : undefined}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="MV File No."
                value={form.mv_file_no}
                onChange={(e) => setForm({ ...form, mv_file_no: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Engine number"
                value={form.engine_number}
                onChange={(e) => setForm({ ...form, engine_number: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Chassis number"
                value={form.chassis_number}
                onChange={(e) => setForm({ ...form, chassis_number: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Product variant"
                value={form.product_variant_id || ""}
                onChange={(e) => setForm({ ...form, product_variant_id: e.target.value })}
                required
                fullWidth
                helperText="Changing this only applies going forward — an already-issued policy keeps reading whichever variant it was actually issued under."
              >
                {(variants || []).map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.variant_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Vehicle type"
                value={form.vehicle_type}
                onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Make"
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Model"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Year model"
                type="number"
                value={form.year_model}
                onChange={(e) => setForm({ ...form, year_model: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="No. of seats"
                type="number"
                value={form.no_of_seats}
                onChange={(e) => setForm({ ...form, no_of_seats: e.target.value })}
                required
                fullWidth
                helperText="Drives the policy schedule's driver/occupants endorsement line"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <NumberField
                label="Estimated value"
                value={form.estimated_value}
                onChange={(v) => setForm({ ...form, estimated_value: v })}
                fullWidth
                // Permanently locked the moment it's ever been assessed — from
                // then on the value only ever moves through automatic
                // depreciation, never a direct edit.
                disabled={Boolean(form.initial_assessment_date)}
                helperText={form.initial_assessment_date ? "Locked once assessed — depreciates 10% per year automatically" : ""}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Date of initial assessment of value"
                value={formatAssessmentDate(form.initial_assessment_date)}
                fullWidth
                disabled
              />
            </Grid>
          </Grid>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={submitting}>
          {submitting ? "Saving..." : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddressEditDialog({ open, onClose, address, token, onSaved, showEstimatedValue }) {
  const [form, setForm] = useState(emptyAddress);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (address) {
      setForm({ ...address });
      setError("");
    }
  }, [address]);

  async function handleSave() {
    setError("");
    setSubmitting(true);
    try {
      const updated = await updateAddress(token, form.existing_address_id, form);
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit Address</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField
                label="Address line 1"
                value={form.address_line_1}
                onChange={(e) => setForm({ ...form, address_line_1: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Address line 2"
                value={form.address_line_2}
                onChange={(e) => setForm({ ...form, address_line_2: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Barangay"
                value={form.barangay}
                onChange={(e) => setForm({ ...form, barangay: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="City"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Province"
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Postal code"
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                fullWidth
              />
            </Grid>
            {showEstimatedValue && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <NumberField
                  label="Estimated value"
                  value={form.estimated_value}
                  onChange={(v) => setForm({ ...form, estimated_value: v })}
                  fullWidth
                  helperText="Used to price VALUE_PERCENTAGE coverages for this property"
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                />
              </Grid>
            )}
          </Grid>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={submitting}>
          {submitting ? "Saving..." : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PlateConflictDialog({ conflict, onCancel, onConfirm }) {
  const owner = conflict?.vehicle.current_owner;
  return (
    <Dialog open={Boolean(conflict)} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>Plate Number Already On File</DialogTitle>
      <DialogContent>
        <Typography>
          Plate number <strong>{conflict?.vehicle.plate_number}</strong> has been detected in the system,
          currently on file for{" "}
          <strong>{owner ? owner.name : "no one — it isn't linked to a customer or company"}</strong>. Are you
          sure that the plate number and the owner are correct?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>No, let me check</Button>
        <Button variant="contained" onClick={onConfirm}>
          Yes, this is correct
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// onClose/onCreated are only passed when this is rendered inside the
// Quotation Tracker's "New Quotation" dialog — omitted, it behaves exactly
// as it does at the standalone /quotation-tracker/create route.
export function QuotationCreator({ onClose, onCreated } = {}) {
  const { token, agent, permissions } = useAuth();
  // Lets this quotation be filed under an agent other than the caller's own
  // — the party/vehicle/address lists below then come from that agent's own
  // connections (listCustomersByAgent/listCompaniesByAgent) instead of the
  // caller's (listMyCustomers/listMyCompanies), and the submit payload
  // carries agent_id so the backend files it there instead of defaulting to
  // the caller's own. 403s server-side without this permission regardless of
  // what the client sends, so hiding the picker without it is purely a UX
  // nicety, not the actual enforcement.
  const canFileForOtherAgent = permissions?.includes("QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const [catalog, setCatalog] = useState([]);
  const [myCustomers, setMyCustomers] = useState([]);
  const [myCompanies, setMyCompanies] = useState([]);
  const [agentsForPicker, setAgentsForPicker] = useState([]);
  // null until resolved to the caller's own agent (agent context loads
  // async) or explicitly changed via the picker below.
  const [filingAgentId, setFilingAgentId] = useState(null);

  const [insuredType, setInsuredType] = useState("INDIVIDUAL");
  const [newCustomer, setNewCustomer] = useState(emptyCustomer);
  const [newCompany, setNewCompany] = useState(emptyCompany);
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [editCompanyOpen, setEditCompanyOpen] = useState(false);
  const [editingVehicleIndex, setEditingVehicleIndex] = useState(null);
  // Which reused address is open in the edit dialog — "risk", "insured", or null.
  const [editingAddressField, setEditingAddressField] = useState(null);
  // { index, vehicle } for the plate-number-already-on-file confirmation dialog.
  const [plateConflict, setPlateConflict] = useState(null);
  // Which plate number was last checked per vehicle row, so blurring an
  // unchanged field doesn't keep re-triggering the lookup.
  const lastCheckedPlateRef = useRef({});

  const [classId, setClassId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [coverageSelections, setCoverageSelections] = useState({});
  const [coverageStartAt, setCoverageStartAt] = useState("");
  // Which allowable period (in days) the agent picked — coverage_end_at is
  // always derived from this plus coverageStartAt, never entered directly.
  const [coveragePeriodDays, setCoveragePeriodDays] = useState("");

  const [vehicles, setVehicles] = useState([emptyVehicle]);
  const [riskAddress, setRiskAddress] = useState(emptyAddress);
  const [insuredAddress, setInsuredAddress] = useState(emptyAddress);
  const [remarks, setRemarks] = useState("");
  const [sendPolicyToEmail, setSendPolicyToEmail] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewPdfError, setPreviewPdfError] = useState("");

  // agentIdOverride defaults to filingAgentId (state may not have committed
  // yet when called right after setFilingAgentId, e.g. from the picker's
  // onChange) — "own agent" (null/undefined, or equal to agent.id) uses the
  // caller-scoped routes, anything else uses the chosen agent's.
  function loadParties(agentIdOverride) {
    const targetAgentId = agentIdOverride !== undefined ? agentIdOverride : filingAgentId;
    const isOwnAgent = !targetAgentId || targetAgentId === agent?.id;
    return Promise.all([
      (isOwnAgent ? listMyCustomers(token) : listCustomersByAgent(token, targetAgentId)).then(setMyCustomers),
      (isOwnAgent ? listMyCompanies(token) : listCompaniesByAgent(token, targetAgentId)).then(setMyCompanies),
    ]);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([getProductCatalog(token).then(setCatalog), loadParties()])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // filingAgentId defaults to the caller's own agent once it's loaded (the
  // auth context resolves it asynchronously, so it isn't necessarily ready
  // on this component's own first render) — never overwrites a value the
  // picker below already set.
  useEffect(() => {
    if (agent?.id && filingAgentId === null) {
      setFilingAgentId(agent.id);
    }
  }, [agent, filingAgentId]);

  useEffect(() => {
    if (!canFileForOtherAgent) return;
    listAgentsForQuotation(token)
      .then(setAgentsForPicker)
      .catch(() => {});
  }, [canFileForOtherAgent, token]);

  // Switching the filing agent starts the party selection over — a
  // reused customer/company/vehicle/address only makes sense for the agent
  // it came from (the selectedPartyId effect below already resets
  // vehicles/addresses once the party changes, which clearing it here
  // triggers).
  function handleFilingAgentChange(newAgentId) {
    const resolved = newAgentId || agent?.id || null;
    setFilingAgentId(resolved);
    setInsuredType("INDIVIDUAL");
    setNewCustomer(emptyCustomer);
    setNewCompany(emptyCompany);
    loadParties(resolved).catch((err) => setError(err.message));
  }

  const selectedClass = catalog.find((c) => c.id === classId);
  const variants = selectedClass ? selectedClass.product_variants : [];
  const selectedVariant = variants.find((v) => v.id === variantId);
  const rawCoverages = selectedVariant ? selectedVariant.product_coverages : [];

  // Pricing (rate, tiers, effective max) lives per allowable period now, not
  // flat on the coverage — every coverage below is flattened onto whichever
  // period is currently chosen, so the rest of this component can keep
  // reading cov.rate/cov.value_percentage_tiers/etc. as if it were still
  // flat. A coverage that doesn't offer the chosen period is left as-is
  // (unresolved fields undefined) — harmless, since it can't be selected.
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
          // Whether this coverage actually has a rate/tier configured for
          // this specific period yet — an allowable period can exist before
          // anyone's set a price for it under Settings → Coverage Pricing.
          has_pricing: period.has_pricing,
        }
      : cov;
  });

  // Every distinct period (in days) any coverage on this product variant is
  // offered at — the agent picks exactly one, which both derives
  // coverage_end_at and narrows which coverages are selectable to just the
  // ones offered at that period.
  const availablePeriodDays = Array.from(
    new Set(coverages.flatMap((c) => (c.allowable_periods || []).map((p) => p.coverage_in_days)))
  ).sort((a, b) => a - b);

  function coverageAllowsPeriod(cov, days) {
    return Boolean(days) && (cov.allowable_periods || []).some((p) => p.coverage_in_days === days);
  }

  // False only once the coverage is actually flattened onto the chosen
  // period (has_pricing undefined beforehand, e.g. no period chosen yet) —
  // callers already gate on coverageAllowsPeriod first, so this only needs
  // to catch the "period exists but nobody's priced it yet" case.
  function coverageIsPriced(cov) {
    return cov.has_pricing !== false;
  }

  // coverage_end_at is never entered directly — it's always coverage_start_at
  // plus the chosen period, computed the same way the server re-derives it.
  const coverageEndAt = coverageStartAt && coveragePeriodDays
    ? addDaysToLocalDateTime(coverageStartAt, Number(coveragePeriodDays))
    : "";

  const isMotor = selectedClass?.class_name === "Motor";
  const isProperty = selectedClass?.class_name === "Property";

  // A vehicle carries its own fixed Motor product variant (see
  // Vehicle.product_variant_id) — every already-matched/reused vehicle on
  // this filing has to agree on one, so there's no separate "Product
  // Variant" step for Motor any more (see the Vehicles Paper below): the
  // variant is derived from whichever matched vehicle already has one, and
  // only left as a free pick (variantId, still the same state used for
  // Property) when nothing's been matched yet.
  const matchedVehicleVariantIds = isMotor
    ? Array.from(new Set(vehicles.filter((v) => v.existing_vehicle_id && v.product_variant_id).map((v) => v.product_variant_id)))
    : [];
  const hasVehicleVariantConflict = matchedVehicleVariantIds.length > 1;

  // Keeps variantId in lock-step with whichever variant a matched vehicle
  // already carries, so a brand-new vehicle row added afterward (which has
  // no product_variant_id of its own — see emptyVehicle) inherits the right
  // one at submit time without the agent ever picking it explicitly.
  useEffect(() => {
    if (!isMotor || hasVehicleVariantConflict) return;
    const derived = matchedVehicleVariantIds[0];
    if (derived && derived !== variantId) {
      setVariantId(derived);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMotor, matchedVehicleVariantIds.join(","), hasVehicleVariantConflict]);

  // resolveCoverageSelection needs the actual vehicle list to look up
  // specific vehicle_indices, or expand to every vehicle for a coverage that
  // applies to the whole policy — Property has no vehicles at all, so it
  // always resolves as a single virtual target instead.
  const coverageVehicles = isMotor ? vehicles : [];
  // Property's VALUE_PERCENTAGE stand-in for a vehicle's own value — see
  // resolveCoverageSelection.
  const riskAddressValue = isProperty ? Number(riskAddress.estimated_value) || null : null;

  // Total premium is the sum of every selected coverage's resolved premium —
  // the statutory charges below are derived from it, mirroring what the
  // server will compute and store once this application is actually submitted.
  const totalPremium = Object.entries(coverageSelections).reduce((sum, [coverageId, selection]) => {
    const cov = coverages.find((c) => c.id === coverageId);
    if (!cov) return sum;
    const resolved = resolveCoverageSelection(cov, selection, coverageVehicles, riskAddressValue);
    return sum + (resolved?.premium_amount || 0);
  }, 0);
  const docStamps = totalPremium * DOC_STAMPS_RATE;
  const vat = totalPremium * VAT_RATE;
  const lgt = totalPremium * LGT_RATE;
  // No longer agent-entered — a flat fee fixed per product variant (see
  // ProductVariant.misc_fee), the same figure the server itself charges.
  const miscAmount = Number(selectedVariant?.misc_fee) || 0;
  const totalAmount = totalPremium + docStamps + vat + lgt + miscAmount;

  const selectedPartyId =
    insuredType === "INDIVIDUAL" ? newCustomer.existing_customer_id : newCompany.existing_company_id;
  const selectedParty = selectedPartyId
    ? (insuredType === "INDIVIDUAL" ? myCustomers : myCompanies).find((p) => p.id === selectedPartyId)
    : null;

  // A reused vehicle/address only makes sense for the party it came from —
  // start fresh whenever the selected customer/company actually changes.
  useEffect(() => {
    setVehicles([{ ...emptyVehicle }]);
    lastCheckedPlateRef.current = {};
    setRiskAddress({ ...emptyAddress });
    setInsuredAddress({ ...emptyAddress });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartyId]);

  // The form is strictly linear: each step only appears once everything above
  // it is filled out, in this order — Insured Party, Insured Address,
  // Insurance Class, Vehicles/Risk Address (Motor's own Vehicles step now
  // also collects the Product Variant inline — see the Vehicles Paper below
  // — since a vehicle carries its own fixed one; Property still picks it as
  // its own separate step, right after Risk Address, since it has no
  // vehicles to derive one from), Coverage Period & Coverages, then Payment
  // & Delivery (and Charges after that). Every application needs an insured
  // address regardless of class, so it can be collected right after the
  // party, before the class is even chosen.
  const insuredPartyComplete =
    insuredType === "INDIVIDUAL" ? isCustomerComplete(newCustomer) : isCompanyComplete(newCompany);

  const insuredAddressComplete = isAddressComplete(insuredAddress);

  const insuranceClassComplete = Boolean(classId);

  const vehicleOrRiskAddressRequired = isMotor || isProperty;
  const vehicleOrRiskAddressComplete = !vehicleOrRiskAddressRequired
    ? true
    : isMotor
      ? vehicles.some(isVehicleComplete) && !hasVehicleVariantConflict
      : isAddressComplete(riskAddress);

  const productVariantComplete = Boolean(variantId);

  const coverageComplete = Boolean(
    coverageStartAt && coverageEndAt && Object.keys(coverageSelections).length > 0
  );

  const showInsuredAddress = insuredPartyComplete;
  const showInsuranceClass = showInsuredAddress && insuredAddressComplete;
  const showVehicleOrRiskAddress = showInsuranceClass && insuranceClassComplete;
  // Property only, now — Motor's own variant is picked inline inside the
  // Vehicles Paper (see productVariantComplete's own use below), so there's
  // nothing left to gate as a separate step for that class.
  const showProductVariant = showVehicleOrRiskAddress && vehicleOrRiskAddressComplete && isProperty;
  const showCoverage = isProperty
    ? showProductVariant && productVariantComplete
    : showVehicleOrRiskAddress && vehicleOrRiskAddressComplete && productVariantComplete;
  const showPaymentDelivery = showCoverage && coverageComplete;

  function handleClassChange(id) {
    setClassId(id);
    setVariantId("");
    setCoverageSelections({});
    setCoveragePeriodDays("");
  }

  function handleVariantChange(id) {
    setVariantId(id);
    setCoverageSelections({});
    setCoveragePeriodDays("");
  }

  // Exactly one period can be chosen at a time — checking a different one
  // both replaces it and drops any already-selected coverage that isn't
  // actually offered at the new period, since the whole application shares a
  // single coverage_start_at/coverage_end_at pair.
  function togglePeriod(days) {
    const next = coveragePeriodDays === days ? "" : days;
    setCoveragePeriodDays(next);
    setCoverageSelections((prev) => {
      if (!next) return {};
      const filtered = {};
      for (const [coverageId, sel] of Object.entries(prev)) {
        const cov = coverages.find((c) => c.id === coverageId);
        if (cov && coverageAllowsPeriod(cov, next)) {
          filtered[coverageId] = sel;
        }
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
        // Nothing to price it with yet (no rate/tiers configured under
        // Settings → Coverage Pricing for this period) — never let it be
        // selected in the first place rather than letting the agent fill
        // out the whole form and find out only when the server rejects it.
        return prev;
      } else {
        // vehicle_indices null = applies to the whole policy (every vehicle),
        // the default — an agent narrows it to specific vehicles only for a
        // fleet where this coverage shouldn't apply to all of them.
        next[coverageId] = { coverage_amount: "", premium_amount: "", vehicle_indices: null };
      }
      return next;
    });
  }

  function updateCoverageField(coverageId, field, value) {
    setCoverageSelections((prev) => ({
      ...prev,
      [coverageId]: { ...prev[coverageId], [field]: value },
    }));
  }

  function updateVehicleField(index, field, value) {
    setVehicles((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  }

  function addVehicle() {
    setVehicles((prev) => [...prev, { ...emptyVehicle }]);
  }

  function removeVehicle(index) {
    setVehicles((prev) => prev.filter((_, i) => i !== index));
    delete lastCheckedPlateRef.current[index];
    // Any coverage scoped to specific vehicles is referencing positions in
    // that array — removing one shifts everything after it down by one, so
    // those references need the same treatment or they'd silently point at
    // the wrong (or a nonexistent) vehicle.
    setCoverageSelections((prev) => {
      const next = {};
      for (const [coverageId, selection] of Object.entries(prev)) {
        if (!Array.isArray(selection.vehicle_indices)) {
          next[coverageId] = selection;
          continue;
        }
        const vehicle_indices = selection.vehicle_indices
          .filter((i) => i !== index)
          .map((i) => (i > index ? i - 1 : i));
        next[coverageId] = { ...selection, vehicle_indices };
      }
      return next;
    });
  }

  // Fires once a plate number is typed out (on blur) and isn't already
  // matched to one of this party's own vehicles — checks whether it's on
  // file for someone else so it can be reassigned instead of duplicated.
  async function handlePlateBlur(index) {
    const v = vehicles[index];
    if (!v.plate_number || v.existing_vehicle_id) return;
    if (lastCheckedPlateRef.current[index] === v.plate_number) return;
    lastCheckedPlateRef.current[index] = v.plate_number;

    const found = await lookupVehicleByPlate(token, v.plate_number).catch(() => null);
    if (!found) return;

    const expectedOwnerType = insuredType === "INDIVIDUAL" ? "CUSTOMER" : "COMPANY";
    const isSameParty =
      found.current_owner?.type === expectedOwnerType && found.current_owner?.id === selectedPartyId;

    if (isSameParty) {
      // Already this party's own vehicle but somehow missing from their list
      // (e.g. it was just reassigned to them elsewhere) — reuse it normally.
      setVehicles((prev) =>
        prev.map((vv, i) =>
          i === index
            ? {
                plate_number: found.plate_number,
                mv_file_no: found.mv_file_no,
                engine_number: found.engine_number,
                chassis_number: found.chassis_number,
                product_variant_id: found.product_variant_id || "",
                make: found.make || "",
                model: found.model || "",
                year_model: found.year_model || "",
                vehicle_type: found.vehicle_type || "",
                color: found.color || "",
                no_of_seats: found.no_of_seats ?? "",
                estimated_value: found.estimated_value ?? "",
                initial_assessment_date: found.initial_assessment_date || null,
                existing_vehicle_id: found.id,
                reassign_owner: false,
              }
            : vv
        )
      );
      return;
    }

    setPlateConflict({ index, vehicle: found });
  }

  function handleConfirmPlateMatch() {
    const { index, vehicle } = plateConflict;
    setVehicles((prev) =>
      prev.map((v, i) =>
        i === index
          ? {
              plate_number: vehicle.plate_number,
              mv_file_no: vehicle.mv_file_no,
              engine_number: vehicle.engine_number,
              chassis_number: vehicle.chassis_number,
              product_variant_id: vehicle.product_variant_id || "",
              make: vehicle.make || "",
              model: vehicle.model || "",
              year_model: vehicle.year_model || "",
              vehicle_type: vehicle.vehicle_type || "",
              color: vehicle.color || "",
              no_of_seats: vehicle.no_of_seats ?? "",
              estimated_value: vehicle.estimated_value ?? "",
              initial_assessment_date: vehicle.initial_assessment_date || null,
              existing_vehicle_id: vehicle.id,
              reassign_owner: true,
            }
          : v
      )
    );
    setPlateConflict(null);
  }

  function resetVehicleRow(index) {
    setVehicles((prev) => prev.map((v, i) => (i === index ? { ...emptyVehicle } : v)));
    delete lastCheckedPlateRef.current[index];
  }

  function handlePreview(e) {
    e.preventDefault();
    setError("");
    setSuccess(null);

    const coverageEntries = Object.entries(coverageSelections);
    if (coverageEntries.length === 0) {
      setError("Select at least one coverage.");
      return;
    }
    if (!coverageStartAt) {
      setError("Set the insured from date.");
      return;
    }
    if (!coveragePeriodDays) {
      setError("Select a coverage period.");
      return;
    }
    if (!coverageEndAt) {
      setError("The insured from date is invalid.");
      return;
    }
    if (vehicleOrRiskAddressRequired && !vehicleOrRiskAddressComplete) {
      setError(
        isMotor
          ? hasVehicleVariantConflict
            ? "Every vehicle must be insured under the same product variant — fix the mismatched vehicle(s) first."
            : "Add at least one complete vehicle."
          : "Fill out the risk address."
      );
      return;
    }
    if (!insuredAddressComplete) {
      setError("Fill out the insured address.");
      return;
    }
    for (const [coverageId, selection] of coverageEntries) {
      const cov = coverages.find((c) => c.id === coverageId);
      if (Array.isArray(selection.vehicle_indices) && selection.vehicle_indices.length === 0) {
        setError(`Select which vehicle(s) ${cov.coverage_name} applies to, or apply it to the whole policy.`);
        return;
      }
      const resolved = resolveCoverageSelection(cov, selection, coverageVehicles, riskAddressValue);
      if (resolved.pending) {
        setError(
          cov.pricing_mode === "VALUE_PERCENTAGE"
            ? resolved.noTier
              ? `No pricing tier is configured for ${cov.coverage_name} at this ${isProperty ? "address's" : "vehicle's"} current value.`
              : isProperty
                ? `${cov.coverage_name} needs the risk address's estimated value entered before it can be priced.`
                : `${cov.coverage_name} needs its vehicle's estimated value assessed before it can be priced.`
            : cov.pricing_mode === "FLAT_TIER"
              ? `Select an insured value for ${cov.coverage_name}.`
              : `Fill out the coverage amount for ${cov.coverage_name}.`
        );
        return;
      }
      if (resolved.exceedsMax) {
        setError(`Coverage amount for ${cov.coverage_name} exceeds the maximum for this coverage.`);
        return;
      }
      if (!resolved.hasPremium) {
        setError(`Enter your premium amount for ${cov.coverage_name}.`);
        return;
      }
      if (resolved.belowMinimum) {
        setError(`Premium amount for ${cov.coverage_name} is below the amount payable to Bethel.`);
        return;
      }
    }

    setConfirmChecked(false);
    setPreviewOpen(true);
  }

  async function handleConfirmSubmit() {
    setError("");
    const coverageEntries = Object.entries(coverageSelections);

    setSubmitting(true);
    try {
      let customerId;
      let companyId;

      if (insuredType === "INDIVIDUAL") {
        if (newCustomer.existing_customer_id) {
          customerId = newCustomer.existing_customer_id;
        } else {
          const created = await createCustomer(token, newCustomer);
          customerId = created.id;
        }
      } else {
        if (newCompany.existing_company_id) {
          companyId = newCompany.existing_company_id;
        } else {
          const created = await createCompany(token, newCompany);
          companyId = created.id;
        }
      }

      const payload = {
        // insured_type isn't sent — the server derives it from whichever of
        // customer_id/company_id is actually present.
        customer_id: customerId,
        company_id: companyId,
        product_variant_id: variantId,
        coverage_start_at: coverageStartAt,
        coverage_end_at: coverageEndAt,
        // Raw, per-vehicle, un-multiplied values — the server validates
        // coverage_amount against the per-vehicle max and premium_amount
        // against what's payable to Bethel, then expands each into one row
        // per targeted vehicle itself (and for VALUE_PERCENTAGE ignores
        // coverage_amount entirely, computing its own from each target
        // vehicle's value). coverage_amount for FLAT_TIER/VEHICLE_SEATS_BASED
        // is the tier key the agent picked (an insured value, or an insured
        // amount per occupant respectively), also unmultiplied, so the
        // server can look it up among the coverage's actual tiers.
        coverages: coverageEntries.map(([coverage_id, v]) => {
          const cov = coverages.find((c) => c.id === coverage_id);
          return {
            coverage_id,
            // VALUE_PERCENTAGE never collects a coverage_amount from the agent
            // (the server computes its own from the vehicle/address value) —
            // coverage_amount is only required by the schema to reject an
            // unfilled-in PERCENTAGE/FLAT_TIER/VEHICLE_SEATS_BASED selection,
            // so send a harmless positive placeholder here instead of the
            // unset 0.
            coverage_amount: cov?.pricing_mode === "VALUE_PERCENTAGE" ? 1 : Number(v.coverage_amount) || 0,
            premium_amount: Number(v.premium_amount) || 0,
            vehicle_indices: v.vehicle_indices ?? null,
          };
        }),
        // A brand-new vehicle row carries no product_variant_id of its own
        // (see emptyVehicle) — it inherits the filing's own variantId here;
        // a matched/reused row already has one (see handlePlateBlur/
        // handleConfirmPlateMatch/the plate Autocomplete's onChange), always
        // the same value by now (see hasVehicleVariantConflict, which blocks
        // submission otherwise).
        vehicles: isMotor ? vehicles.map((v) => ({ ...v, product_variant_id: v.product_variant_id || variantId })) : undefined,
        risk_address: isProperty ? riskAddress : undefined,
        insured_address: insuredAddress,
        remarks: remarks || undefined,
        send_policy_to_email: sendPolicyToEmail,
        // Omitted (undefined) files under the caller's own agent, same as
        // before this field existed — only sent when the picker above
        // actually chose someone else's.
        agent_id: canFileForOtherAgent && filingAgentId && filingAgentId !== agent?.id ? filingAgentId : undefined,
      };

      const quotation = await createPolicyQuotation(token, payload);
      setSuccess(quotation);
      onCreated?.(quotation);

      // Reset for the next application, but keep the just-used party available
      // (locked, as if it were an existing match) in case another one follows.
      if (insuredType === "INDIVIDUAL") {
        setNewCustomer((prev) => ({ ...prev, existing_customer_id: customerId }));
        setNewCompany(emptyCompany);
      } else {
        setNewCompany((prev) => ({ ...prev, existing_company_id: companyId }));
        setNewCustomer(emptyCustomer);
      }
      setVariantId("");
      setCoverageSelections({});
      setCoverageStartAt("");
      setCoveragePeriodDays("");
      setVehicles([emptyVehicle]);
      lastCheckedPlateRef.current = {};
      setRiskAddress(emptyAddress);
      setInsuredAddress(emptyAddress);
      setRemarks("");
      setMisc("");
      setSendPolicyToEmail(true);
      setPreviewOpen(false);
      setConfirmChecked(false);
      await loadParties();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const header = (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Quotation Creator
      </Typography>
      {onClose && (
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      )}
    </Box>
  );

  // Shared between the on-screen preview (inside the dialog) and the hidden
  // print-only copy — kept as plain data so the two never drift apart.
  const previewProps = {
    applicationNumber: "TO BE ASSIGNED ON SUBMISSION",
    isPreview: true,
    isQuotation: true,
    classNameLabel: selectedClass?.class_name,
    variantName: selectedVariant?.variant_name,
    insuredName:
      insuredType === "INDIVIDUAL"
        ? `${newCustomer.last_name}, ${newCustomer.first_name}${newCustomer.middle_name ? " " + newCustomer.middle_name : ""}`
        : newCompany.company_name,
    insuredAddress: [insuredAddress.address_line_1, insuredAddress.barangay, insuredAddress.city, insuredAddress.province]
      .filter(Boolean)
      .join(", "),
    agentCode: agent?.agent_code,
    coverageStartAt,
    coverageEndAt,
    vehicles: isMotor ? vehicles : [],
    coverages: Object.entries(coverageSelections).map(([id, sel]) => {
      const cov = coverages.find((c) => c.id === id);
      const resolved = cov ? resolveCoverageSelection(cov, sel, coverageVehicles, riskAddressValue) : null;
      // Only worth spelling out which vehicle(s) a coverage applies to when
      // there's more than one on the application — otherwise it's implicit.
      const scopedToAll = sel.vehicle_indices === null || sel.vehicle_indices === undefined;
      const vehicleLabel =
        coverageVehicles.length > 1
          ? scopedToAll
            ? " (all vehicles)"
            : ` (${sel.vehicle_indices
                .map((i) => coverageVehicles[i]?.plate_number || `Vehicle ${i + 1}`)
                .join(", ")})`
          : "";
      return {
        name: (cov?.coverage_name || "") + vehicleLabel,
        clause: cov?.clause || "",
        amount: resolved?.coverage_amount || 0,
        premium: resolved?.premium_amount || 0,
        pricing_mode: cov?.pricing_mode,
      };
    }),
    deductibleRate: selectedVariant?.deductible_rate,
    totalPremium,
    docStamps,
    vat,
    lgt,
    misc: miscAmount,
    totalAmount,
    remarks,
  };

  // Fetches the actual PDFKit-rendered document the moment the preview
  // dialog opens, so the dialog shows the real exported file (not a
  // separate HTML mockup) and "Print / Save as PDF" just reuses it — no
  // second request. previewProps is deliberately not a dependency here:
  // while the dialog is open the form behind it is inert, so it can't
  // change anyway, and re-running this on every keystroke before it opens
  // would just be wasted requests.
  useEffect(() => {
    if (!previewOpen) return;
    let cancelled = false;
    let objectUrl = null;
    setPreviewPdfLoading(true);
    setPreviewPdfError("");
    previewQuotationPdf(token, previewProps)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewPdfUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setPreviewPdfError(err.message);
      })
      .finally(() => {
        if (!cancelled) setPreviewPdfLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPreviewPdfUrl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen]);

  // Every hook above must run on every render regardless of loading state —
  // this early return has to come after all of them, or the hook count
  // changes between the loading and loaded renders and React throws
  // ("Rendered more hooks than during the previous render").
  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: onClose ? 0 : { xs: 3, sm: 6 } }}>
      {header}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Quotation {success.quotation_number} created.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handlePreview}>
        <Stack spacing={3}>
          {/* Filing agent — ADMIN_CREATE_QUOTATION only */}
          {canFileForOtherAgent && (
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Filing Agent
              </Typography>
              <Autocomplete
                options={agentsForPicker}
                getOptionLabel={(o) => (o.agent_name ? `${o.agent_name} (${o.agent_code})` : "")}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                value={agentsForPicker.find((a) => a.id === filingAgentId) || null}
                onChange={(e, value) => handleFilingAgentChange(value?.id || null)}
                renderInput={(params) => <TextField {...params} label="File this quotation under" fullWidth />}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                Defaults to your own agent profile — pick a different one to file this quotation for another agent.
              </Typography>
            </Paper>
          )}

          {/* Insured party */}
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Insured Party
            </Typography>

            <ToggleButtonGroup
              value={insuredType}
              exclusive
              onChange={(e, v) => {
                if (v) {
                  setInsuredType(v);
                }
              }}
              sx={{ mb: 2 }}
              fullWidth
            >
              <ToggleButton value="INDIVIDUAL">Individual</ToggleButton>
              <ToggleButton value="CORPORATE">Company</ToggleButton>
            </ToggleButtonGroup>

            {insuredType === "INDIVIDUAL" && newCustomer.existing_customer_id && (
              <Alert
                severity="info"
                sx={{ mb: 2 }}
                icon={<EditIcon fontSize="inherit" />}
                action={
                  <Button color="inherit" size="small" variant="outlined" onClick={() => setEditCustomerOpen(true)}>
                    Edit Details
                  </Button>
                }
              >
                You're filing this application for an existing customer.
              </Alert>
            )}
            {insuredType === "CORPORATE" && newCompany.existing_company_id && (
              <Alert
                severity="info"
                sx={{ mb: 2 }}
                icon={<EditIcon fontSize="inherit" />}
                action={
                  <Button color="inherit" size="small" variant="outlined" onClick={() => setEditCompanyOpen(true)}>
                    Edit Details
                  </Button>
                }
              >
                You're filing this application for an existing company.
              </Alert>
            )}

            {insuredType === "INDIVIDUAL" ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Autocomplete
                    freeSolo
                    disableClearable
                    options={myCustomers}
                    value={myCustomers.find((c) => c.id === newCustomer.existing_customer_id) || null}
                    getOptionLabel={(option) => (typeof option === "string" ? option : option.first_name)}
                    filterOptions={(options, state) =>
                      state.inputValue
                        ? options.filter((o) =>
                            o.first_name.toLowerCase().includes(state.inputValue.toLowerCase())
                          )
                        : []
                    }
                    inputValue={newCustomer.first_name}
                    onInputChange={(e, value, reason) => {
                      if (reason === "input") {
                        // Editing away from a matched customer clears every field that came
                        // from their record, not just the id — otherwise a stale last name,
                        // email, etc. could get submitted for whoever they search for next.
                        setNewCustomer((prev) =>
                          prev.existing_customer_id ? { ...emptyCustomer, first_name: value } : { ...prev, first_name: value }
                        );
                      }
                    }}
                    onChange={(e, value) => {
                      if (value && typeof value === "object") {
                        // Already one of this agent's connected customers — load their details instead of duplicating.
                        setNewCustomer({
                          first_name: value.first_name,
                          last_name: value.last_name,
                          middle_name: value.middle_name || "",
                          email: value.email,
                          mobile_number: value.mobile_number || "",
                          birthday: value.birthday ? value.birthday.slice(0, 10) : "",
                          gender: value.gender || "",
                          existing_customer_id: value.id,
                        });
                      }
                    }}
                    renderOption={(props, option) => (
                      <li {...props} key={option.id}>
                        <Box>
                          <Box>
                            {option.first_name} {option.last_name}
                          </Box>
                          <Box component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
                            {option.email}
                            {option.mobile_number ? ` · ${option.mobile_number}` : ""}
                          </Box>
                        </Box>
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="First name"
                        required
                        fullWidth
                        helperText="Matches one of your existing customers? Select it to load their details."
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Last name"
                    value={newCustomer.last_name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })}
                    required
                    fullWidth
                    disabled={Boolean(newCustomer.existing_customer_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Middle name"
                    value={newCustomer.middle_name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, middle_name: e.target.value })}
                    fullWidth
                    disabled={Boolean(newCustomer.existing_customer_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Email"
                    type="email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    required
                    fullWidth
                    disabled={Boolean(newCustomer.existing_customer_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Mobile number"
                    value={newCustomer.mobile_number}
                    onChange={(e) => setNewCustomer({ ...newCustomer, mobile_number: e.target.value })}
                    fullWidth
                    disabled={Boolean(newCustomer.existing_customer_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Birthday"
                    type="date"
                    value={newCustomer.birthday}
                    onChange={(e) => setNewCustomer({ ...newCustomer, birthday: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                    fullWidth
                    disabled={Boolean(newCustomer.existing_customer_id)}
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    select
                    label="Gender"
                    value={newCustomer.gender}
                    onChange={(e) => setNewCustomer({ ...newCustomer, gender: e.target.value })}
                    fullWidth
                    disabled={Boolean(newCustomer.existing_customer_id)}
                  >
                    <MenuItem value="Male">Male</MenuItem>
                    <MenuItem value="Female">Female</MenuItem>
                  </TextField>
                </Grid>
              </Grid>
            ) : (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Company code"
                    value={newCompany.company_code}
                    onChange={(e) => setNewCompany({ ...newCompany, company_code: e.target.value })}
                    required
                    fullWidth
                    disabled={Boolean(newCompany.existing_company_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Autocomplete
                    freeSolo
                    disableClearable
                    options={myCompanies}
                    value={myCompanies.find((c) => c.id === newCompany.existing_company_id) || null}
                    getOptionLabel={(option) => (typeof option === "string" ? option : option.company_name)}
                    filterOptions={(options, state) =>
                      state.inputValue
                        ? options.filter((o) =>
                            o.company_name.toLowerCase().includes(state.inputValue.toLowerCase())
                          )
                        : []
                    }
                    inputValue={newCompany.company_name}
                    onInputChange={(e, value, reason) => {
                      if (reason === "input") {
                        // Same reasoning as the customer field — clear the whole record, not
                        // just the id, so stale details from the old match can't slip through.
                        setNewCompany((prev) =>
                          prev.existing_company_id ? { ...emptyCompany, company_name: value } : { ...prev, company_name: value }
                        );
                      }
                    }}
                    onChange={(e, value) => {
                      if (value && typeof value === "object") {
                        // Already one of this agent's connected companies — load its details instead of duplicating.
                        setNewCompany({
                          company_code: value.company_code,
                          company_name: value.company_name,
                          tin_no: value.tin_no || "",
                          email: value.email,
                          existing_company_id: value.id,
                        });
                      }
                    }}
                    renderOption={(props, option) => (
                      <li {...props} key={option.id}>
                        <Box>
                          <Box>{option.company_name}</Box>
                          <Box component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
                            {option.company_code} · {option.email}
                          </Box>
                        </Box>
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Company name"
                        required
                        fullWidth
                        helperText="Matches one of your existing companies? Select it to load its details."
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="TIN"
                    value={newCompany.tin_no}
                    onChange={(e) => setNewCompany({ ...newCompany, tin_no: e.target.value })}
                    fullWidth
                    disabled={Boolean(newCompany.existing_company_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Email"
                    type="email"
                    value={newCompany.email}
                    onChange={(e) => setNewCompany({ ...newCompany, email: e.target.value })}
                    required
                    fullWidth
                    disabled={Boolean(newCompany.existing_company_id)}
                  />
                </Grid>
              </Grid>
            )}
          </Paper>

          {/* Insured Address — the address the policy will actually be named
              on, for both Motor and Property, collected right after the
              party since every application needs one regardless of class.
              Hidden until the Insured Party step above it is complete. */}
          {showInsuredAddress && (
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Insured Address
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                The address the policy will be named on.
              </Typography>
              {insuredAddress.existing_address_id && (
                <Alert
                  severity="info"
                  sx={{ mb: 1.5 }}
                  icon={<EditIcon fontSize="inherit" />}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      variant="outlined"
                      onClick={() => setEditingAddressField("insured")}
                    >
                      Edit Details
                    </Button>
                  }
                >
                  Using an address already on file for this {insuredType === "INDIVIDUAL" ? "customer" : "company"}.
                </Alert>
              )}
              <Grid container spacing={2}>
                <Grid size={12}>
                  <Autocomplete
                    freeSolo
                    disableClearable
                    options={selectedParty?.addresses || []}
                    value={
                      insuredAddress.existing_address_id
                        ? (selectedParty?.addresses || []).find((o) => o.id === insuredAddress.existing_address_id) ||
                          null
                        : null
                    }
                    getOptionLabel={(option) =>
                      typeof option === "string" ? option : option.address_line_1
                    }
                    filterOptions={(options, state) =>
                      state.inputValue
                        ? options.filter((o) =>
                            o.address_line_1.toLowerCase().includes(state.inputValue.toLowerCase())
                          )
                        : []
                    }
                    inputValue={insuredAddress.address_line_1}
                    onInputChange={(e, value, reason) => {
                      if (reason === "input") {
                        // Same reasoning as the risk address field.
                        setInsuredAddress((prev) =>
                          prev.existing_address_id
                            ? { ...emptyAddress, address_line_1: value }
                            : { ...prev, address_line_1: value }
                        );
                      }
                    }}
                    onChange={(e, value) => {
                      if (value && typeof value === "object") {
                        setInsuredAddress({
                          address_line_1: value.address_line_1,
                          address_line_2: value.address_line_2 || "",
                          barangay: value.barangay || "",
                          city: value.city || "",
                          province: value.province || "",
                          postal_code: value.postal_code || "",
                          country: value.country || "Philippines",
                          existing_address_id: value.id,
                        });
                      }
                    }}
                    renderOption={(props, option) => (
                      <li {...props} key={option.id}>
                        {option.address_line_1}, {option.city}
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Address line 1"
                        required
                        fullWidth
                        helperText={
                          selectedParty
                            ? "Already on file for this party? Select it to reuse instead of duplicating."
                            : undefined
                        }
                      />
                    )}
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    label="Address line 2"
                    value={insuredAddress.address_line_2}
                    onChange={(e) => setInsuredAddress({ ...insuredAddress, address_line_2: e.target.value })}
                    fullWidth
                    disabled={Boolean(insuredAddress.existing_address_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Barangay"
                    value={insuredAddress.barangay}
                    onChange={(e) => setInsuredAddress({ ...insuredAddress, barangay: e.target.value })}
                    fullWidth
                    disabled={Boolean(insuredAddress.existing_address_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="City"
                    value={insuredAddress.city}
                    onChange={(e) => setInsuredAddress({ ...insuredAddress, city: e.target.value })}
                    required
                    fullWidth
                    disabled={Boolean(insuredAddress.existing_address_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Province"
                    value={insuredAddress.province}
                    onChange={(e) => setInsuredAddress({ ...insuredAddress, province: e.target.value })}
                    required
                    fullWidth
                    disabled={Boolean(insuredAddress.existing_address_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Postal code"
                    value={insuredAddress.postal_code}
                    onChange={(e) => setInsuredAddress({ ...insuredAddress, postal_code: e.target.value })}
                    fullWidth
                    disabled={Boolean(insuredAddress.existing_address_id)}
                  />
                </Grid>
              </Grid>
            </Paper>
          )}

          {/* Insurance Class — hidden until the Insured Address step is complete */}
          {showInsuranceClass && (
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Insurance Class
            </Typography>
            <TextField
              select
              label="Insurance class"
              value={classId}
              onChange={(e) => handleClassChange(e.target.value)}
              required
              fullWidth
            >
              {catalog.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.class_name}
                </MenuItem>
              ))}
            </TextField>
          </Paper>
          )}

          {/* Vehicle(s) — Motor only, supports a fleet. Hidden until an
              Insurance Class is selected. */}
          {showVehicleOrRiskAddress && isMotor && (
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Vehicle{vehicles.length > 1 ? "s" : ""}
                </Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={addVehicle}>
                  Add vehicle
                </Button>
              </Box>

              {/* A vehicle carries its own fixed Motor product variant (see
                  Vehicle.product_variant_id) — no separate "Product Variant"
                  step for Motor any more. Locked/derived once any vehicle
                  below is matched to one already on file; otherwise a free
                  pick, applied to every new vehicle added afterward. */}
              {hasVehicleVariantConflict ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  These vehicles are insured under different product variants — every vehicle on one quotation must
                  share the same one. Remove or replace one of the mismatched vehicles below.
                </Alert>
              ) : (
                <TextField
                  select
                  label="Product variant"
                  value={variantId}
                  onChange={(e) => handleVariantChange(e.target.value)}
                  required
                  fullWidth
                  disabled={matchedVehicleVariantIds.length > 0}
                  helperText={
                    matchedVehicleVariantIds.length > 0
                      ? "Taken from the vehicle already on file below — edit that vehicle to change it."
                      : "Applies to every vehicle added on this quotation."
                  }
                  sx={{ mb: 2 }}
                >
                  {variants.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.variant_name}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              <Stack spacing={2} divider={<Divider />}>
                {vehicles.map((v, index) => (
                  <Box key={index}>
                    {vehicles.length > 1 && (
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          Vehicle {index + 1}
                        </Typography>
                        <IconButton size="small" onClick={() => removeVehicle(index)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    )}
                    {v.existing_vehicle_id && !v.reassign_owner && (
                      <Alert
                        severity="info"
                        sx={{ mb: 1.5 }}
                        icon={<EditIcon fontSize="inherit" />}
                        action={
                          <Stack direction="row" spacing={1}>
                            <Button
                              color="inherit"
                              size="small"
                              variant="outlined"
                              onClick={() => setEditingVehicleIndex(index)}
                            >
                              Edit Details
                            </Button>
                            <Button
                              color="inherit"
                              size="small"
                              variant="outlined"
                              onClick={() => resetVehicleRow(index)}
                            >
                              Use a different vehicle
                            </Button>
                          </Stack>
                        }
                      >
                        You're using a vehicle already on file for this {insuredType === "INDIVIDUAL" ? "customer" : "company"}.
                      </Alert>
                    )}
                    {v.reassign_owner && (
                      <Alert
                        severity="info"
                        sx={{ mb: 1.5 }}
                        icon={<EditIcon fontSize="inherit" />}
                        action={
                          <Stack direction="row" spacing={1}>
                            <Button
                              color="inherit"
                              size="small"
                              variant="outlined"
                              onClick={() => setEditingVehicleIndex(index)}
                            >
                              Edit Details
                            </Button>
                            <Button
                              color="inherit"
                              size="small"
                              variant="outlined"
                              onClick={() => resetVehicleRow(index)}
                            >
                              Use a different vehicle
                            </Button>
                          </Stack>
                        }
                      >
                        This plate number is currently on file for a different{" "}
                        {insuredType === "INDIVIDUAL" ? "customer" : "company"}. It will be assigned to this{" "}
                        {insuredType === "INDIVIDUAL" ? "customer" : "company"} once this policy is approved.
                      </Alert>
                    )}
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Autocomplete
                          freeSolo
                          disableClearable
                          // A matched vehicle's plate number is fixed — see
                          // the identical rule in the reassign_owner backend
                          // branches (policyApplications.js/policyQuotations.js).
                          // A genuine correction only ever happens through
                          // "Edit Details" (PATCH /vehicles/:id), which
                          // re-checks uniqueness; backing out of the match
                          // entirely uses "Use a different vehicle" below.
                          disabled={Boolean(v.existing_vehicle_id)}
                          options={selectedParty?.vehicles || []}
                          value={
                            v.existing_vehicle_id
                              ? (selectedParty?.vehicles || []).find((o) => o.id === v.existing_vehicle_id) || null
                              : null
                          }
                          getOptionLabel={(option) =>
                            typeof option === "string" ? option : option.plate_number
                          }
                          filterOptions={(options, state) =>
                            state.inputValue
                              ? options.filter((o) =>
                                  o.plate_number.toLowerCase().includes(state.inputValue.toLowerCase())
                                )
                              : []
                          }
                          inputValue={v.plate_number}
                          onInputChange={(e, value, reason) => {
                            if (reason === "input") {
                              // Any edit invalidates the "already checked this plate" cache —
                              // otherwise typing it away and back to the same value (e.g.
                              // NCV5516 -> NCV551 -> NCV5516) would silently skip the re-check.
                              delete lastCheckedPlateRef.current[index];
                              // Editing away from a matched vehicle clears every field that
                              // came from it (and any pending reassignment), not just the id —
                              // otherwise another vehicle's details could get carried over by mistake.
                              setVehicles((prev) =>
                                prev.map((vv, i) =>
                                  i === index
                                    ? vv.existing_vehicle_id
                                      ? { ...emptyVehicle, plate_number: value }
                                      : { ...vv, plate_number: value }
                                    : vv
                                )
                              );
                            }
                          }}
                          onChange={(e, value) => {
                            if (value && typeof value === "object") {
                              setVehicles((prev) =>
                                prev.map((vv, i) =>
                                  i === index
                                    ? {
                                        plate_number: value.plate_number,
                                        mv_file_no: value.mv_file_no,
                                        engine_number: value.engine_number,
                                        chassis_number: value.chassis_number,
                                        product_variant_id: value.product_variant_id || "",
                                        make: value.make || "",
                                        model: value.model || "",
                                        year_model: value.year_model || "",
                                        vehicle_type: value.vehicle_type || "",
                                        color: value.color || "",
                                        no_of_seats: value.no_of_seats ?? "",
                                        estimated_value: value.estimated_value ?? "",
                                        initial_assessment_date: value.initial_assessment_date || null,
                                        existing_vehicle_id: value.id,
                                        reassign_owner: false,
                                      }
                                    : vv
                                )
                              );
                              lastCheckedPlateRef.current[index] = value.plate_number;
                            }
                          }}
                          onBlur={() => handlePlateBlur(index)}
                          renderOption={(props, option) => (
                            <li {...props} key={option.id}>
                              {option.plate_number}
                            </li>
                          )}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              label="Plate number"
                              required
                              fullWidth
                              helperText={
                                selectedParty
                                  ? "Already on file for this party? Select it to reuse instead of duplicating."
                                  : undefined
                              }
                            />
                          )}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="MV File No."
                          value={v.mv_file_no}
                          onChange={(e) => updateVehicleField(index, "mv_file_no", e.target.value)}
                          required
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id)}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Engine number"
                          value={v.engine_number}
                          onChange={(e) => updateVehicleField(index, "engine_number", e.target.value)}
                          required
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id)}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Chassis number"
                          value={v.chassis_number}
                          onChange={(e) => updateVehicleField(index, "chassis_number", e.target.value)}
                          required
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id)}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Vehicle type"
                          value={v.vehicle_type}
                          onChange={(e) => updateVehicleField(index, "vehicle_type", e.target.value)}
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id)}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Make"
                          value={v.make}
                          onChange={(e) => updateVehicleField(index, "make", e.target.value)}
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id)}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Model"
                          value={v.model}
                          onChange={(e) => updateVehicleField(index, "model", e.target.value)}
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id)}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Year model"
                          type="number"
                          value={v.year_model}
                          onChange={(e) => updateVehicleField(index, "year_model", e.target.value)}
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id)}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Color"
                          value={v.color}
                          onChange={(e) => updateVehicleField(index, "color", e.target.value)}
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id)}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="No. of seats"
                          type="number"
                          value={v.no_of_seats}
                          onChange={(e) => updateVehicleField(index, "no_of_seats", e.target.value)}
                          required
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id)}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <NumberField
                          label="Estimated value"
                          value={v.estimated_value}
                          onChange={(value) => updateVehicleField(index, "estimated_value", value)}
                          fullWidth
                          // Permanently locked the moment it's ever been assessed — from
                          // then on the value only ever moves through automatic
                          // depreciation, never a direct edit.
                          disabled={Boolean(v.initial_assessment_date)}
                          helperText={v.initial_assessment_date ? "Locked once assessed — depreciates 10% per year automatically" : ""}
                          slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Date of initial assessment of value"
                          value={formatAssessmentDate(v.initial_assessment_date)}
                          fullWidth
                          disabled
                        />
                      </Grid>
                    </Grid>
                  </Box>
                ))}
              </Stack>
            </Paper>
          )}

          {/* Risk Address — Property only, the property actually being insured.
              Hidden until an Insurance Class is selected. */}
          {showVehicleOrRiskAddress && isProperty && (
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Risk Address
              </Typography>
              {riskAddress.existing_address_id && (
                <Alert
                  severity="info"
                  sx={{ mb: 1.5 }}
                  icon={<EditIcon fontSize="inherit" />}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      variant="outlined"
                      onClick={() => setEditingAddressField("risk")}
                    >
                      Edit Details
                    </Button>
                  }
                >
                  Using an address already on file for this {insuredType === "INDIVIDUAL" ? "customer" : "company"}.
                </Alert>
              )}
              <Grid container spacing={2}>
                <Grid size={12}>
                  <Autocomplete
                    freeSolo
                    disableClearable
                    options={selectedParty?.addresses || []}
                    value={
                      riskAddress.existing_address_id
                        ? (selectedParty?.addresses || []).find((o) => o.id === riskAddress.existing_address_id) ||
                          null
                        : null
                    }
                    getOptionLabel={(option) =>
                      typeof option === "string" ? option : option.address_line_1
                    }
                    filterOptions={(options, state) =>
                      state.inputValue
                        ? options.filter((o) =>
                            o.address_line_1.toLowerCase().includes(state.inputValue.toLowerCase())
                          )
                        : []
                    }
                    inputValue={riskAddress.address_line_1}
                    onInputChange={(e, value, reason) => {
                      if (reason === "input") {
                        // Editing away from a matched address clears every field that came
                        // from it, not just the id — otherwise a stale city/province could
                        // get submitted alongside whatever address they search for next.
                        setRiskAddress((prev) =>
                          prev.existing_address_id
                            ? { ...emptyAddress, address_line_1: value }
                            : { ...prev, address_line_1: value }
                        );
                      }
                    }}
                    onChange={(e, value) => {
                      if (value && typeof value === "object") {
                        setRiskAddress({
                          address_line_1: value.address_line_1,
                          address_line_2: value.address_line_2 || "",
                          barangay: value.barangay || "",
                          city: value.city || "",
                          province: value.province || "",
                          postal_code: value.postal_code || "",
                          country: value.country || "Philippines",
                          estimated_value: value.estimated_value ?? "",
                          existing_address_id: value.id,
                        });
                      }
                    }}
                    renderOption={(props, option) => (
                      <li {...props} key={option.id}>
                        {option.address_line_1}, {option.city}
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Address line 1"
                        required
                        fullWidth
                        helperText={
                          selectedParty
                            ? "Already on file for this party? Select it to reuse instead of duplicating."
                            : undefined
                        }
                      />
                    )}
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    label="Address line 2"
                    value={riskAddress.address_line_2}
                    onChange={(e) => setRiskAddress({ ...riskAddress, address_line_2: e.target.value })}
                    fullWidth
                    disabled={Boolean(riskAddress.existing_address_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Barangay"
                    value={riskAddress.barangay}
                    onChange={(e) => setRiskAddress({ ...riskAddress, barangay: e.target.value })}
                    fullWidth
                    disabled={Boolean(riskAddress.existing_address_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="City"
                    value={riskAddress.city}
                    onChange={(e) => setRiskAddress({ ...riskAddress, city: e.target.value })}
                    required
                    fullWidth
                    disabled={Boolean(riskAddress.existing_address_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Province"
                    value={riskAddress.province}
                    onChange={(e) => setRiskAddress({ ...riskAddress, province: e.target.value })}
                    required
                    fullWidth
                    disabled={Boolean(riskAddress.existing_address_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Postal code"
                    value={riskAddress.postal_code}
                    onChange={(e) => setRiskAddress({ ...riskAddress, postal_code: e.target.value })}
                    fullWidth
                    disabled={Boolean(riskAddress.existing_address_id)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <NumberField
                    label="Estimated value"
                    value={riskAddress.estimated_value}
                    onChange={(value) => setRiskAddress({ ...riskAddress, estimated_value: value })}
                    fullWidth
                    // Already on file? The value has to be entered/updated via
                    // "Edit Details" like the rest of a reused address's fields.
                    disabled={Boolean(riskAddress.existing_address_id)}
                    helperText={
                      riskAddress.existing_address_id
                        ? "Already on file — use Edit Details to change it"
                        : "Used to price VALUE_PERCENTAGE coverages for this property"
                    }
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                  />
                </Grid>
              </Grid>
            </Paper>
          )}

          {/* Product Variant — hidden until the Vehicle/Risk Address step is complete */}
          {showProductVariant && (
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Product Variant
            </Typography>
            <TextField
              select
              label="Product variant"
              value={variantId}
              onChange={(e) => handleVariantChange(e.target.value)}
              required
              fullWidth
            >
              {variants.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.variant_name}
                </MenuItem>
              ))}
            </TextField>
          </Paper>
          )}

          {/* Coverage Period & Coverages — hidden until a Product Variant is
              selected. Coverages are picked only after the vehicles are
              already known, so value-based pricing (which needs each
              vehicle's value) is already resolved by the time the agent
              enters their own wanted premium. */}
          {showCoverage && (
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Coverage Period &amp; Coverages
            </Typography>
            <Stack spacing={2}>
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
                    helperText="Computed from the insured from date and the selected coverage period"
                  />
                </Grid>
              </Grid>

              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Coverage period
                </Typography>
                {availablePeriodDays.length === 0 ? (
                  <Alert severity="warning">No coverage period is configured for this product variant.</Alert>
                ) : (
                  <FormGroup row>
                    {availablePeriodDays.map((days) => (
                      <FormControlLabel
                        key={days}
                        control={<Checkbox checked={coveragePeriodDays === days} onChange={() => togglePeriod(days)} />}
                        label={formatPeriodLabel(days)}
                      />
                    ))}
                  </FormGroup>
                )}
              </Box>

              {coverages.length > 0 && (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {coveragePeriodDays
                      ? "Select coverages, then enter the premium you want to charge for each:"
                      : "Select a coverage period above to see which coverages are available."}
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
                          {selection && isMotor && vehicles.length > 1 && (
                            <Box sx={{ pl: 4, pb: 1 }}>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    size="small"
                                    checked={
                                      selection.vehicle_indices === null || selection.vehicle_indices === undefined
                                    }
                                    onChange={(e) =>
                                      updateCoverageField(cov.id, "vehicle_indices", e.target.checked ? null : [])
                                    }
                                  />
                                }
                                label="Applies to the whole policy (every vehicle)"
                              />
                              {selection.vehicle_indices !== null && selection.vehicle_indices !== undefined && (
                                <Box sx={{ pl: 3 }}>
                                  <Typography variant="caption" color="text.secondary" component="div">
                                    Or choose specific vehicles:
                                  </Typography>
                                  <FormGroup row>
                                    {vehicles.map((v, i) => (
                                      <FormControlLabel
                                        key={i}
                                        control={
                                          <Checkbox
                                            size="small"
                                            checked={selection.vehicle_indices.includes(i)}
                                            onChange={(e) => {
                                              const current = selection.vehicle_indices;
                                              const next = e.target.checked
                                                ? [...current, i]
                                                : current.filter((x) => x !== i);
                                              updateCoverageField(cov.id, "vehicle_indices", next);
                                            }}
                                          />
                                        }
                                        label={v.plate_number ? `Vehicle ${i + 1} (${v.plate_number})` : `Vehicle ${i + 1}`}
                                      />
                                    ))}
                                  </FormGroup>
                                </Box>
                              )}
                            </Box>
                          )}
                          {selection && (
                            <Box sx={{ pl: 4, pb: 1 }}>
                              {cov.pricing_mode === "PERCENTAGE" && (
                                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                                  Your net rate: <strong>{formatRate(cov.rate)}</strong>
                                  {cov.is_custom_rate ? " (your rate)" : " (standard rate)"}
                                </Typography>
                              )}
                              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                                {cov.clause}
                              </Typography>

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

                              {cov.pricing_mode === "VALUE_PERCENTAGE" && resolved.pending && (
                                <Alert severity="info" sx={{ mb: 1 }}>
                                  {resolved.noTier
                                    ? "No pricing tier is set up yet for this coverage — contact Settings."
                                    : "Priced automatically once the vehicle's estimated value is assessed."}
                                </Alert>
                              )}

                              {!resolved.pending && (
                                <>
                                  <Grid container spacing={2}>
                                    <Grid size={6}>
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
                                    </Grid>
                                  </Grid>
                                  <Alert severity="success" sx={{ mt: 1 }}>
                                    <Stack spacing={0.25}>
                                      {cov.pricing_mode === "VALUE_PERCENTAGE" && (
                                        <>
                                          <span>
                                            Insured value: <strong>{formatPHP(resolved.coverage_amount)}</strong>
                                          </span>
                                          <span>
                                            Rate: <strong>{formatRate(resolved.effectiveRate)}</strong>
                                          </span>
                                        </>
                                      )}
                                      {cov.pricing_mode === "VEHICLE_SEATS_BASED" && (
                                        <span>
                                          Insured amount: <strong>{formatPHP(resolved.coverage_amount)}</strong>{" "}
                                          (seat threshold {cov.seats_threshold})
                                        </span>
                                      )}
                                      <span>
                                        Payable to Bethel: <strong>{formatPHP(resolved.payable_to_bethel)}</strong>
                                      </span>
                                      {resolved.hasPremium && !resolved.belowMinimum && (
                                        <span>
                                          Your Profit: <strong>{formatPHP(resolved.agentEarnings)}</strong>
                                        </span>
                                      )}
                                    </Stack>
                                  </Alert>
                                </>
                              )}
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              )}
            </Stack>
          </Paper>
          )}

          {showPaymentDelivery && (
          <>
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <TextField
              label="Remarks (optional)"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Paper>

          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Delivery
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={sendPolicyToEmail}
                  onChange={(e) => setSendPolicyToEmail(e.target.checked)}
                />
              }
              label="Send this quotation to the customer's email"
            />
          </Paper>

          {totalPremium > 0 && (
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Charges
              </Typography>
              <Stack spacing={1.5}>
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
              </Stack>
            </Paper>
          )}

          <Button type="submit" variant="contained" size="large">
            Save Quotation
          </Button>
          </>
          )}
        </Stack>
      </Box>

      <CustomerEditDialog
        open={editCustomerOpen}
        onClose={() => setEditCustomerOpen(false)}
        customer={newCustomer}
        token={token}
        onSaved={(updated) => {
          setNewCustomer({
            first_name: updated.first_name,
            last_name: updated.last_name,
            middle_name: updated.middle_name || "",
            email: updated.email,
            mobile_number: updated.mobile_number || "",
            birthday: updated.birthday ? updated.birthday.slice(0, 10) : "",
            gender: updated.gender || "",
            existing_customer_id: updated.id,
          });
          setEditCustomerOpen(false);
          loadParties();
        }}
      />

      <CompanyEditDialog
        open={editCompanyOpen}
        onClose={() => setEditCompanyOpen(false)}
        company={newCompany}
        token={token}
        onSaved={(updated) => {
          setNewCompany({
            company_code: updated.company_code,
            company_name: updated.company_name,
            tin_no: updated.tin_no || "",
            email: updated.email,
            existing_company_id: updated.id,
          });
          setEditCompanyOpen(false);
          loadParties();
        }}
      />

      <VehicleEditDialog
        open={editingVehicleIndex !== null}
        onClose={() => setEditingVehicleIndex(null)}
        vehicle={editingVehicleIndex !== null ? vehicles[editingVehicleIndex] : null}
        localOnly={Boolean(editingVehicleIndex !== null && vehicles[editingVehicleIndex]?.reassign_owner)}
        token={token}
        variants={variants}
        onSaved={(updated) => {
          setVehicles((prev) =>
            prev.map((v, i) =>
              i === editingVehicleIndex
                ? {
                    ...v,
                    plate_number: updated.plate_number,
                    mv_file_no: updated.mv_file_no,
                    engine_number: updated.engine_number,
                    chassis_number: updated.chassis_number,
                    product_variant_id: updated.product_variant_id || "",
                    make: updated.make || "",
                    model: updated.model || "",
                    year_model: updated.year_model || "",
                    vehicle_type: updated.vehicle_type || "",
                    color: updated.color || "",
                    no_of_seats: updated.no_of_seats ?? "",
                    estimated_value: updated.estimated_value ?? "",
                    initial_assessment_date: updated.initial_assessment_date || null,
                    existing_vehicle_id: updated.id,
                    // reassign_owner intentionally left as-is (via the ...v
                    // spread above) — editing details doesn't change whether
                    // this vehicle is being reassigned to this party.
                  }
                : v
            )
          );
          setEditingVehicleIndex(null);
          loadParties();
        }}
      />

      <PlateConflictDialog
        conflict={plateConflict}
        onCancel={() => {
          // Declining clears the typed plate (and the "already checked" cache
          // via resetVehicleRow) so the agent starts fresh instead of staring
          // at a plate number that's now silently not going anywhere.
          if (plateConflict) {
            resetVehicleRow(plateConflict.index);
          }
          setPlateConflict(null);
        }}
        onConfirm={handleConfirmPlateMatch}
      />

      <AddressEditDialog
        open={editingAddressField !== null}
        onClose={() => setEditingAddressField(null)}
        address={editingAddressField === "risk" ? riskAddress : editingAddressField === "insured" ? insuredAddress : null}
        token={token}
        showEstimatedValue={editingAddressField === "risk"}
        onSaved={(updated) => {
          const updatedFields = {
            address_line_1: updated.address_line_1,
            address_line_2: updated.address_line_2 || "",
            barangay: updated.barangay || "",
            city: updated.city,
            province: updated.province,
            postal_code: updated.postal_code || "",
            country: updated.country || "Philippines",
            estimated_value: updated.estimated_value ?? "",
            existing_address_id: updated.id,
          };
          if (editingAddressField === "risk") {
            setRiskAddress(updatedFields);
          } else if (editingAddressField === "insured") {
            setInsuredAddress(updatedFields);
          }
          setEditingAddressField(null);
          loadParties();
        }}
      />

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Quotation Preview</DialogTitle>
        <DialogContent>
          <Box sx={{ my: 1 }}>
            <PdfViewer url={previewPdfUrl} loading={previewPdfLoading} error={previewPdfError} />
          </Box>

          <FormControlLabel
            sx={{ display: "flex", bgcolor: "background.paper", borderRadius: 2, p: 1.5, mb: 1 }}
            control={
              <Checkbox checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
            }
            label="I have double-checked the information above and confirm it is correct."
          />

          {error && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)} disabled={submitting}>
            Back to edit
          </Button>
          <Button variant="outlined" onClick={() => window.open(previewPdfUrl, "_blank")} disabled={!previewPdfUrl}>
            Print / Save as PDF
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmSubmit}
            disabled={!confirmChecked || submitting}
          >
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
