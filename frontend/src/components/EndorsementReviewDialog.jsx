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
  IconButton,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PrintIcon from "@mui/icons-material/Print";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import EmailIcon from "@mui/icons-material/Email";
import {
  downloadEndorsementPdf,
  getEndorsement,
  createEndorsementChange,
  updateEndorsementChange,
  deleteEndorsementChange,
  approveEndorsement,
  rejectEndorsement,
  resendEndorsementEmail,
} from "../api/client";
import { PdfViewer } from "./PdfViewer";
import { NumberField } from "./NumberField";
import { formatPHP } from "../utils/currency";

// Mirrors ApplicationReviewDialog.jsx's own CHANGE_TYPE_LABELS. CANCEL_POLICY
// is deliberately not listed here — it's never addable/editable as a
// standalone line (see backend/src/schemas/endorsements.js), only ever the
// single server-synthesized line on a CANCELLATION-type request (see
// PolicyDetailDialog.jsx's own composer), so it's rendered specially below
// rather than through the "Add Change" form's own type picker.
export const CHANGE_TYPE_LABELS = {
  POLICY_EFFECTIVE_DATE: "Policy Effective Date",
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
  ADD_COVERAGE: "Add Coverage",
  EDIT_CLAUSE: "Edit Clause",
  REMOVE_CLAUSE: "Remove Coverage",
};
// Used only to render an already-saved CANCEL_POLICY row's own Type chip.
const CANCEL_POLICY_LABEL = "Cancel Policy";

export const VEHICLE_FIELD_BY_CHANGE_TYPE = {
  VEHICLE_MODEL: "model",
  VEHICLE_MV_FILE: "mv_file_no",
  VEHICLE_PLATE_NO: "plate_number",
  VEHICLE_TYPE: "vehicle_type",
  VEHICLE_MAKE: "make",
  VEHICLE_COLOR: "color",
  VEHICLE_ENGINE_NO: "engine_number",
  VEHICLE_CHASSIS_NO: "chassis_number",
};
export const VEHICLE_CHANGE_TYPES = new Set(Object.keys(VEHICLE_FIELD_BY_CHANGE_TYPE));
// Both target an existing PolicyCoverage line — EDIT_CLAUSE amends its
// fine-print text only; REMOVE_CLAUSE removes the whole line (financial —
// debits the agent's payable ledger by that coverage's own margin).
export const COVERAGE_TARGET_CHANGE_TYPES = new Set(["EDIT_CLAUSE", "REMOVE_CLAUSE"]);

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

