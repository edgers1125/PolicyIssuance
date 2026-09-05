import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { useAuth } from "../context/AuthContext";
import {
  getProductCatalog,
  listMyCustomers,
  createCustomer,
  updateCustomer,
  listMyCompanies,
  createCompany,
  updateCompany,
  updateVehicle,
  lookupVehicleByPlate,
  updateAddress,
  createPolicyApplication,
  listPaymentMethods,
} from "../api/client";
import { formatPHP, formatRate } from "../utils/currency";
import { NumberField } from "../components/NumberField";
import { PolicySchedulePreview } from "../components/PolicySchedulePreview";

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
  make: "",
  model: "",
  year_model: "",
  vehicle_type: "",
  color: "",
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
};

// Standard Philippine non-life insurance statutory rates, applied to total premium —
// mirrors the same constants the backend uses when actually submitting.
const DOC_STAMPS_RATE = 0.125;
const VAT_RATE = 0.12;
const LGT_RATE = 0.002;

// A coverage's premium can never come in under the agent's own net rate for it —
// that rate is what's owed to the branch; anything above it is the agent's cut.
function coveragePricing(cov, selection) {
  const coverageAmount = Number(selection.coverage_amount) || 0;
  const premiumAmount = Number(selection.premium_amount) || 0;
  const minimumPremium = coverageAmount * Number(cov.rate);

  return {
    minimumPremium,
    agentEarnings: premiumAmount - minimumPremium,
    // What the customer is actually being charged, not the agent's floor rate.
    customerRate: coverageAmount > 0 ? premiumAmount / coverageAmount : 0,
    exceedsMax: coverageAmount > Number(cov.effective_maximum_coverage),
    belowMinimum: Boolean(selection.premium_amount) && premiumAmount < minimumPremium,
    hasAmounts: Boolean(selection.coverage_amount) && Boolean(selection.premium_amount),
  };
}

function isCustomerComplete(c) {
  return Boolean(c.first_name && c.last_name && c.email);
}

function isCompanyComplete(c) {
  return Boolean(c.company_code && c.company_name && c.email);
}

function isVehicleComplete(v) {
  return Boolean(v.plate_number && v.mv_file_no && v.engine_number && v.chassis_number);
}

