import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Alert,
  Button,
  Typography,
  Divider,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
} from "@mui/material";
import EmailIcon from "@mui/icons-material/Email";
import PrintIcon from "@mui/icons-material/Print";
import { PdfViewer } from "./PdfViewer";
import { listMyApplicationChanges } from "../api/client";

// Kept local rather than shared, same as ApplicationReviewDialog.jsx's own
// copy — mirrors the backend's ApplicationChangeType enum
// (backend/src/schemas/policyApplicationChanges.js) and nothing else on the
// frontend needs it.
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
  VEHICLE_ENGINE_NO: "Vehicle Motor No.",
  VEHICLE_CHASSIS_NO: "Vehicle Serial No.",
  ADD_CLAUSE: "Add Clause",
  REMOVE_CLAUSE: "Remove Clause",
};

function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Shared by PolicyApplications.jsx (an agent's own tracker) and
// PolicyApproval.jsx (the cross-agent approval queue) — the only real
// differences between the two are which (agent-scoped vs. not) backend
// endpoints the PDF/resend calls hit, passed in as downloadPdf/resendEmail,
// and whether "Resend to client" makes sense at all — an approver reviewing
// someone else's application has no business emailing the customer on the
// agent's behalf, so PolicyApproval.jsx passes showResend={false} and no
// resendEmail. applicationNumber comes straight from the row data the caller
// already has (no separate JSON detail fetch needed) — this dialog's only
// real job is to show the actual PDFKit-generated PDF, fetched once and
// reused for both the inline preview and "Re-export PDF" (same file, no
// second request). In practice this is only PolicyApplications.jsx now —
// PolicyApproval.jsx opens ApplicationReviewDialog.jsx instead — but the
// showResend/downloadPdf/resendEmail props are left generic rather than
// hardcoded to the agent-scoped endpoints.
//
// Also fetches this application's own recorded PolicyApplicationChange
// history (GET /policy-applications/:id/changes) and lists it read-only
// below the PDF — an agent needs to see what an approver has corrected on
// their filing, same list an approver sees in ApplicationReviewDialog.jsx,
// just without the "Create Change"/"Approve" actions that are approver-only.
export function ApplicationDetailDialog({
  applicationId,
  applicationNumber,
  token,
  onClose,
  downloadPdf,
  resendEmail,
  showResend = true,
}) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState("");
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState(null);
  // A plain ref guards re-entrancy synchronously — setResending(true) alone
  // isn't enough, since a fast double-click can fire both handleResend calls
  // before React commits the re-render that disables the button, sending two
  // real emails from one click.
  const resendInFlightRef = useRef(false);

  const [changes, setChanges] = useState([]);
  const [changesLoading, setChangesLoading] = useState(true);
  const [changesError, setChangesError] = useState("");

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    let objectUrl = null;
    setPdfLoading(true);
    setPdfError("");
    setPdfUrl(null);
    setResendResult(null);

    downloadPdf(token, applicationId)
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
  }, [applicationId, token, downloadPdf]);

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    setChangesLoading(true);
    setChangesError("");
    listMyApplicationChanges(token, applicationId)
      .then((data) => {
        if (!cancelled) setChanges(data);
      })
      .catch((err) => {
        if (!cancelled) setChangesError(err.message);
      })
      .finally(() => {
        if (!cancelled) setChangesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, token]);

  async function handleResend() {
    if (resendInFlightRef.current) return;
    resendInFlightRef.current = true;
    setResending(true);
    setResendResult(null);
    try {
      const res = await resendEmail(token, applicationId);
      setResendResult({ severity: "success", message: `Application resent to ${res.to}.` });
    } catch (err) {
      setResendResult({ severity: "error", message: err.message });
    } finally {
      resendInFlightRef.current = false;
      setResending(false);
    }
  }

  return (
    <Dialog open={Boolean(applicationId)} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{applicationNumber ? `Application ${applicationNumber}` : "Policy Application"}</DialogTitle>
      <DialogContent>
        <Box sx={{ my: 1 }}>
          <PdfViewer url={pdfUrl} loading={pdfLoading} error={pdfError} />
        </Box>

        {resendResult && (
          <Alert severity={resendResult.severity} sx={{ mb: 1 }}>
            {resendResult.message}
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Recorded Changes
        </Typography>
        {changesLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : changesError ? (
          <Alert severity="error">{changesError}</Alert>
        ) : changes.length === 0 ? (
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="outlined"
          startIcon={<PrintIcon />}
          onClick={() => window.open(pdfUrl, "_blank")}
          disabled={!pdfUrl}
        >
          Re-export PDF
        </Button>
        {showResend && (
          <Button
            variant="contained"
            startIcon={<EmailIcon />}
            onClick={handleResend}
            disabled={!pdfUrl || resending}
          >
            {resending ? "Sending..." : "Resend to client"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
