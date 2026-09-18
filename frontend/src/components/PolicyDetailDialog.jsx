import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EmailIcon from "@mui/icons-material/Email";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import KeyboardDoubleArrowDownIcon from "@mui/icons-material/KeyboardDoubleArrowDown";
import {
  downloadPolicyPdf,
  resendPolicyEmail,
  listEndorsementsForPolicy,
  getEndorsementContext,
  previewEndorsementPdf,
  createEndorsementRequest,
  downloadEndorsementPdf,
} from "../api/client";
import { PdfViewer } from "./PdfViewer";
import { NumberField } from "./NumberField";
import { formatPHP } from "../utils/currency";
import { useAuth } from "../context/AuthContext";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";
import {
  CHANGE_TYPE_LABELS,
  VEHICLE_FIELD_BY_CHANGE_TYPE,
  VEHICLE_CHANGE_TYPES,
  COVERAGE_TARGET_CHANGE_TYPES,
} from "./EndorsementReviewDialog";

const ENDORSEMENT_STATUS_LABELS = { SUBMITTED: "Submitted", APPROVED: "Approved", REJECTED: "Rejected" };
const ENDORSEMENT_STATUS_COLORS = { SUBMITTED: "info", APPROVED: "success", REJECTED: "error" };

const EMPTY_ADDRESS_FIELDS = {
  address_line_1: "",
  address_line_2: "",
  barangay: "",
  city: "",
  province: "",
  postal_code: "",
  country: "",
};

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function todayDateInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The Client Policies page's row-detail popup — a two-pane dialog (the
// policy's own signed PDF on the left, policy info + endorsement history +
// "Create Endorsement Request" composer on the right), mirroring
// ApplicationReviewDialog.jsx's own shape. Filing an endorsement never edits
// this Policy directly for a plain correction — see
// backend/src/routes/endorsements.js — but an ADD_COVERAGE/REMOVE_CLAUSE
// line or a CANCELLATION request now does have a real, permanent effect once
// approved (a new/removed PolicyCoverage row, or the policy itself being
// cancelled), so this dialog's own PDF only ever changes once an endorsement
// is later approved (fetched fresh on reopen). A composed batch of changes is
// queued client-side and sent together in one POST /endorsements call;
// "Preview changes" (required before "Confirm and file", same gate every
// other create flow in this app uses) renders the pending batch via
// POST /endorsements/preview-pdf, and a successful file opens a third,
// read-only dialog showing the just-created endorsement's own PDF — the
// "here's your endorsement" popup. The lower-left action bar (Export PDF /
// Resend to client / Renew This Policy) mirrors the Client Policies table's
// own Actions column, so those three actions are reachable from inside the
// detail popup too, not just the row.
export function PolicyDetailDialog({ open, policyId, policyNumber, token, onClose }) {
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const canCreateEndorsement = permissions?.includes("VIEW_POLICIES.CREATE_ENDORSEMENT");
  // On a phone, the PDF pane and the endorsements pane stack vertically
  // (see the flexDirection breakpoint below) — the PDF alone can fill the
  // whole viewport, so without a visible cue the endorsement history/
  // "Create Endorsement Request" panel underneath is easy to miss entirely.
  // endorsementsSectionRef backs a mobile-only "jump to endorsements" button
  // right under the PDF's own action row.
  const endorsementsSectionRef = useRef(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState("");

  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [viewingHistoryId, setViewingHistoryId] = useState(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [context, setContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");

  const [requestType, setRequestType] = useState("CORRECTION");
  const [effectiveDate, setEffectiveDate] = useState(todayDateInput());
  const [remarks, setRemarks] = useState("");
  const [sendOnFile, setSendOnFile] = useState(false);
  const [sendOnApproval, setSendOnApproval] = useState(false);
  const [queuedChanges, setQueuedChanges] = useState([]);

  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [changeType, setChangeType] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [coverageId, setCoverageId] = useState("");
  const [productCoverageId, setProductCoverageId] = useState("");
  const [coverageAmount, setCoverageAmount] = useState("");
  const [premiumAmount, setPremiumAmount] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addressFields, setAddressFields] = useState(EMPTY_ADDRESS_FIELDS);
  const [lineRemarks, setLineRemarks] = useState("");
  const [lineError, setLineError] = useState("");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [confirmFile, setConfirmFile] = useState(false);
  const [filing, setFiling] = useState(false);
  const [fileError, setFileError] = useState("");

  const [resultOpen, setResultOpen] = useState(false);
  const [resultUrl, setResultUrl] = useState(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultError, setResultError] = useState("");
  const [resultNumber, setResultNumber] = useState("");

  function loadHistory() {
    setHistoryLoading(true);
    setHistoryError("");
    return listEndorsementsForPolicy(token, policyId)
      .then((rows) => setHistory(rows))
      .catch((err) => setHistoryError(err.message))
      .finally(() => setHistoryLoading(false));
  }

  useEffect(() => {
    if (!policyId) return;
    let cancelled = false;
    let objectUrl = null;
    setPdfLoading(true);
    setPdfError("");
    setPdfUrl(null);
    setResendResult(null);
    downloadPolicyPdf(token, policyId)
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

    loadHistory();
    setComposerOpen(false);
    setContext(null);
    resetComposer();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId, token]);

  async function handleResend() {
    setResending(true);
    setResendResult(null);
    try {
      const res = await resendPolicyEmail(token, policyId);
      setResendResult({ severity: "success", message: `Policy resent to ${res.to}.` });
    } catch (err) {
      setResendResult({ severity: "error", message: err.message });
    } finally {
      setResending(false);
    }
  }

  // Opens the Policy Applications tracker's "New Application" wizard,
  // pre-filled from this policy — mirrors ClientPolicies.jsx's own table
  // Actions column action (see PolicyApplications.jsx's ?renew= handling).
  function handleRenew() {
    onClose?.();
    navigate(`/policy-application?renew=${policyId}`);
  }

  function resetComposer() {
    setRequestType("CORRECTION");
    setEffectiveDate(todayDateInput());
    setRemarks("");
    setSendOnFile(false);
    setSendOnApproval(false);
    setQueuedChanges([]);
    resetLineForm();
    setFileError("");
    setConfirmFile(false);
  }

  function resetLineForm() {
    setLineFormOpen(false);
    setChangeType("");
    setVehicleId("");
    setCoverageId("");
    setProductCoverageId("");
    setCoverageAmount("");
    setPremiumAmount("");
    setNewValue("");
    setAddressFields(EMPTY_ADDRESS_FIELDS);
    setLineRemarks("");
    setLineError("");
  }

  function openComposer() {
    setComposerOpen(true);
    if (!context) {
      setContextLoading(true);
      setContextError("");
      getEndorsementContext(token, policyId)
        .then((c) => setContext(c))
        .catch((err) => setContextError(err.message))
        .finally(() => setContextLoading(false));
    }
  }

  function handleChangeTypeChange(type) {
    setChangeType(type);
    setLineError("");
    setVehicleId(VEHICLE_CHANGE_TYPES.has(type) && context?.vehicles?.length === 1 ? context.vehicles[0].id : "");
    setCoverageId(COVERAGE_TARGET_CHANGE_TYPES.has(type) && context?.coverages?.length === 1 ? context.coverages[0].id : "");
    setProductCoverageId("");
    setCoverageAmount("");
    setPremiumAmount("");
    setNewValue(type === "POLICY_EFFECTIVE_DATE" ? context?.current_effective_date?.slice(0, 10) || "" : "");
  }

  function currentValueFor() {
    if (!context || !changeType) return "";
    if (changeType === "VEHICLE_ESTIMATED_VALUE") {
      const vehicle = context.vehicles.find((v) => v.id === vehicleId);
      return vehicle ? formatPHP(vehicle.estimated_value || 0) : "";
    }
    if (VEHICLE_CHANGE_TYPES.has(changeType)) {
      const vehicle = context.vehicles.find((v) => v.id === vehicleId);
      return vehicle ? vehicle[VEHICLE_FIELD_BY_CHANGE_TYPE[changeType]] || "—" : "";
    }
    if (changeType === "POLICY_EFFECTIVE_DATE") return fmtDate(context.current_effective_date);
    if (changeType === "INSURED_NAME_DETAILS") return context.insured_name || "—";
    if (changeType === "INSURED_ADDRESS_DETAILS") return context.insured_address || "—";
    if (changeType === "EDIT_CLAUSE") {
      const coverage = context.coverages.find((c) => c.id === coverageId);
      return coverage ? coverage.clause || "—" : "";
    }
    if (changeType === "REMOVE_CLAUSE") {
      const coverage = context.coverages.find((c) => c.id === coverageId);
      return coverage ? `Coverage Amount ${formatPHP(coverage.coverage_amount)} — Premium ${formatPHP(coverage.premium_amount)}` : "";
    }
    return "";
  }

  function handleAddQueuedChange() {
    setLineError("");
    if (!changeType) {
      setLineError("Select a change type");
      return;
    }
    if (VEHICLE_CHANGE_TYPES.has(changeType) && !vehicleId) {
      setLineError("Select which vehicle this change applies to");
      return;
    }
    if (COVERAGE_TARGET_CHANGE_TYPES.has(changeType) && !coverageId) {
      setLineError("Select which coverage this change applies to");
      return;
    }

    const entry = {
      change_type: changeType,
      policy_vehicle_id: VEHICLE_CHANGE_TYPES.has(changeType) || changeType === "ADD_COVERAGE" ? vehicleId || undefined : undefined,
      policy_coverage_id: COVERAGE_TARGET_CHANGE_TYPES.has(changeType) ? coverageId : undefined,
      remarks: lineRemarks || undefined,
    };

    let displayTarget = "";
    let displayTo = "";

    if (changeType === "ADD_COVERAGE") {
      if (!productCoverageId) {
        setLineError("Select which coverage to add");
        return;
      }
      if (context.class_name === "Motor" && !vehicleId) {
        setLineError("Select which vehicle this coverage applies to");
        return;
      }
      if (!coverageAmount || Number(coverageAmount) <= 0) {
        setLineError("Enter a coverage amount");
        return;
      }
      if (!premiumAmount || Number(premiumAmount) <= 0) {
        setLineError("Enter a premium amount");
        return;
      }
      entry.product_coverage_id = productCoverageId;
      entry.coverage_amount = Number(coverageAmount);
      entry.premium_amount = Number(premiumAmount);
      const coverageName = context.available_coverages.find((c) => c.id === productCoverageId)?.coverage_name || "";
      displayTarget = context.vehicles.find((v) => v.id === vehicleId)?.label || "";
      displayTo = `Add ${coverageName} — Amount ${formatPHP(entry.coverage_amount)}, Premium ${formatPHP(entry.premium_amount)}`;
    } else if (changeType === "REMOVE_CLAUSE") {
      const coverage = context.coverages.find((c) => c.id === coverageId);
      displayTarget = coverage?.name || "";
      displayTo = "Coverage removed";
    } else if (changeType === "INSURED_ADDRESS_DETAILS") {
      if (!addressFields.address_line_1.trim() || !addressFields.city.trim() || !addressFields.province.trim()) {
        setLineError("Address line 1, city, and province are required");
        return;
      }
      entry.new_address = {
        address_line_1: addressFields.address_line_1.trim(),
        address_line_2: addressFields.address_line_2.trim(),
        barangay: addressFields.barangay.trim(),
        city: addressFields.city.trim(),
        province: addressFields.province.trim(),
        postal_code: addressFields.postal_code.trim(),
        country: addressFields.country.trim(),
      };
      displayTo = [entry.new_address.address_line_1, entry.new_address.city, entry.new_address.province].filter(Boolean).join(", ");
    } else if (changeType === "VEHICLE_ESTIMATED_VALUE") {
      if (newValue === "" || Number.isNaN(Number(newValue)) || Number(newValue) < 0) {
        setLineError("Enter a valid, non-negative estimated value");
        return;
      }
      entry.new_value = String(newValue);
      displayTo = formatPHP(Number(newValue));
    } else {
      if (!newValue.trim()) {
        setLineError("Enter the new value");
        return;
      }
      entry.new_value = newValue;
      displayTo = newValue;
    }

    if (VEHICLE_CHANGE_TYPES.has(changeType)) {
      displayTarget = context.vehicles.find((v) => v.id === vehicleId)?.label || "";
    } else if (COVERAGE_TARGET_CHANGE_TYPES.has(changeType)) {
      displayTarget = context.coverages.find((c) => c.id === coverageId)?.name || "";
    }

    setQueuedChanges((rows) => [
      ...rows,
      { ...entry, _key: `${Date.now()}-${rows.length}`, _display: { target: displayTarget, from: currentValueFor(), to: displayTo } },
    ]);
    resetLineForm();
  }

  function removeQueuedChange(key) {
    setQueuedChanges((rows) => rows.filter((r) => r._key !== key));
  }

  function apiChanges() {
    return requestType === "CANCELLATION" ? [] : queuedChanges.map(({ _key, _display, ...rest }) => rest);
  }

  const canPreview = requestType === "CANCELLATION" ? Boolean(remarks.trim()) : queuedChanges.length > 0;

  async function handlePreview() {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewUrl(null);
    setConfirmFile(false);
    try {
      const blob = await previewEndorsementPdf(token, {
        policy_id: policyId,
        request_type: requestType,
        effective_date: effectiveDate,
        remarks: remarks || undefined,
        changes: apiChanges(),
      });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleConfirmFile() {
    setFiling(true);
    setFileError("");
    try {
      const created = await createEndorsementRequest(token, {
        policy_id: policyId,
        request_type: requestType,
        effective_date: effectiveDate,
        remarks: remarks || undefined,
        send_policy_to_email: sendOnFile,
        send_policy_to_email_on_approval: sendOnApproval,
        changes: apiChanges(),
      });
      setPreviewOpen(false);
      setComposerOpen(false);
      resetComposer();
      setContext(null);
      await loadHistory();

      setResultOpen(true);
      setResultNumber(created.endorsement_number);
      setResultLoading(true);
      setResultError("");
      try {
        const blob = await downloadEndorsementPdf(token, created.id);
        setResultUrl(URL.createObjectURL(blob));
      } catch (err) {
        setResultError(err.message);
      } finally {
        setResultLoading(false);
      }
    } catch (err) {
      setFileError(err.message);
    } finally {
      setFiling(false);
    }
  }

  async function handleViewHistoryPdf(id) {
    setViewingHistoryId(id);
    try {
      const blob = await downloadEndorsementPdf(token, id);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setViewingHistoryId(null);
    }
  }

  const isCoverageTargetType = COVERAGE_TARGET_CHANGE_TYPES.has(changeType);
  const isAddCoverageType = changeType === "ADD_COVERAGE";
  const isCancellation = requestType === "CANCELLATION";

  // Unsaved-input tracking (see context/UnsavedChangesContext.jsx) — this
  // dialog stays mounted (keepMounted below, split open+id state on the host
  // page) and keeps its endorsement composer draft across a Cancel/X/backdrop
  // close, so the sidebar/refresh guard needs to know whenever the composer
  // (its header fields, its queued changes, or its own in-progress line form)
  // actually diverges from resetComposer()'s defaults.
  const lineFormHasInput = Boolean(
    changeType ||
      vehicleId ||
      coverageId ||
      productCoverageId ||
      coverageAmount ||
      premiumAmount ||
      newValue.trim() ||
      Object.values(addressFields).some((v) => v.trim()) ||
      lineRemarks.trim()
  );
  const isComposerDirty =
    composerOpen &&
    (requestType !== "CORRECTION" ||
      effectiveDate !== todayDateInput() ||
      remarks.trim() !== "" ||
      sendOnFile ||
      sendOnApproval ||
      queuedChanges.length > 0 ||
      (lineFormOpen && lineFormHasInput));
  useUnsavedChanges("policy-detail-dialog", open && isComposerDirty);

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl" scroll="paper" keepMounted>
        <DialogTitle>{policyNumber ? `Policy ${policyNumber}` : "Policy"}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "flex", gap: 3, flexDirection: { xs: "column", md: "row" } }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {/* Above the PDF, not below it — with the preview itself
                  standing 75vh tall on desktop, an action bar placed after
                  it used to fall below the dialog's own visible area,
                  needing a full scroll past the preview (and, on desktop,
                  past the Endorsement History pane's own height too) before
                  "Export PDF" was even visible. Putting it here means it's
                  on screen the instant the dialog opens. */}
              <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap" }}>
                <Button size="small" startIcon={<PrintIcon />} onClick={() => window.open(pdfUrl, "_blank")} disabled={!pdfUrl}>
                  Export PDF
                </Button>
                <Button size="small" startIcon={<EmailIcon />} onClick={handleResend} disabled={resending}>
                  {resending ? "Sending..." : "Resend to client"}
                </Button>
                <Button size="small" startIcon={<AutorenewIcon />} onClick={handleRenew}>
                  Renew This Policy
                </Button>
              </Stack>
              {resendResult && (
                <Alert severity={resendResult.severity} sx={{ mb: 1 }} onClose={() => setResendResult(null)}>
                  {resendResult.message}
                </Alert>
              )}
              <PdfViewer url={pdfUrl} loading={pdfLoading} error={pdfError} height={{ xs: "42vh", md: "75vh" }} />
              {/* Phone-only: the two panes stack vertically here (see this
                  Box's parent flexDirection), and the PDF actions above can
                  otherwise look like the end of the dialog's content — this
                  makes it obvious there's an Endorsement History/"Create
                  Endorsement Request" panel to scroll to right below. */}
              <Button
                fullWidth
                size="small"
                color="inherit"
                endIcon={<KeyboardDoubleArrowDownIcon />}
                onClick={() => endorsementsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                sx={{ display: { xs: "flex", md: "none" }, mt: 1.5, color: "text.secondary" }}
              >
                Endorsement History &amp; Requests
              </Button>
            </Box>

            <Box
              ref={endorsementsSectionRef}
              sx={{ flex: 1, minWidth: 0, maxHeight: { xs: "none", md: "75vh" }, overflowY: { xs: "visible", md: "auto" }, pr: 0.5 }}
            >
              <Stack spacing={2.5}>
                <Box>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Endorsement History
                    </Typography>
                    {!composerOpen && canCreateEndorsement && (
                      <Button size="small" startIcon={<AddIcon />} onClick={openComposer}>
                        Create Endorsement Request
                      </Button>
                    )}
                  </Stack>

                  {historyLoading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : historyError ? (
                    <Alert severity="error">{historyError}</Alert>
                  ) : history.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No endorsements have been filed against this policy yet.
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>No.</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Effective</TableCell>
                          <TableCell>Changes</TableCell>
                          <TableCell align="right">PDF</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {history.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell>{h.endorsement_number}</TableCell>
                            <TableCell>
                              {h.request_type === "CANCELLATION" ? (
                                <Chip size="small" color="error" label="Cancellation" />
                              ) : (
                                "Correction"
                              )}
                            </TableCell>
                            <TableCell>
                              <Chip size="small" label={ENDORSEMENT_STATUS_LABELS[h.status] || h.status} color={ENDORSEMENT_STATUS_COLORS[h.status] || "default"} />
                            </TableCell>
                            <TableCell>{fmtDate(h.effective_date)}</TableCell>
                            <TableCell>{h.change_count}</TableCell>
                            <TableCell align="right">
                              <Tooltip title="View PDF">
                                <span>
                                  <IconButton size="small" onClick={() => handleViewHistoryPdf(h.id)} disabled={viewingHistoryId === h.id}>
                                    <VisibilityIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Box>

                {composerOpen && (
                  <>
                    <Divider />
                    <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                        New Endorsement Request
                      </Typography>

                      {contextLoading ? (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                          <CircularProgress size={24} />
                        </Box>
                      ) : contextError ? (
                        <Alert severity="error">{contextError}</Alert>
                      ) : (
                        <Stack spacing={2}>
                          {fileError && <Alert severity="error">{fileError}</Alert>}

                          <ToggleButtonGroup
                            color="primary"
                            size="small"
                            exclusive
                            fullWidth
                            value={requestType}
                            onChange={(e, value) => value && setRequestType(value)}
                          >
                            <ToggleButton value="CORRECTION">File a Correction</ToggleButton>
                            <ToggleButton value="CANCELLATION" color="error">
                              Cancel This Policy
                            </ToggleButton>
                          </ToggleButtonGroup>

                          {isCancellation && (
                            <Alert severity="warning">
                              Cancelling this policy is irreversible once approved — it will debit the agent's payable ledger by a
                              day-prorated portion of the commission already earned on it, and no further endorsements can be filed
                              afterward.
                            </Alert>
                          )}

                          <TextField
                            label={isCancellation ? "Cancellation effective date" : "Effective date"}
                            type="date"
                            value={effectiveDate}
                            onChange={(e) => setEffectiveDate(e.target.value)}
                            size="small"
                            fullWidth
                            slotProps={{ inputLabel: { shrink: true } }}
                          />

                          {isCancellation ? (
                            <TextField
                              label="Reason for cancellation"
                              value={remarks}
                              onChange={(e) => setRemarks(e.target.value)}
                              size="small"
                              fullWidth
                              multiline
                              minRows={2}
                              required
                            />
                          ) : (
                            <>
                              <Box>
                                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    Amendments ({queuedChanges.length})
                                  </Typography>
                                  {!lineFormOpen && (
                                    <Button size="small" startIcon={<AddIcon />} onClick={() => setLineFormOpen(true)}>
                                      Add Change
                                    </Button>
                                  )}
                                </Stack>

                                {queuedChanges.length > 0 && (
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Applies to</TableCell>
                                        <TableCell>From</TableCell>
                                        <TableCell>To</TableCell>
                                        <TableCell align="right"></TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {queuedChanges.map((c) => (
                                        <TableRow key={c._key}>
                                          <TableCell>
                                            <Chip size="small" label={CHANGE_TYPE_LABELS[c.change_type] || c.change_type} />
                                          </TableCell>
                                          <TableCell>{c._display.target || "—"}</TableCell>
                                          <TableCell sx={{ maxWidth: 120, whiteSpace: "pre-wrap" }}>{c._display.from || "—"}</TableCell>
                                          <TableCell sx={{ maxWidth: 160, whiteSpace: "pre-wrap" }}>{c._display.to || "—"}</TableCell>
                                          <TableCell align="right">
                                            <IconButton size="small" onClick={() => removeQueuedChange(c._key)}>
                                              <DeleteIcon fontSize="small" />
                                            </IconButton>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                )}

                                {lineFormOpen && (
                                  <Box sx={{ mt: 1.5, p: 1.5, border: "1px dashed", borderColor: "divider", borderRadius: 2 }}>
                                    <Stack spacing={1.5}>
                                      {lineError && <Alert severity="error">{lineError}</Alert>}

                                      <FormControl fullWidth size="small">
                                        <InputLabel>Change Type</InputLabel>
                                        <Select label="Change Type" value={changeType} onChange={(e) => handleChangeTypeChange(e.target.value)}>
                                          {Object.entries(CHANGE_TYPE_LABELS).map(([value, label]) => (
                                            <MenuItem key={value} value={value}>
                                              {label}
                                            </MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>

                                      {(VEHICLE_CHANGE_TYPES.has(changeType) || (isAddCoverageType && context.class_name === "Motor")) && (
                                        <FormControl fullWidth size="small">
                                          <InputLabel>Vehicle</InputLabel>
                                          <Select label="Vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                                            {(context.vehicles || []).map((v) => (
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
                                            {(context.coverages || []).map((c) => (
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
                                            {(context.available_coverages || []).map((c) => (
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
                                        <TextField label="Current address" value={context.insured_address || "—"} size="small" fullWidth disabled />
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
                                              label="Barangay"
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
                                              label="Postal code"
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
                                          This permanently removes the coverage from the policy and debits the agent's payable ledger by
                                          that coverage's own margin.
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
                                      ) : changeType === "VEHICLE_ESTIMATED_VALUE" ? (
                                        <NumberField
                                          label="New estimated value"
                                          value={newValue}
                                          onChange={setNewValue}
                                          size="small"
                                          fullWidth
                                          helperText="Recomputes this vehicle's value-based coverage on this policy, preserving the agent's own margin"
                                        />
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
                                          value={lineRemarks}
                                          onChange={(e) => setLineRemarks(e.target.value)}
                                          size="small"
                                          fullWidth
                                        />
                                      )}

                                      <Stack direction="row" spacing={1}>
                                        <Button variant="contained" size="small" onClick={handleAddQueuedChange} disabled={!changeType}>
                                          Add to Endorsement
                                        </Button>
                                        <Button size="small" onClick={resetLineForm}>
                                          Cancel
                                        </Button>
                                      </Stack>
                                    </Stack>
                                  </Box>
                                )}
                              </Box>

                              <TextField label="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} size="small" fullWidth />
                            </>
                          )}

                          <FormControlLabel
                            control={<Checkbox checked={sendOnFile} onChange={(e) => setSendOnFile(e.target.checked)} />}
                            label={isCancellation ? "Email the customer now that this cancellation has been filed" : "Email the customer now that this endorsement request has been filed"}
                          />
                          <FormControlLabel
                            control={<Checkbox checked={sendOnApproval} onChange={(e) => setSendOnApproval(e.target.checked)} />}
                            label={isCancellation ? "Email the customer once this cancellation is approved" : "Email the customer once this endorsement is approved"}
                          />

                          <Stack direction="row" spacing={1}>
                            <Button variant="contained" color={isCancellation ? "error" : "primary"} onClick={handlePreview} disabled={!canPreview}>
                              Preview
                            </Button>
                            <Button
                              onClick={() => {
                                setComposerOpen(false);
                                resetComposer();
                              }}
                            >
                              Cancel
                            </Button>
                          </Stack>
                        </Stack>
                      )}
                    </Box>
                  </>
                )}
              </Stack>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{isCancellation ? "Preview Policy Cancellation" : "Preview Endorsement"}</DialogTitle>
        <DialogContent dividers>
          <PdfViewer url={previewUrl} loading={previewLoading} error={previewError} height="65vh" />
          {fileError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {fileError}
            </Alert>
          )}
          {!previewLoading && !previewError && (
            <FormControlLabel
              sx={{ mt: 2 }}
              control={<Checkbox checked={confirmFile} onChange={(e) => setConfirmFile(e.target.checked)} />}
              label={
                isCancellation
                  ? "I have double-checked the information above and confirm this policy should be cancelled."
                  : "I have double-checked the information above and confirm it is correct."
              }
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Back</Button>
          <Button
            variant="contained"
            color={isCancellation ? "error" : "primary"}
            onClick={handleConfirmFile}
            disabled={!confirmFile || filing || previewLoading || Boolean(previewError)}
          >
            {filing ? "Filing..." : isCancellation ? "Confirm Cancellation" : "Confirm and File"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={resultOpen} onClose={() => setResultOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{resultNumber ? `Endorsement ${resultNumber} Filed` : "Endorsement Filed"}</DialogTitle>
        <DialogContent dividers>
          <Alert severity="success" sx={{ mb: 2 }}>
            Your endorsement request has been filed and is now pending approval.
          </Alert>
          <PdfViewer url={resultUrl} loading={resultLoading} error={resultError} height="65vh" />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.open(resultUrl, "_blank")} disabled={!resultUrl}>
            Print / Save as PDF
          </Button>
          <Button variant="contained" onClick={() => setResultOpen(false)}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