function isAddressComplete(a) {
  return Boolean(a.address_line_1 && a.city && a.province);
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

function VehicleEditDialog({ open, onClose, vehicle, token, onSaved }) {
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

function AddressEditDialog({ open, onClose, address, token, onSaved }) {
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

export function PolicyApplication() {
  const { token, permissions, agent } = useAuth();
  const canIssue = permissions?.includes("AGENT_ISSUANCE");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const [catalog, setCatalog] = useState([]);
  const [myCustomers, setMyCustomers] = useState([]);
  const [myCompanies, setMyCompanies] = useState([]);

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
  const [coverageEndAt, setCoverageEndAt] = useState("");

  const [vehicles, setVehicles] = useState([emptyVehicle]);
  const [riskAddress, setRiskAddress] = useState(emptyAddress);
  const [insuredAddress, setInsuredAddress] = useState(emptyAddress);
  const [remarks, setRemarks] = useState("");
  const [misc, setMisc] = useState("");
  const [sendPolicyToEmail, setSendPolicyToEmail] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentRemittance, setPaymentRemittance] = useState("");
  const [bethelPaymentMethodId, setBethelPaymentMethodId] = useState("");
  const [bethelPaymentMethods, setBethelPaymentMethods] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  function loadParties() {
    return Promise.all([listMyCustomers(token).then(setMyCustomers), listMyCompanies(token).then(setMyCompanies)]);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([getProductCatalog(token).then(setCatalog), loadParties(), listPaymentMethods(token).then(setBethelPaymentMethods)])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const selectedClass = catalog.find((c) => c.id === classId);
  const variants = selectedClass ? selectedClass.product_variants : [];
  const selectedVariant = variants.find((v) => v.id === variantId);
  const coverages = selectedVariant ? selectedVariant.product_coverages : [];

  const isMotor = selectedClass?.class_name === "Motor";
  const isProperty = selectedClass?.class_name === "Property";

  // Total premium is just the sum of every selected coverage's premium — the
  // statutory charges below are derived from it, mirroring what the server
  // will compute and store once this application is actually submitted.
  const totalPremium = Object.values(coverageSelections).reduce(
    (sum, s) => sum + (Number(s.premium_amount) || 0),
    0
  );
  const docStamps = totalPremium * DOC_STAMPS_RATE;
  const vat = totalPremium * VAT_RATE;
  const lgt = totalPremium * LGT_RATE;
  const miscAmount = Number(misc) || 0;
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
  // it is filled out, in this order — Insured Party, Product & Coverage,
  // Vehicle/Risk Address, Insured Address, then Payment & Delivery.
  const insuredPartyComplete =
    insuredType === "INDIVIDUAL" ? isCustomerComplete(newCustomer) : isCompanyComplete(newCompany);

  const productCoverageComplete = Boolean(
    classId && variantId && coverageStartAt && coverageEndAt && Object.keys(coverageSelections).length > 0
  );

  const vehicleOrRiskAddressRequired = isMotor || isProperty;
  const vehicleOrRiskAddressComplete = !vehicleOrRiskAddressRequired
    ? true
    : isMotor
      ? vehicles.some(isVehicleComplete)
      : isAddressComplete(riskAddress);

  const insuredAddressRequired = isMotor || isProperty;
  const insuredAddressComplete = !insuredAddressRequired ? true : isAddressComplete(insuredAddress);

  const showProductCoverage = insuredPartyComplete;
  const showVehicleOrRiskAddress = showProductCoverage && productCoverageComplete;
  const showInsuredAddress = showVehicleOrRiskAddress && vehicleOrRiskAddressComplete;
  const showPaymentDelivery = showInsuredAddress && insuredAddressComplete;

  function handleClassChange(id) {
    setClassId(id);
    setVariantId("");
    setCoverageSelections({});
  }

  function handleVariantChange(id) {
    setVariantId(id);
    setCoverageSelections({});
  }

  function toggleCoverage(coverageId) {
    setCoverageSelections((prev) => {
      const next = { ...prev };
      if (next[coverageId]) {
        delete next[coverageId];
      } else {
        next[coverageId] = { coverage_amount: "", premium_amount: "" };
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
                make: found.make || "",
                model: found.model || "",
                year_model: found.year_model || "",
                vehicle_type: found.vehicle_type || "",
                color: found.color || "",
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
              make: vehicle.make || "",
              model: vehicle.model || "",
              year_model: vehicle.year_model || "",
              vehicle_type: vehicle.vehicle_type || "",
              color: vehicle.color || "",
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
    if (!coverageStartAt || !coverageEndAt) {
      setError("Set the insured from and to dates.");
      return;
    }
    if (new Date(coverageEndAt) <= new Date(coverageStartAt)) {
      setError("Insured to date must be after the insured from date.");
      return;
    }
    if (vehicleOrRiskAddressRequired && !vehicleOrRiskAddressComplete) {
      setError(isMotor ? "Add at least one complete vehicle." : "Fill out the risk address.");
      return;
    }
    if (insuredAddressRequired && !insuredAddressComplete) {
      setError("Fill out the insured address.");
      return;
    }
    if (!paymentMethod) {
      setError("Select a payment method.");
      return;
    }
    if (!paymentRemittance) {
      setError("Select whether payment goes directly to Bethel or through the agent.");
      return;
    }
    if (paymentRemittance === "DIRECT_TO_BETHEL" && !bethelPaymentMethodId) {
      setError("Select which Bethel payment method the customer will use.");
      return;
    }
    for (const [coverageId, selection] of coverageEntries) {
      const cov = coverages.find((c) => c.id === coverageId);
      const pricing = coveragePricing(cov, selection);
      if (pricing.exceedsMax) {
        setError(`Coverage amount for ${cov.coverage_name} exceeds the maximum for this coverage.`);
        return;
      }
      if (pricing.belowMinimum) {
        setError(`Premium amount for ${cov.coverage_name} is below your net rate minimum.`);
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
        insured_type: insuredType,
        customer_id: customerId,
        company_id: companyId,
        product_variant_id: variantId,
        coverage_start_at: coverageStartAt,
        coverage_end_at: coverageEndAt,
        coverages: coverageEntries.map(([coverage_id, v]) => ({
          coverage_id,
          coverage_amount: Number(v.coverage_amount),
          premium_amount: Number(v.premium_amount),
        })),
        vehicles: isMotor ? vehicles : undefined,
        risk_address: isProperty ? riskAddress : undefined,
        insured_address: isProperty || isMotor ? insuredAddress : undefined,
        remarks: remarks || undefined,
        misc: miscAmount,
        send_policy_to_email: sendPolicyToEmail,
        payment_method: paymentMethod,
        payment_remittance: paymentRemittance,
        bethel_payment_method_id: paymentRemittance === "DIRECT_TO_BETHEL" ? bethelPaymentMethodId : undefined,
      };

      const application = await createPolicyApplication(token, payload);
      setSuccess(application);

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
      setCoverageEndAt("");
      setVehicles([emptyVehicle]);
      lastCheckedPlateRef.current = {};
      setRiskAddress(emptyAddress);
      setInsuredAddress(emptyAddress);
      setRemarks("");
      setMisc("");
      setSendPolicyToEmail(false);
      setPaymentMethod("");
      setPaymentRemittance("");
      setBethelPaymentMethodId("");
      setPreviewOpen(false);
      setConfirmChecked(false);
      await loadParties();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  // Shared between the on-screen preview (inside the dialog) and the hidden
  // print-only copy — kept as plain data so the two never drift apart.
  const previewProps = {
    applicationNumber: "TO BE ASSIGNED ON SUBMISSION",
    isPreview: true,
    classNameLabel: selectedClass?.class_name,
    variantName: selectedVariant?.variant_name,
    insuredName:
      insuredType === "INDIVIDUAL"
        ? `${newCustomer.last_name}, ${newCustomer.first_name}${newCustomer.middle_name ? " " + newCustomer.middle_name : ""}`
        : newCompany.company_name,
    insuredAddress:
      isProperty || isMotor
        ? [insuredAddress.address_line_1, insuredAddress.barangay, insuredAddress.city, insuredAddress.province]
            .filter(Boolean)
            .join(", ")
        : "",
    agentCode: agent?.agent_code,
    coverageStartAt,
    coverageEndAt,
    vehicles: isMotor ? vehicles : [],
    coverages: Object.entries(coverageSelections).map(([id, sel]) => {
      const cov = coverages.find((c) => c.id === id);
      return {
        name: cov?.coverage_name || "",
        clause: cov?.clause || "",
        amount: Number(sel.coverage_amount) || 0,
        premium: Number(sel.premium_amount) || 0,
      };
    }),
    totalPremium,
    docStamps,
    vat,
    lgt,
    misc: miscAmount,
    totalAmount,
    remarks,
  };

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 700 }}>
        Policy Application
      </Typography>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Application {success.application_number} submitted.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handlePreview}>
        <Stack spacing={3}>
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
                        setNewCustomer({ ...newCustomer, first_name: value, existing_customer_id: null });
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
                        setNewCompany({ ...newCompany, company_name: value, existing_company_id: null });
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

          {/* Product & coverage — hidden until the Insured Party step is complete */}
          {showProductCoverage && (
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Product &amp; Coverage
            </Typography>
            <Stack spacing={2}>
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

              <TextField
                select
                label="Product variant"
                value={variantId}
                onChange={(e) => handleVariantChange(e.target.value)}
                required
                fullWidth
                disabled={!classId}
              >
                {variants.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.variant_name}
                  </MenuItem>
                ))}
              </TextField>

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
                    onChange={(e) => setCoverageEndAt(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                    required
                    fullWidth
                  />
                </Grid>
              </Grid>

              {coverages.length > 0 && (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Select coverages and enter amounts:
                  </Typography>
                  <Stack spacing={1.5} divider={<Divider />}>
                    {coverages.map((cov) => {
                      const selection = coverageSelections[cov.id];
                      const pricing = selection ? coveragePricing(cov, selection) : null;
                      return (
                        <Box key={cov.id}>
                          <FormControlLabel
                            control={<Checkbox checked={Boolean(selection)} onChange={() => toggleCoverage(cov.id)} />}
                            label={`${cov.coverage_name} (max ${formatPHP(cov.effective_maximum_coverage)})`}
                          />
                          {selection && (
                            <Box sx={{ pl: 4, pb: 1 }}>
                              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                                Your net rate: <strong>{formatRate(cov.rate)}</strong>
                                {cov.is_custom_rate ? " (your rate)" : " (standard rate)"}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                                {cov.clause}
                              </Typography>
                              <Grid container spacing={2}>
                                <Grid size={6}>
                                  <NumberField
                                    label="Coverage amount"
                                    value={selection.coverage_amount}
                                    onChange={(v) => updateCoverageField(cov.id, "coverage_amount", v)}
                                    required
                                    fullWidth
                                    size="small"
                                    error={pricing.exceedsMax}
                                    helperText={pricing.exceedsMax ? "Exceeds the maximum for this coverage" : ""}
                                    slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                                  />
                                </Grid>
                                <Grid size={6}>
                                  <NumberField
                                    label="Premium amount"
                                    value={selection.premium_amount}
                                    onChange={(v) => updateCoverageField(cov.id, "premium_amount", v)}
                                    required
                                    fullWidth
                                    size="small"
                                    error={pricing.belowMinimum}
                                    helperText={
                                      pricing.belowMinimum
                                        ? `Below your net rate minimum of ${formatPHP(pricing.minimumPremium)}`
                                        : ""
                                    }
                                    slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                                  />
                                </Grid>
                              </Grid>
                              {pricing.hasAmounts && !pricing.belowMinimum && !pricing.exceedsMax && (
                                <Alert severity="success" sx={{ mt: 1 }}>
                                  <Stack spacing={0.25}>
                                    <span>
                                      Payable to Bethel: <strong>{formatPHP(pricing.minimumPremium)}</strong>
                                    </span>
                                    <span>
                                      Your Profit: <strong>{formatPHP(pricing.agentEarnings)}</strong>
                                    </span>
                                    <span>
                                      Customer Net Rate: <strong>{formatRate(pricing.customerRate)}</strong>
                                    </span>
                                  </Stack>
                                </Alert>
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

          {/* Vehicle(s) — Motor only, supports a fleet. Hidden until Product &
              Coverage is complete (at least one coverage selected). */}
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
                          <Button
                            color="inherit"
                            size="small"
                            variant="outlined"
                            onClick={() => setEditingVehicleIndex(index)}
                          >
                            Edit Details
                          </Button>
                        }
                      >
                        You're using a vehicle already on file for this {insuredType === "INDIVIDUAL" ? "customer" : "company"}.
                      </Alert>
                    )}
                    {v.reassign_owner && (
                      <Alert
                        severity="warning"
                        sx={{ mb: 1.5 }}
                        action={
                          <Button
                            color="inherit"
                            size="small"
                            variant="outlined"
                            onClick={() => resetVehicleRow(index)}
                          >
                            Use a different vehicle
                          </Button>
                        }
                      >
                        This plate number is currently on file for a different{" "}
                        {insuredType === "INDIVIDUAL" ? "customer" : "company"}. It will be reassigned to this{" "}
                        {insuredType === "INDIVIDUAL" ? "customer" : "company"} once this application is submitted —
                        you can still edit its details below.
                      </Alert>
                    )}
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Autocomplete
                          freeSolo
                          disableClearable
                          options={selectedParty?.vehicles || []}
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
                              setVehicles((prev) =>
                                prev.map((vv, i) =>
                                  i === index ? { ...vv, plate_number: value, existing_vehicle_id: null } : vv
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
                                        make: value.make || "",
                                        model: value.model || "",
                                        year_model: value.year_model || "",
                                        vehicle_type: value.vehicle_type || "",
                                        color: value.color || "",
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
                          disabled={Boolean(v.existing_vehicle_id) && !v.reassign_owner}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Engine number"
                          value={v.engine_number}
                          onChange={(e) => updateVehicleField(index, "engine_number", e.target.value)}
                          required
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id) && !v.reassign_owner}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Chassis number"
                          value={v.chassis_number}
                          onChange={(e) => updateVehicleField(index, "chassis_number", e.target.value)}
                          required
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id) && !v.reassign_owner}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Vehicle type"
                          value={v.vehicle_type}
                          onChange={(e) => updateVehicleField(index, "vehicle_type", e.target.value)}
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id) && !v.reassign_owner}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Make"
                          value={v.make}
                          onChange={(e) => updateVehicleField(index, "make", e.target.value)}
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id) && !v.reassign_owner}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Model"
                          value={v.model}
                          onChange={(e) => updateVehicleField(index, "model", e.target.value)}
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id) && !v.reassign_owner}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Year model"
                          type="number"
                          value={v.year_model}
                          onChange={(e) => updateVehicleField(index, "year_model", e.target.value)}
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id) && !v.reassign_owner}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Color"
                          value={v.color}
                          onChange={(e) => updateVehicleField(index, "color", e.target.value)}
                          fullWidth
                          disabled={Boolean(v.existing_vehicle_id) && !v.reassign_owner}
                        />
                      </Grid>
                    </Grid>
                  </Box>
                ))}
              </Stack>
            </Paper>
          )}

          {/* Risk Address — Property only, the property actually being insured.
              Hidden until Product & Coverage is complete. */}
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
                        setRiskAddress({ ...riskAddress, address_line_1: value, existing_address_id: null });
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
              </Grid>
            </Paper>
          )}

          {/* Insured Address — the address the policy is actually named on, for
              both Motor and Property. Hidden until the Vehicle/Risk Address
              step above it is complete. */}
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
                        setInsuredAddress({ ...insuredAddress, address_line_1: value, existing_address_id: null });
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
              Payment &amp; Delivery
            </Typography>
            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={sendPolicyToEmail}
                    onChange={(e) => setSendPolicyToEmail(e.target.checked)}
                  />
                }
                label="Send the policy directly to the customer's email once issued"
              />

              <TextField
                select
                label="Payment method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                required
                fullWidth
              >
                <MenuItem value="CASH">Cash</MenuItem>
                <MenuItem value="CHECK">Check</MenuItem>
                <MenuItem value="CREDIT_CARD">Credit card</MenuItem>
                <MenuItem value="BANK_TRANSFER">Bank transfer</MenuItem>
                <MenuItem value="ONLINE_PAYMENT">Online payment</MenuItem>
              </TextField>

              <TextField
                select
                label="Payment goes to"
                value={paymentRemittance}
                onChange={(e) => setPaymentRemittance(e.target.value)}
                required
                fullWidth
              >
                <MenuItem value="DIRECT_TO_BETHEL">Directly to Bethel</MenuItem>
                <MenuItem value="THROUGH_AGENT">Through the agent first</MenuItem>
              </TextField>

              {paymentRemittance === "DIRECT_TO_BETHEL" && (
                <TextField
                  select
                  label="Bethel payment method"
                  value={bethelPaymentMethodId}
                  onChange={(e) => setBethelPaymentMethodId(e.target.value)}
                  required
                  fullWidth
                >
                  {bethelPaymentMethods.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>
          </Paper>

          {totalPremium > 0 && (
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Charges
              </Typography>
              <Stack spacing={1.5}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <NumberField label="Miscellaneous" value={misc} onChange={setMisc} fullWidth size="small" />
                  </Grid>
                </Grid>
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

          {!canIssue && (
            <Alert severity="warning">
              You don't have permission to issue policy applications. You can still fill this out, but
              submitting it isn't available for your account.
            </Alert>
          )}

          <Button type="submit" variant="contained" size="large" disabled={!canIssue}>
            Submit Application
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
        token={token}
        onSaved={(updated) => {
          setVehicles((prev) =>
            prev.map((v, i) =>
              i === editingVehicleIndex
                ? {
                    plate_number: updated.plate_number,
                    mv_file_no: updated.mv_file_no,
                    engine_number: updated.engine_number,
                    chassis_number: updated.chassis_number,
                    make: updated.make || "",
                    model: updated.model || "",
                    year_model: updated.year_model || "",
                    vehicle_type: updated.vehicle_type || "",
                    color: updated.color || "",
                    existing_vehicle_id: updated.id,
                    reassign_owner: false,
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
        onCancel={() => setPlateConflict(null)}
        onConfirm={handleConfirmPlateMatch}
      />

      <AddressEditDialog
        open={editingAddressField !== null}
        onClose={() => setEditingAddressField(null)}
        address={editingAddressField === "risk" ? riskAddress : editingAddressField === "insured" ? insuredAddress : null}
        token={token}
        onSaved={(updated) => {
          const updatedFields = {
            address_line_1: updated.address_line_1,
            address_line_2: updated.address_line_2 || "",
            barangay: updated.barangay || "",
            city: updated.city,
            province: updated.province,
            postal_code: updated.postal_code || "",
            country: updated.country || "Philippines",
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
        <DialogTitle>Policy Schedule Preview</DialogTitle>
        <DialogContent sx={{ bgcolor: "#e9e9e9" }}>
          <Box sx={{ my: 2, display: "flex", justifyContent: "center" }}>
            <PolicySchedulePreview {...previewProps} />
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
          <Button variant="outlined" onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmSubmit}
            disabled={!confirmChecked || submitting || !canIssue}
          >
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Printed independently of the dialog — printing the dialog directly
          drags in its own chrome/scroll container and produces blank pages. */}
      {previewOpen &&
        createPortal(<PolicySchedulePreview {...previewProps} />, document.getElementById("print-root"))}
    </Container>
  );
}