function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// The Endorsement Approval page's row-click popup — same wide two-pane shape
// as ApplicationReviewDialog.jsx (PDF left, change-list/"Create Change"/
// "Approve"/"Reject" panel right). An approver can add, edit, or remove any
// CORRECTION change line while the endorsement is still SUBMITTED — the same
// "correct before deciding" capability ApplicationReviewDialog gives over an
// application's changes. A CANCELLATION request is read-only here (its one
// CANCEL_POLICY line can't be edited/removed/added-to — see backend's own
// note) — approve or reject it as filed. Never touches the underlying Policy
// directly — see backend/src/routes/endorsements.js.
export function EndorsementReviewDialog({ endorsementId, endorsementNumber, token, onClose, onDecided }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState("");
  const [pdfReloadKey, setPdfReloadKey] = useState(0);

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingChangeId, setEditingChangeId] = useState(null);
  const [changeType, setChangeType] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [coverageId, setCoverageId] = useState("");
  const [productCoverageId, setProductCoverageId] = useState("");
  const [coverageAmount, setCoverageAmount] = useState("");
  const [premiumAmount, setPremiumAmount] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addressFields, setAddressFields] = useState(EMPTY_ADDRESS_FIELDS);
  const [remarks, setRemarks] = useState("");
  const [savingChange, setSavingChange] = useState(false);
  const [changeError, setChangeError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const [confirmApprove, setConfirmApprove] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [approvedFlag, setApprovedFlag] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState("");
  const [rejectedFlag, setRejectedFlag] = useState(false);

  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState(null);

  useEffect(() => {
    if (!endorsementId) return;
    let cancelled = false;
    let objectUrl = null;
    setPdfLoading(true);
    setPdfError("");
    setPdfUrl(null);

    downloadEndorsementPdf(token, endorsementId)
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
  }, [endorsementId, token, pdfReloadKey]);

  function load() {
    setLoading(true);
    setError("");
    return getEndorsement(token, endorsementId)
      .then((d) => setDetail(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!endorsementId) return;
    setApprovedFlag(false);
    setConfirmApprove(false);
    setApproveError("");
    setFormOpen(false);
    setRejectOpen(false);
    setRejectRemarks("");
    setRejectError("");
    setRejectedFlag(false);
    setResendResult(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endorsementId]);

  function resetForm() {
    setEditingChangeId(null);
    setChangeType("");
    setVehicleId("");
    setCoverageId("");
    setProductCoverageId("");
    setCoverageAmount("");
    setPremiumAmount("");
    setNewValue("");
    setAddressFields(EMPTY_ADDRESS_FIELDS);
    setRemarks("");
    setChangeError("");
  }

  function handleChangeTypeChange(type) {
    setChangeType(type);
    setChangeError("");
    setVehicleId(VEHICLE_CHANGE_TYPES.has(type) && detail?.vehicles?.length === 1 ? detail.vehicles[0].id : "");
    setCoverageId(COVERAGE_TARGET_CHANGE_TYPES.has(type) && detail?.coverages?.length === 1 ? detail.coverages[0].id : "");
    setProductCoverageId("");
    setCoverageAmount("");
    setPremiumAmount("");
    setNewValue(type === "POLICY_EFFECTIVE_DATE" ? toDateInput(detail?.current_effective_date) : "");
  }

  function startEdit(c) {
    setFormOpen(true);
    setEditingChangeId(c.id);
    setChangeError("");
    setChangeType(c.change_type);
    setVehicleId(c.policy_vehicle_id || "");
    setCoverageId(c.policy_coverage_id || "");
    setProductCoverageId(c.product_coverage_id || "");
    setCoverageAmount(c.coverage_amount != null ? String(c.coverage_amount) : "");
    setPremiumAmount(c.premium_amount != null ? String(c.premium_amount) : "");
    setRemarks(c.remarks || "");
    if (c.change_type === "INSURED_ADDRESS_DETAILS") {
      setAddressFields(EMPTY_ADDRESS_FIELDS);
      setNewValue("");
    } else if (c.change_type === "POLICY_EFFECTIVE_DATE") {
      setNewValue(toDateInput(c.change_to));
    } else if (c.change_type === "REMOVE_CLAUSE" || c.change_type === "ADD_COVERAGE") {
      setNewValue("");
    } else {
      setNewValue(c.change_type === "EDIT_CLAUSE" ? "" : c.change_to || "");
    }
  }

  function currentValueFor() {
    if (!detail || !changeType) return "";
    if (VEHICLE_CHANGE_TYPES.has(changeType)) {
      const vehicle = detail.vehicles.find((v) => v.id === vehicleId);
      return vehicle ? vehicle[VEHICLE_FIELD_BY_CHANGE_TYPE[changeType]] || "—" : "";
    }
    if (changeType === "POLICY_EFFECTIVE_DATE") return fmtDateTime(detail.current_effective_date);
    if (changeType === "INSURED_NAME_DETAILS") return detail.insured_name || "—";
    if (changeType === "INSURED_ADDRESS_DETAILS") return detail.insured_address || "—";
    if (changeType === "EDIT_CLAUSE") {
      const coverage = detail.coverages.find((c) => c.id === coverageId);
      return coverage ? coverage.clause || "—" : "";
    }
    if (changeType === "REMOVE_CLAUSE") {
      const coverage = detail.coverages.find((c) => c.id === coverageId);
      return coverage ? `Coverage Amount ${formatPHP(coverage.coverage_amount)} — Premium ${formatPHP(coverage.premium_amount)}` : "";
    }
    return "";
  }

  async function handleSaveChange() {
    setChangeError("");
    if (!changeType) {
      setChangeError("Select a change type");
      return;
    }
    if (VEHICLE_CHANGE_TYPES.has(changeType) && !vehicleId) {
      setChangeError("Select which vehicle this change applies to");
      return;
    }
    if (COVERAGE_TARGET_CHANGE_TYPES.has(changeType) && !coverageId) {
      setChangeError("Select which coverage this change applies to");
      return;
    }

    const payload = {
      change_type: changeType,
      policy_vehicle_id: VEHICLE_CHANGE_TYPES.has(changeType) || changeType === "ADD_COVERAGE" ? vehicleId || undefined : undefined,
      policy_coverage_id: COVERAGE_TARGET_CHANGE_TYPES.has(changeType) ? coverageId : undefined,
      remarks: remarks || undefined,
    };

    if (changeType === "ADD_COVERAGE") {
      if (!productCoverageId) {
        setChangeError("Select which coverage to add");
        return;
      }
      if (detail.class_name === "Motor" && !vehicleId) {
        setChangeError("Select which vehicle this coverage applies to");
        return;
      }
      if (!coverageAmount || Number(coverageAmount) <= 0) {
        setChangeError("Enter a coverage amount");
        return;
      }
      if (!premiumAmount || Number(premiumAmount) <= 0) {
        setChangeError("Enter a premium amount");
        return;
      }
      payload.product_coverage_id = productCoverageId;
      payload.coverage_amount = Number(coverageAmount);
      payload.premium_amount = Number(premiumAmount);
    } else if (changeType === "REMOVE_CLAUSE") {
      // No new_value needed — removing the coverage line entirely is the change.
    } else if (changeType === "INSURED_ADDRESS_DETAILS") {
      if (!addressFields.address_line_1.trim() || !addressFields.city.trim() || !addressFields.province.trim()) {
        setChangeError("Address line 1, city, and province are required");
        return;
      }
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
        setChangeError("Enter the new value");
        return;
      }
      payload.new_value = newValue;
    }

    setSavingChange(true);
    try {
      if (editingChangeId) {
        await updateEndorsementChange(token, endorsementId, editingChangeId, payload);
      } else {
        await createEndorsementChange(token, endorsementId, payload);
      }
      setFormOpen(false);
      resetForm();
      await load();
      setPdfReloadKey((k) => k + 1);
    } catch (err) {
      setChangeError(err.message);
    } finally {
      setSavingChange(false);
    }
  }

  async function handleDeleteChange(changeId) {
    setDeletingId(changeId);
    setError("");
    try {
      await deleteEndorsementChange(token, endorsementId, changeId);
      await load();
      setPdfReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setApproveError("");
    try {
      await approveEndorsement(token, endorsementId);
      setApprovedFlag(true);
      setPdfReloadKey((k) => k + 1);
      onDecided?.();
    } catch (err) {
      setApproveError(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!rejectRemarks.trim()) {
      setRejectError("Enter a reason for rejecting this endorsement");
      return;
    }
    setRejecting(true);
    setRejectError("");
    try {
      await rejectEndorsement(token, endorsementId, { remarks: rejectRemarks.trim() });
      setRejectedFlag(true);
      setPdfReloadKey((k) => k + 1);
      onDecided?.();
    } catch (err) {
      setRejectError(err.message);
    } finally {
      setRejecting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setResendResult(null);
    try {
      const res = await resendEndorsementEmail(token, endorsementId);
      setResendResult({ severity: "success", message: `Endorsement resent to ${res.to}.` });
    } catch (err) {
      setResendResult({ severity: "error", message: err.message });
    } finally {
      setResending(false);
    }
  }

  const isApproved = detail?.status === "APPROVED" || approvedFlag;
  const isRejected = detail?.status === "REJECTED" || rejectedFlag;
  const isCancellation = detail?.request_type === "CANCELLATION";
  const isCoverageTargetType = COVERAGE_TARGET_CHANGE_TYPES.has(changeType);
  const isAddCoverageType = changeType === "ADD_COVERAGE";

  return (
    <Dialog open={Boolean(endorsementId)} onClose={onClose} fullWidth maxWidth="xl" scroll="paper">
      <DialogTitle>{endorsementNumber ? `Review Endorsement ${endorsementNumber}` : "Review Endorsement"}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "flex", gap: 3, flexDirection: { xs: "column", md: "row" } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <PdfViewer url={pdfUrl} loading={pdfLoading} error={pdfError} height="75vh" />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" startIcon={<PrintIcon />} onClick={() => window.open(pdfUrl, "_blank")} disabled={!pdfUrl}>
                Re-export PDF
              </Button>
              <Button size="small" startIcon={<EmailIcon />} onClick={handleResend} disabled={resending}>
                {resending ? "Sending..." : "Resend to client"}
              </Button>
            </Stack>
            {resendResult && (
              <Alert severity={resendResult.severity} sx={{ mt: 1 }} onClose={() => setResendResult(null)}>
                {resendResult.message}
              </Alert>
            )}
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
                {isApproved && (
                  <Alert severity="success">
                    {isCancellation ? "This policy cancellation has been approved." : "This endorsement has been approved."}
                  </Alert>
                )}
                {isRejected && !isApproved && <Alert severity="error">This endorsement has been rejected.</Alert>}
                {isCancellation && !isApproved && !isRejected && (
                  <Alert severity="warning">
                    This is a policy cancellation request — it cannot be edited. Approve or reject it as filed.
                  </Alert>
                )}

                <Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {detail.insured_name} — {detail.class_name} / {detail.variant_name}
                    </Typography>
                    {isCancellation && <Chip size="small" color="error" label="Cancellation" />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Policy {detail.policy_number} — effective {fmtDateTime(detail.effective_date)}
                  </Typography>
                </Box>

                <Divider />

                <Box>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Amendments
                    </Typography>
                    {!isApproved && !isRejected && !isCancellation && (
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => {
                          if (formOpen) {
                            setFormOpen(false);
                            resetForm();
                          } else {
                            resetForm();
                            setFormOpen(true);
                          }
                        }}
                      >
                        {formOpen ? "Cancel" : "Add Change"}
                      </Button>
                    )}
                  </Stack>

                  {detail.changes.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No changes on this endorsement.
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Type</TableCell>
                          <TableCell>Applies to</TableCell>
                          <TableCell>From</TableCell>
                          <TableCell>To</TableCell>
                          <TableCell>Remarks</TableCell>
                          {!isApproved && !isRejected && !isCancellation && <TableCell align="right">Actions</TableCell>}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detail.changes.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Chip
                                size="small"
                                color={c.change_type === "ADD_COVERAGE" ? "success" : c.change_type === "REMOVE_CLAUSE" ? "warning" : "default"}
                                label={c.change_type === "CANCEL_POLICY" ? CANCEL_POLICY_LABEL : CHANGE_TYPE_LABELS[c.change_type] || c.change_type}
                              />
                            </TableCell>
                            <TableCell>{c.vehicle_label || c.coverage_label || "—"}</TableCell>
                            <TableCell sx={{ maxWidth: 140, whiteSpace: "pre-wrap" }}>{c.change_from || "—"}</TableCell>
                            <TableCell sx={{ maxWidth: 200, whiteSpace: "pre-wrap" }}>{c.change_to || "—"}</TableCell>
                            <TableCell>{c.remarks || "—"}</TableCell>
                            {!isApproved && !isRejected && !isCancellation && (
                              <TableCell align="right">
                                <Tooltip title="Edit">
                                  <IconButton size="small" onClick={() => startEdit(c)}>
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Remove">
                                  <span>
                                    <IconButton size="small" onClick={() => handleDeleteChange(c.id)} disabled={deletingId === c.id}>
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </TableCell>
                            )}
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
                            disabled={Boolean(editingChangeId)}
                          >
                            {Object.entries(CHANGE_TYPE_LABELS).map(([value, label]) => (
                              <MenuItem key={value} value={value}>
                                {label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        {(VEHICLE_CHANGE_TYPES.has(changeType) || (isAddCoverageType && detail.class_name === "Motor")) && (
                          <FormControl fullWidth size="small">
                            <InputLabel>Vehicle</InputLabel>
                            <Select label="Vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                              {(detail.vehicles || []).map((v) => (
                                <MenuItem key={v.id} value={v.id}>
                                  {v.label}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}

                        {isCoverageTargetType && (
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

                        {isAddCoverageType && (
                          <FormControl fullWidth size="small">
                            <InputLabel>Coverage to Add</InputLabel>
                            <Select label="Coverage to Add" value={productCoverageId} onChange={(e) => setProductCoverageId(e.target.value)}>
                              {(detail.available_coverages || []).map((c) => (
                                <MenuItem key={c.id} value={c.id}>
                                  {c.coverage_name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}

                        {changeType && !isAddCoverageType && changeType !== "INSURED_ADDRESS_DETAILS" && (
                          <TextField
                            label="Current value"
                            value={currentValueFor()}
                            size="small"
                            fullWidth
                            multiline={changeType === "EDIT_CLAUSE"}
                            maxRows={4}
                            disabled
                          />
                        )}
                        {changeType === "INSURED_ADDRESS_DETAILS" && (
                          <TextField label="Current address" value={detail.insured_address || "—"} size="small" fullWidth disabled />
                        )}

                        {changeType === "POLICY_EFFECTIVE_DATE" ? (
                          <TextField
                            label="New effective date"
                            type="date"
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            size="small"
                            fullWidth
                            slotProps={{ inputLabel: { shrink: true } }}
                          />
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
                        ) : changeType === "REMOVE_CLAUSE" ? (
                          <Alert severity="warning">
                            This permanently removes the coverage from the policy and debits the agent's payable ledger by that
                            coverage's own margin.
                          </Alert>
                        ) : isAddCoverageType ? (
                          <Stack spacing={2}>
                            <NumberField
                              label="Coverage Amount"
                              value={coverageAmount}
                              onChange={setCoverageAmount}
                              size="small"
                              fullWidth
                              helperText="Ignored for a coverage priced automatically off the vehicle's value"
                            />
                            <NumberField label="Premium Amount" value={premiumAmount} onChange={setPremiumAmount} size="small" fullWidth />
                          </Stack>
                        ) : (
                          changeType && (
                            <TextField
                              label={changeType === "EDIT_CLAUSE" ? "New clause text" : changeType === "INSURED_NAME_DETAILS" ? "New name" : "New value"}
                              value={newValue}
                              onChange={(e) => setNewValue(e.target.value)}
                              size="small"
                              fullWidth
                              multiline={changeType === "EDIT_CLAUSE"}
                              maxRows={4}
                            />
                          )
                        )}

                        {changeType && (
                          <TextField
                            label="Remarks (optional)"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            size="small"
                            fullWidth
                          />
                        )}

                        {changeType && (
                          <Box>
                            <Button variant="contained" size="small" onClick={handleSaveChange} disabled={savingChange}>
                              {savingChange ? "Saving..." : editingChangeId ? "Save Edit" : "Add Change"}
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
                      <FormControlLabel
                        control={<Checkbox checked={confirmApprove} onChange={(e) => setConfirmApprove(e.target.checked)} />}
                        label={
                          isCancellation
                            ? "I have reviewed this cancellation request and confirm it should be approved. This will cancel the policy and debit the agent's payable ledger accordingly."
                            : "I have reviewed this endorsement and every amendment above, and confirm it should be approved."
                        }
                      />
                    </Box>

                    <Divider />
                    <Box>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: rejectOpen ? 1 : 0 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          Reject Endorsement
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
