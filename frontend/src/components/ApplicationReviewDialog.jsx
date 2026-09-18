import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Alert,
  Button,
  Divider,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  CircularProgress,
  Chip,
  Checkbox,
  FormControlLabel,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PrintIcon from "@mui/icons-material/Print";
import {
  downloadApplicationForApprovalPdf,
  getApplicationForApproval,
  listApplicationChanges,
  createApplicationChange,
  approveApplication,
  rejectApplication,
} from "../api/client";
import { PdfViewer } from "./PdfViewer";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";

// Kept in this one dialog file rather than schemas/policyApplicationChanges.js
// on the frontend, since nothing else needs them — mirrors the backend's own
// ApplicationChangeType groupings exactly (backend/src/schemas/policyApplicationChanges.js).
const CHANGE_TYPE_LABELS = {
  INSURED_FROM_DATE: "Insured From Date",
  INSURED_NAME_DETAILS: "Insured Name Details",
  INSURED_ADDRESS_DETAILS: "Insured Address Details",
  VEHICLE_MODEL: "Vehicle Model",
  VEHICLE_MV_FILE: "Vehicle MV File No.",
  VEHICLE_PLATE_NO: "Vehicle Plate No.",
  VEHICLE_TYPE: "Vehicle Type",
  VEHICLE_MAKE: "Vehicle Make",
  VEHICLE_COLOR: "Vehicle Color",
  VEHICLE_ENGINE_NO: "Vehicle Engine No.",
  VEHICLE_CHASSIS_NO: "Vehicle Chassis No.",
  ADD_CLAUSE: "Add Clause",
  REMOVE_CLAUSE: "Remove Clause",
};

const VEHICLE_FIELD_BY_CHANGE_TYPE = {
  VEHICLE_MODEL: "model",
  VEHICLE_MV_FILE: "mv_file_no",
  VEHICLE_PLATE_NO: "plate_number",
  VEHICLE_TYPE: "vehicle_type",
  VEHICLE_MAKE: "make",
  VEHICLE_COLOR: "color",
  VEHICLE_ENGINE_NO: "engine_number",
  VEHICLE_CHASSIS_NO: "chassis_number",
};
const VEHICLE_CHANGE_TYPES = new Set(Object.keys(VEHICLE_FIELD_BY_CHANGE_TYPE));
const CLAUSE_CHANGE_TYPES = new Set(["ADD_CLAUSE", "REMOVE_CLAUSE"]);

// INSURED_NAME_DETAILS/INSURED_ADDRESS_DETAILS form field groups — every
// individually-editable Customer name column / Address column (see
// formatInsuredName/formatAddress in backend/src/routes/policyApplications.js),
// not just the single combined display string the rest of the app shows.
const EMPTY_NAME_FIELDS = { first_name: "", middle_name: "", last_name: "", company_name: "" };
const EMPTY_ADDRESS_FIELDS = {
  address_line_1: "",
  address_line_2: "",
  barangay: "",
  city: "",
  province: "",
  postal_code: "",
  country: "",
};

function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Same UTC-getter approach as EditQuotationDialog.jsx's toLocalDateTimeInput,
// for the same reason: the value round-trips to the server as a naive
// datetime-local string, parsed in the server's own timezone (UTC, no TZ set
// in the container) — never the browser's.
function toLocalDateTimeInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Mirrors formatInsuredName in backend/src/routes/policyApplications.js —
// an INSURED_NAME_DETAILS change's change_to is sent (and used) verbatim,
// with no server-side recomputation, so the client has to build the exact
// same "Last, First Middle" shape the rest of the app already displays and
// stores (insured_name, Policy.customer_name_snapshot).
function formatInsuredName({ first_name, middle_name, last_name }) {
  const given = [first_name, middle_name]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(" ");
  return [(last_name || "").trim(), given].filter(Boolean).join(", ");
}

