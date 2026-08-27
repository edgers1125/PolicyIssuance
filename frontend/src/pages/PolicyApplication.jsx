import { useEffect, useState } from "react";
import {
  Container,
  Typography,
  Paper,
  Box,
  Stack,
  TextField,
  MenuItem,
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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "../context/AuthContext";
import {
  getProductCatalog,
  listMyCustomers,
  createCustomer,
  listMyCompanies,
  createCompany,
  createPolicyApplication,
} from "../api/client";

const emptyCustomer = {
  first_name: "",
  last_name: "",
  middle_name: "",
  email: "",
  mobile_number: "",
  birthday: "",
  gender: "",
};

const emptyCompany = { company_code: "", company_name: "", tin_no: "", email: "" };

const emptyVehicle = {
  plate_number: "",
  engine_number: "",
  chassis_number: "",
  make: "",
  model: "",
  year_model: "",
  vehicle_type: "",
  color: "",
};

const emptyAddress = {
  address_line_1: "",
  address_line_2: "",
  barangay: "",
  city: "",
  province: "",
  postal_code: "",
  country: "Philippines",
};

export function PolicyApplication() {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const [catalog, setCatalog] = useState([]);
  const [myCustomers, setMyCustomers] = useState([]);
  const [myCompanies, setMyCompanies] = useState([]);

  const [insuredType, setInsuredType] = useState("INDIVIDUAL");
  const [partyMode, setPartyMode] = useState("existing");
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [newCustomer, setNewCustomer] = useState(emptyCustomer);
  const [newCompany, setNewCompany] = useState(emptyCompany);

  const [classId, setClassId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [coverageSelections, setCoverageSelections] = useState({});
  const [coverageStartAt, setCoverageStartAt] = useState("");
  const [coverageEndAt, setCoverageEndAt] = useState("");

  const [vehicles, setVehicles] = useState([emptyVehicle]);
  const [address, setAddress] = useState(emptyAddress);
  const [remarks, setRemarks] = useState("");

  function loadParties() {
    return Promise.all([listMyCustomers(token).then(setMyCustomers), listMyCompanies(token).then(setMyCompanies)]);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([getProductCatalog(token).then(setCatalog), loadParties()])
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
  }

  async function handleSubmit(e) {
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

    setSubmitting(true);
    try {
      let customerId = insuredType === "INDIVIDUAL" && partyMode === "existing" ? selectedPartyId : undefined;
      let companyId = insuredType === "CORPORATE" && partyMode === "existing" ? selectedPartyId : undefined;

      if (partyMode === "new") {
        if (insuredType === "INDIVIDUAL") {
          const created = await createCustomer(token, newCustomer);
          customerId = created.id;
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
        address: isProperty ? address : undefined,
        remarks: remarks || undefined,
      };

      const application = await createPolicyApplication(token, payload);
      setSuccess(application);

      // Reset for the next application, but keep the newly created party available.
      setPartyMode("existing");
      setSelectedPartyId(insuredType === "INDIVIDUAL" ? application.customer_id : application.company_id);
      setNewCustomer(emptyCustomer);
      setNewCompany(emptyCompany);
      setVariantId("");
      setCoverageSelections({});
      setCoverageStartAt("");
      setCoverageEndAt("");
      setVehicles([emptyVehicle]);
      setAddress(emptyAddress);
      setRemarks("");
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

  const parties = insuredType === "INDIVIDUAL" ? myCustomers : myCompanies;

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

      <Box component="form" onSubmit={handleSubmit}>
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
                  setSelectedPartyId("");
                  setPartyMode("existing");
                }
              }}
              sx={{ mb: 2 }}
              fullWidth
            >
              <ToggleButton value="INDIVIDUAL">Individual</ToggleButton>
              <ToggleButton value="CORPORATE">Company</ToggleButton>
            </ToggleButtonGroup>

            <ToggleButtonGroup
              value={partyMode}
              exclusive
              onChange={(e, v) => {
                if (v) {
                  setPartyMode(v);
                  setSelectedPartyId("");
                }
              }}
              size="small"
              sx={{ mb: 2 }}
              fullWidth
            >
              <ToggleButton value="existing">Existing {insuredType === "INDIVIDUAL" ? "Customer" : "Company"}</ToggleButton>
              <ToggleButton value="new">New {insuredType === "INDIVIDUAL" ? "Customer" : "Company"}</ToggleButton>
            </ToggleButtonGroup>

            {partyMode === "existing" ? (
              <TextField
                select
                label={insuredType === "INDIVIDUAL" ? "Customer" : "Company"}
                value={selectedPartyId}
                onChange={(e) => setSelectedPartyId(e.target.value)}
                required
                fullWidth
                helperText={
                  parties.length === 0
                    ? "You have no connected customers/companies yet — use \"New\" instead."
                    : undefined
                }
              >
                {parties.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {insuredType === "INDIVIDUAL" ? `${p.first_name} ${p.last_name}` : p.company_name}
                  </MenuItem>
                ))}
              </TextField>
            ) : insuredType === "INDIVIDUAL" ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="First name"
                    value={newCustomer.first_name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Last name"
                    value={newCustomer.last_name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Middle name"
                    value={newCustomer.middle_name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, middle_name: e.target.value })}
                    fullWidth
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
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Mobile number"
                    value={newCustomer.mobile_number}
                    onChange={(e) => setNewCustomer({ ...newCustomer, mobile_number: e.target.value })}
                    fullWidth
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
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    select
                    label="Gender"
                    value={newCustomer.gender}
                    onChange={(e) => setNewCustomer({ ...newCustomer, gender: e.target.value })}
                    fullWidth
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
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Company name"
                    value={newCompany.company_name}
                    onChange={(e) => setNewCompany({ ...newCompany, company_name: e.target.value })}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="TIN"
                    value={newCompany.tin_no}
                    onChange={(e) => setNewCompany({ ...newCompany, tin_no: e.target.value })}
                    fullWidth
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
                  />
                </Grid>
              </Grid>
            )}
          </Paper>

          {/* Product & coverage */}
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
                      return (
                        <Box key={cov.id}>
                          <FormControlLabel
                            control={<Checkbox checked={Boolean(selection)} onChange={() => toggleCoverage(cov.id)} />}
                            label={`${cov.coverage_name} (max ${Number(cov.maximum_coverage).toLocaleString()})`}
                          />
                          {selection && (
                            <Grid container spacing={2} sx={{ pl: 4, pb: 1 }}>
                              <Grid size={6}>
                                <TextField
                                  label="Coverage amount"
                                  type="number"
                                  value={selection.coverage_amount}
                                  onChange={(e) => updateCoverageField(cov.id, "coverage_amount", e.target.value)}
                                  required
                                  fullWidth
                                  size="small"
                                />
                              </Grid>
                              <Grid size={6}>
                                <TextField
                                  label="Premium amount"
                                  type="number"
                                  value={selection.premium_amount}
                                  onChange={(e) => updateCoverageField(cov.id, "premium_amount", e.target.value)}
                                  required
                                  fullWidth
                                  size="small"
                                />
                              </Grid>
                            </Grid>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              )}
            </Stack>
          </Paper>

          {/* Vehicle(s) — Motor only, supports a fleet */}
          {isMotor && (
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
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Plate number"
                          value={v.plate_number}
                          onChange={(e) => updateVehicleField(index, "plate_number", e.target.value)}
                          required
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Engine number"
                          value={v.engine_number}
                          onChange={(e) => updateVehicleField(index, "engine_number", e.target.value)}
                          required
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Chassis number"
                          value={v.chassis_number}
                          onChange={(e) => updateVehicleField(index, "chassis_number", e.target.value)}
                          required
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Vehicle type"
                          value={v.vehicle_type}
                          onChange={(e) => updateVehicleField(index, "vehicle_type", e.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Make"
                          value={v.make}
                          onChange={(e) => updateVehicleField(index, "make", e.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Model"
                          value={v.model}
                          onChange={(e) => updateVehicleField(index, "model", e.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Year model"
                          type="number"
                          value={v.year_model}
                          onChange={(e) => updateVehicleField(index, "year_model", e.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Color"
                          value={v.color}
                          onChange={(e) => updateVehicleField(index, "color", e.target.value)}
                          fullWidth
                        />
                      </Grid>
                    </Grid>
                  </Box>
                ))}
              </Stack>
            </Paper>
          )}

          {/* Risk address — Property only */}
          {isProperty && (
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Risk Address
              </Typography>
              <Grid container spacing={2}>
                <Grid size={12}>
                  <TextField
                    label="Address line 1"
                    value={address.address_line_1}
                    onChange={(e) => setAddress({ ...address, address_line_1: e.target.value })}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    label="Address line 2"
                    value={address.address_line_2}
                    onChange={(e) => setAddress({ ...address, address_line_2: e.target.value })}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Barangay"
                    value={address.barangay}
                    onChange={(e) => setAddress({ ...address, barangay: e.target.value })}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="City"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Province"
                    value={address.province}
                    onChange={(e) => setAddress({ ...address, province: e.target.value })}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Postal code"
                    value={address.postal_code}
                    onChange={(e) => setAddress({ ...address, postal_code: e.target.value })}
                    fullWidth
                  />
                </Grid>
              </Grid>
            </Paper>
          )}

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

          <Button type="submit" variant="contained" size="large" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Application"}
          </Button>
        </Stack>
      </Box>
    </Container>
  );
}