// The Policy Approval page's row-click popup — replaces what used to be two
// separate dialogs (ApplicationDetailDialog for the PDF, ApplicationApprovalDialog
// for the review/approve form, opened from a dedicated Actions-column button).
// Now a single wide dialog: the PDF on the left, the change-history list +
// "Create Change" form + "Approve" on the right, side by side, so an approver
// never has to close one popup to open the other. Never touches the
// PolicyApplication row itself when recording a change — see
// backend/src/routes/policyApproval.js. Creating a change re-fetches the PDF
// (pdfReloadKey below) so the document on the left reflects the correction
// immediately, without the approver having to close and reopen this dialog.
// INSURED_NAME_DETAILS/INSURED_ADDRESS_DETAILS expose every individually-
// editable name/address field (First/Middle/Last or Company Name; every
// Address column but estimated_value) rather than one free-text box for the
// whole combined string.
export function ApplicationReviewDialog({ open, applicationId, applicationNumber, token, onClose, onApproved }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState("");

  const [detail, setDetail] = useState(null);
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [changeType, setChangeType] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [coverageId, setCoverageId] = useState("");
  const [newValue, setNewValue] = useState("");
  const [nameFields, setNameFields] = useState(EMPTY_NAME_FIELDS);
  const [addressFields, setAddressFields] = useState(EMPTY_ADDRESS_FIELDS);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [savingChange, setSavingChange] = useState(false);
  const [changeError, setChangeError] = useState("");
  // Bumped after a change is successfully recorded to re-run the PDF-fetch
  // effect below — otherwise the PDF panel keeps showing the pre-correction
  // document until the whole dialog is closed and reopened.
  const [pdfReloadKey, setPdfReloadKey] = useState(0);

  const [confirmApprove, setConfirmApprove] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [approvedPolicy, setApprovedPolicy] = useState(null);
  // Optional — entered by the approver right at the moment of approval, not
  // asked for anywhere earlier (a quotation/application never has either).
  // Printed on the issued Policy PDF below "Policy No."/"Date Issued:"
  // respectively (see backend's pdf/policyPdf.js).
  const [cocNumber, setCocNumber] = useState("");
  const [saNumber, setSaNumber] = useState("");

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState("");
  const [rejectedFlag, setRejectedFlag] = useState(false);

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    let objectUrl = null;
    setPdfLoading(true);
    setPdfError("");
    setPdfUrl(null);

    downloadApplicationForApprovalPdf(token, applicationId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setPdfError(err.message);
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // pdfReloadKey has no meaning of its own — bumping it (after a change is
    // recorded, see handleCreateChange) just re-runs this same fetch so the
    // PDF reflects the correction without closing/reopening the dialog.
  }, [applicationId, token, pdfReloadKey]);

  function load() {
    setLoading(true);
    setError("");
    return Promise.all([getApplicationForApproval(token, applicationId), listApplicationChanges(token, applicationId)])
      .then(([d, c]) => {
        setDetail(d);
        setChanges(c);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!applicationId) return;
    setApprovedPolicy(null);
    setConfirmApprove(false);
    setApproveError("");
    setFormOpen(false);
    setCocNumber("");
    setSaNumber("");
    setRejectOpen(false);
    setRejectRemarks("");
    setRejectError("");
    setRejectedFlag(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  function resetForm() {
    setChangeType("");
    setVehicleId("");
    setCoverageId("");
    setNewValue("");
    setNameFields(EMPTY_NAME_FIELDS);
    setAddressFields(EMPTY_ADDRESS_FIELDS);
    setEffectiveDate("");
    setRemarks("");
    setChangeError("");
  }

  function handleChangeTypeChange(type) {
    setChangeType(type);
    setChangeError("");
    setVehicleId(VEHICLE_CHANGE_TYPES.has(type) && detail?.vehicles?.length === 1 ? detail.vehicles[0].application_vehicle_id : "");
    setCoverageId(CLAUSE_CHANGE_TYPES.has(type) && detail?.coverages?.length === 1 ? detail.coverages[0].id : "");
    setNewValue(type === "INSURED_FROM_DATE" ? toLocalDateTimeInput(detail?.coverage_start_at) : "");
    setNameFields(
      type === "INSURED_NAME_DETAILS"
        ? {
            first_name: detail?.insured_first_name || "",
            middle_name: detail?.insured_middle_name || "",
            last_name: detail?.insured_last_name || "",
            company_name: detail?.insured_type === "CORPORATE" ? detail?.insured_name || "" : "",
          }
        : EMPTY_NAME_FIELDS
    );
    setAddressFields(
      type === "INSURED_ADDRESS_DETAILS"
        ? {
            address_line_1: detail?.insured_address_line_1 || "",
            address_line_2: detail?.insured_address_line_2 || "",
            barangay: detail?.insured_barangay || "",
            city: detail?.insured_city || "",
            province: detail?.insured_province || "",
            postal_code: detail?.insured_postal_code || "",
            country: detail?.insured_country || "",
          }
        : EMPTY_ADDRESS_FIELDS
    );
  }

  function currentValueFor() {
    if (!detail || !changeType) return "";
    if (VEHICLE_CHANGE_TYPES.has(changeType)) {
      const vehicle = detail.vehicles.find((v) => v.application_vehicle_id === vehicleId);
      return vehicle ? vehicle[VEHICLE_FIELD_BY_CHANGE_TYPE[changeType]] || "—" : "";
    }
    if (changeType === "INSURED_FROM_DATE") return fmtDateTime(detail.coverage_start_at);
    if (CLAUSE_CHANGE_TYPES.has(changeType)) {
      const coverage = detail.coverages.find((c) => c.id === coverageId);
      return coverage ? coverage.clause || "—" : "";
    }
    return "";
  }

  async function handleCreateChange() {
    setChangeError("");
    if (!changeType) {
      setChangeError("Select a change type");
      return;
    }
    if (VEHICLE_CHANGE_TYPES.has(changeType) && !vehicleId) {
      setChangeError("Select which vehicle this change applies to");
      return;
    }
    if (CLAUSE_CHANGE_TYPES.has(changeType) && !coverageId) {
      setChangeError("Select which coverage this change applies to");
      return;
    }

    const payload = {
      change_type: changeType,
      application_vehicle_id: VEHICLE_CHANGE_TYPES.has(changeType) ? vehicleId : undefined,
      application_coverage_id: CLAUSE_CHANGE_TYPES.has(changeType) ? coverageId : undefined,
      effective_date: effectiveDate || undefined,
      remarks: remarks || undefined,
    };

    if (changeType === "INSURED_NAME_DETAILS") {
      if (detail.insured_type === "INDIVIDUAL") {
        if (!nameFields.first_name.trim() || !nameFields.last_name.trim()) {
          setChangeError("Enter at least a first and last name");
          return;
        }
        payload.new_value = formatInsuredName(nameFields);
      } else {
        if (!nameFields.company_name.trim()) {
          setChangeError("Enter the company name");
          return;
        }
        payload.new_value = nameFields.company_name.trim();
      }
    } else if (changeType === "INSURED_ADDRESS_DETAILS") {
      if (!addressFields.address_line_1.trim() || !addressFields.city.trim() || !addressFields.province.trim()) {
        setChangeError("Address line 1, city, and province are required");
        return;
      }
      // Every field is sent as-is (including a deliberately blanked-out
      // optional one) rather than omitting empty ones — this is the address's
      // whole new state, not a partial patch, so an approver clearing e.g.
      // barangay should actually clear it in the DB, not leave the old value
      // untouched because the key was missing from the request.
      payload.new_address = {
        address_line_1: addressFields.address_line_1.trim(),
        address_line_2: addressFields.address_line_2.trim(),
        barangay: addressFields.barangay.trim(),
        city: addressFields.city.trim(),
        province: addressFields.province.trim(),
        postal_code: addressFields.postal_code.trim(),
        country: addressFields.country.trim(),
      };
    } else {
      if (!newValue.trim()) {
        setChangeError(changeType === "REMOVE_CLAUSE" ? "Enter the exact clause text to remove" : "Enter the new value");
        return;
      }
      payload.new_value = newValue;
    }

    setSavingChange(true);
    try {
      await createApplicationChange(token, applicationId, payload);
      setFormOpen(false);
      resetForm();
      await load();
      // Re-fetches the PDF so it reflects this correction immediately — see
      // the pdfReloadKey effect above.
      setPdfReloadKey((k) => k + 1);
    } catch (err) {
      setChangeError(err.message);
    } finally {
      setSavingChange(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setApproveError("");
    try {
      const policy = await approveApplication(token, applicationId, {
        coc_number: cocNumber.trim() || undefined,
        sa_number: saNumber.trim() || undefined,
      });
      setApprovedPolicy(policy);
      onApproved?.();
    } catch (err) {
      setApproveError(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!rejectRemarks.trim()) {
      setRejectError("Enter a reason for rejecting this application");
      return;
    }
    setRejecting(true);
    setRejectError("");
    try {
      await rejectApplication(token, applicationId, { remarks: rejectRemarks.trim() });
      setRejectedFlag(true);
      onApproved?.();
    } catch (err) {
      setRejectError(err.message);
    } finally {
      setRejecting(false);
    }
  }

  const isApproved = detail?.status === "APPROVED" || Boolean(approvedPolicy);
  const isRejected = detail?.status === "REJECTED" || rejectedFlag;
  const isClauseType = CLAUSE_CHANGE_TYPES.has(changeType);

  // Unsaved-input tracking (see context/UnsavedChangesContext.jsx) — this
  // dialog otherwise stays mounted (see the host page's `keepMounted`/
  // split open+id state) and keeps its draft on a Cancel/X/backdrop close,
  // so the sidebar/refresh guard needs to know whenever there's actually
  // something to lose: the "Create Change" inline form, the COC/SA number
  // fields (only meaningful pre-decision), or an open reject-reason panel.
  const changeFormHasInput = Boolean(
    changeType ||
      vehicleId ||
      coverageId ||
      newValue.trim() ||
      nameFields.first_name.trim() ||
      nameFields.middle_name.trim() ||
      nameFields.last_name.trim() ||
      nameFields.company_name.trim() ||
      Object.values(addressFields).some((v) => v.trim()) ||
      effectiveDate ||
      remarks.trim()
  );
  const cocSaHasInput = !isApproved && !isRejected && Boolean(cocNumber.trim() || saNumber.trim());
  const rejectFormHasInput = rejectOpen && Boolean(rejectRemarks.trim());
  useUnsavedChanges(
    "application-review-dialog",
    open && ((formOpen && changeFormHasInput) || cocSaHasInput || rejectFormHasInput)
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl" scroll="paper" keepMounted>
      <DialogTitle>{applicationNumber ? `Review Application ${applicationNumber}` : "Review Application"}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "flex", gap: 3, flexDirection: { xs: "column", md: "row" } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <PdfViewer url={pdfUrl} loading={pdfLoading} error={pdfError} height="75vh" />
            <Button
              size="small"
              startIcon={<PrintIcon />}
              onClick={() => window.open(pdfUrl, "_blank")}
              disabled={!pdfUrl}
              sx={{ mt: 1 }}
            >
              Re-export PDF
            </Button>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, maxHeight: "75vh", overflowY: "auto", pr: 0.5 }}>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress />
              </Box>
            ) : error ? (
              <Alert severity="error">{error}</Alert>
            ) : (
              <Stack spacing={2.5}>
                {approvedPolicy && (
                  <Alert severity="success">
                    Approved — policy <strong>{approvedPolicy.policy_number}</strong> has been issued.
                  </Alert>
                )}
                {isRejected && !approvedPolicy && <Alert severity="error">This application has been rejected.</Alert>}

                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {detail.insured_name} — {detail.class_name} / {detail.variant_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Insured from {fmtDateTime(detail.coverage_start_at)} to {fmtDateTime(detail.coverage_end_at)}
                  </Typography>
                </Box>

                <Divider />

                <Box>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Recorded Changes
                    </Typography>
                    {!isApproved && !isRejected && (
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => {
                          if (formOpen) {
                            setFormOpen(false);
                          } else {
                            resetForm();
                            setFormOpen(true);
                          }
                        }}
                      >
                        {formOpen ? "Cancel" : "Create Change"}
                      </Button>
                    )}
                  </Stack>

                  {changes.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No changes have been recorded for this application yet.
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Type</TableCell>
                          <TableCell>From</TableCell>
                          <TableCell>To</TableCell>
                          <TableCell>Remarks</TableCell>
                          <TableCell>By</TableCell>
                          <TableCell>Date</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {changes.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Chip size="small" label={CHANGE_TYPE_LABELS[c.change_type] || c.change_type} />
                            </TableCell>
                            <TableCell sx={{ maxWidth: 140, whiteSpace: "pre-wrap" }}>{c.change_from || "—"}</TableCell>
                            <TableCell sx={{ maxWidth: 140, whiteSpace: "pre-wrap" }}>{c.change_to || "—"}</TableCell>
                            <TableCell>{c.remarks || "—"}</TableCell>
                            <TableCell>{c.created_by_name}</TableCell>
                            <TableCell>{fmtDateTime(c.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {formOpen && (
                    <Box sx={{ mt: 2, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                      <Stack spacing={2}>
                        {changeError && <Alert severity="error">{changeError}</Alert>}

                        <FormControl fullWidth size="small">
                          <InputLabel>Change Type</InputLabel>
                          <Select
                            label="Change Type"
                            value={changeType}
                            onChange={(e) => handleChangeTypeChange(e.target.value)}
                          >
                            {Object.entries(CHANGE_TYPE_LABELS).map(([value, label]) => (
                              <MenuItem key={value} value={value}>
                                {label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        {VEHICLE_CHANGE_TYPES.has(changeType) && (
                          <FormControl fullWidth size="small">
                            <InputLabel>Vehicle</InputLabel>
                            <Select label="Vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                              {(detail.vehicles || []).map((v) => (
                                <MenuItem key={v.application_vehicle_id} value={v.application_vehicle_id}>
                                  {v.plate_number || v.mv_file_no}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}

                        {isClauseType && (
                          <FormControl fullWidth size="small">
                            <InputLabel>Coverage</InputLabel>
                            <Select label="Coverage" value={coverageId} onChange={(e) => setCoverageId(e.target.value)}>
                              {(detail.coverages || []).map((c) => (
                                <MenuItem key={c.id} value={c.id}>
                                  {c.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}

                        {changeType && !["INSURED_NAME_DETAILS", "INSURED_ADDRESS_DETAILS"].includes(changeType) && (
                          <TextField
                            label="Current value"
                            value={currentValueFor()}
                            size="small"
                            fullWidth
                            multiline={isClauseType}
                            maxRows={4}
                            disabled
                          />
                        )}

                        {changeType === "INSURED_FROM_DATE" ? (
                          <TextField
                            label="New insured-from date"
                            type="datetime-local"
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            size="small"
                            fullWidth
                            slotProps={{ inputLabel: { shrink: true } }}
                          />
                        ) : changeType === "INSURED_NAME_DETAILS" ? (
                          detail.insured_type === "INDIVIDUAL" ? (
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                              <TextField
                                label="Last name"
                                value={nameFields.last_name}
                                onChange={(e) => setNameFields((f) => ({ ...f, last_name: e.target.value }))}
                                size="small"
                                fullWidth
                              />
                              <TextField
                                label="First name"
                                value={nameFields.first_name}
                                onChange={(e) => setNameFields((f) => ({ ...f, first_name: e.target.value }))}
                                size="small"
                                fullWidth
                              />
                              <TextField
                                label="Middle name (optional)"
                                value={nameFields.middle_name}
                                onChange={(e) => setNameFields((f) => ({ ...f, middle_name: e.target.value }))}
                                size="small"
                                fullWidth
                              />
                            </Stack>
                          ) : (
                            <TextField
                              label="Company name"
                              value={nameFields.company_name}
                              onChange={(e) => setNameFields((f) => ({ ...f, company_name: e.target.value }))}
                              size="small"
                              fullWidth
                            />
                          )
                        ) : changeType === "INSURED_ADDRESS_DETAILS" ? (
                          <Stack spacing={2}>
                            <TextField
                              label="Address line 1"
                              value={addressFields.address_line_1}
                              onChange={(e) => setAddressFields((f) => ({ ...f, address_line_1: e.target.value }))}
                              size="small"
                              fullWidth
                            />
                            <TextField
                              label="Address line 2 (optional)"
                              value={addressFields.address_line_2}
                              onChange={(e) => setAddressFields((f) => ({ ...f, address_line_2: e.target.value }))}
                              size="small"
                              fullWidth
                            />
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                              <TextField
                                label="Barangay (optional)"
                                value={addressFields.barangay}
                                onChange={(e) => setAddressFields((f) => ({ ...f, barangay: e.target.value }))}
                                size="small"
                                fullWidth
                              />
                              <TextField
                                label="City"
                                value={addressFields.city}
                                onChange={(e) => setAddressFields((f) => ({ ...f, city: e.target.value }))}
                                size="small"
                                fullWidth
                              />
                              <TextField
                                label="Province"
                                value={addressFields.province}
                                onChange={(e) => setAddressFields((f) => ({ ...f, province: e.target.value }))}
                                size="small"
                                fullWidth
                              />
                            </Stack>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                              <TextField
                                label="Postal code (optional)"
                                value={addressFields.postal_code}
                                onChange={(e) => setAddressFields((f) => ({ ...f, postal_code: e.target.value }))}
                                size="small"
                                fullWidth
                              />
                              <TextField
                                label="Country (optional)"
                                value={addressFields.country}
                                onChange={(e) => setAddressFields((f) => ({ ...f, country: e.target.value }))}
                                size="small"
                                fullWidth
                              />
                            </Stack>
                          </Stack>
                        ) : (
                          changeType && (
                            <TextField
                              label={changeType === "REMOVE_CLAUSE" ? "Exact text to remove" : changeType === "ADD_CLAUSE" ? "Text to add" : "New value"}
                              value={newValue}
                              onChange={(e) => setNewValue(e.target.value)}
                              size="small"
                              fullWidth
                              multiline={isClauseType}
                              maxRows={4}
                              helperText={
                                changeType === "REMOVE_CLAUSE"
                                  ? "Must match a portion of the coverage's current clause exactly"
                                  : undefined
                              }
                            />
                          )
                        )}

                        {changeType && (
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            <TextField
                              label="Effective date (optional)"
                              type="date"
                              value={effectiveDate}
                              onChange={(e) => setEffectiveDate(e.target.value)}
                              size="small"
                              fullWidth
                              slotProps={{ inputLabel: { shrink: true } }}
                            />
                            <TextField
                              label="Remarks (optional)"
                              value={remarks}
                              onChange={(e) => setRemarks(e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Stack>
                        )}

                        {changeType && (
                          <Box>
                            <Button variant="contained" size="small" onClick={handleCreateChange} disabled={savingChange}>
                              {savingChange ? "Saving..." : "Save Change"}
                            </Button>
                          </Box>
                        )}
                      </Stack>
                    </Box>
                  )}
                </Box>

                {!isApproved && !isRejected && (
                  <>
                    <Divider />
                    <Box>
                      {approveError && (
                        <Alert severity="error" sx={{ mb: 1 }}>
                          {approveError}
                        </Alert>
                      )}
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
                        <TextField
                          label="COC Number (optional)"
                          value={cocNumber}
                          onChange={(e) => setCocNumber(e.target.value)}
                          size="small"
                          fullWidth
                        />
                        <TextField
                          label="SA Number (optional)"
                          value={saNumber}
                          onChange={(e) => setSaNumber(e.target.value)}
                          size="small"
                          fullWidth
                        />
                      </Stack>
                      <FormControlLabel
                        control={<Checkbox checked={confirmApprove} onChange={(e) => setConfirmApprove(e.target.checked)} />}
                        label="I have reviewed this application and every recorded change above, and confirm this policy should be approved."
                      />
                    </Box>

                    <Divider />
                    <Box>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: rejectOpen ? 1 : 0 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          Reject Application
                        </Typography>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => {
                            setRejectError("");
                            setRejectOpen((open) => !open);
                          }}
                        >
                          {rejectOpen ? "Cancel" : "Reject..."}
                        </Button>
                      </Stack>
                      {rejectOpen && (
                        <Stack spacing={1.5}>
                          {rejectError && <Alert severity="error">{rejectError}</Alert>}
                          <TextField
                            label="Reason for rejection"
                            value={rejectRemarks}
                            onChange={(e) => setRejectRemarks(e.target.value)}
                            size="small"
                            fullWidth
                            multiline
                            minRows={2}
                          />
                          <Box>
                            <Button
                              variant="contained"
                              color="error"
                              size="small"
                              onClick={handleReject}
                              disabled={rejecting || !rejectRemarks.trim()}
                            >
                              {rejecting ? "Rejecting..." : "Confirm Reject"}
                            </Button>
                          </Box>
                        </Stack>
                      )}
                    </Box>
                  </>
                )}
              </Stack>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {!loading && !error && !isApproved && !isRejected && (
          <Button variant="contained" color="success" onClick={handleApprove} disabled={!confirmApprove || approving}>
            {approving ? "Approving..." : "Approve"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
