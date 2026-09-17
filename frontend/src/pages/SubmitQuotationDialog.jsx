import { useEffect, useState } from "react";
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
  MenuItem,
  Alert,
  CircularProgress,
  Button,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { getQuotation, listPaymentMethods, previewApplicationPdf, submitQuotation } from "../api/client";
import { formatPHP } from "../utils/currency";
import { PdfViewer } from "../components/PdfViewer";

// Converts a saved quotation into a policy application. The quotation
// already carries everything an application needs except payment info (a
// quotation never collects it — nothing was being paid for yet), so this
// dialog only asks for that, previews the resulting policy schedule, and
// only then actually submits — mirroring the same preview-before-commit
// pattern PolicyApplication.jsx's own submit flow already uses.
export function SubmitQuotationDialog({ quotationId, token, onClose, onSubmitted }) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [bethelPaymentMethods, setBethelPaymentMethods] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentRemittance, setPaymentRemittance] = useState("");
  const [bethelPaymentMethodId, setBethelPaymentMethodId] = useState("");
  const [sendPolicyToEmail, setSendPolicyToEmail] = useState(true);
  const [sendPolicyToEmailOnApproval, setSendPolicyToEmailOnApproval] = useState(true);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewPdfError, setPreviewPdfError] = useState("");

  useEffect(() => {
    if (!quotationId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([getQuotation(token, quotationId), listPaymentMethods(token)])
      .then(([q, methods]) => {
        if (cancelled) return;
        setDetail(q);
        setBethelPaymentMethods(methods);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [quotationId, token]);

  function buildPreviewProps() {
    return {
      applicationNumber: "TO BE ASSIGNED ON SUBMISSION",
      isPreview: true,
      classNameLabel: detail.class_name,
      variantName: detail.variant_name,
      insuredName: detail.insured_name,
      insuredAddress: detail.insured_address,
      agentCode: detail.agent_code,
      coverageStartAt: detail.coverage_start_at,
      coverageEndAt: detail.coverage_end_at,
      // documentPreviewPropsSchema's vehicle fields are optional strings —
      // they accept being omitted, but not an explicit null, which is
      // exactly what a DB-backed nullable column with nothing set comes
      // back as.
      vehicles: detail.vehicles.map((v) => ({
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
      coverages: detail.coverages.map((c) => ({
        name: c.name,
        clause: c.clause,
        amount: c.amount,
        premium: c.premium,
        pricing_mode: c.pricing_mode,
      })),
      deductibleRate: detail.deductible_rate,
      totalPremium: detail.total_premium,
      docStamps: detail.doc_stamps,
      vat: detail.vat,
      lgt: detail.lgt,
      misc: detail.misc,
      totalAmount: detail.total_amount,
      remarks: detail.remarks || "",
      renewingPolicyNumber: detail.renewed_policy_number || undefined,
    };
  }

  function handleOpenPreview(e) {
    e.preventDefault();
    setError("");
    if (!paymentMethod) {
      setError("Select a payment method.");
      return;
    }
    if (!paymentRemittance) {
      setError("Select how payment will be remitted.");
      return;
    }
    if (paymentRemittance === "DIRECT_TO_BETHEL" && !bethelPaymentMethodId) {
      setError("Select Bethel's payment method.");
      return;
    }
    setConfirmChecked(false);
    setPreviewOpen(true);
  }

  useEffect(() => {
    if (!previewOpen) return;
    let cancelled = false;
    let objectUrl = null;
    setPreviewPdfLoading(true);
    setPreviewPdfError("");
    previewApplicationPdf(token, buildPreviewProps())
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

  async function handleConfirmSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const application = await submitQuotation(token, quotationId, {
        payment_method: paymentMethod,
        payment_remittance: paymentRemittance,
        bethel_payment_method_id: paymentRemittance === "DIRECT_TO_BETHEL" ? bethelPaymentMethodId : undefined,
        send_policy_to_email: sendPolicyToEmail,
        send_policy_to_email_on_approval: sendPolicyToEmailOnApproval,
      });
      onSubmitted?.(application);
      onClose();
    } catch (err) {
      setError(err.message);
      setPreviewOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={Boolean(quotationId)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {detail ? `Submit ${detail.quotation_number} as Policy Application` : "Submit as Policy Application"}
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
          <Stack spacing={2} component="form" onSubmit={handleOpenPreview}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2" color="text.secondary">
              This will file a new policy application for {detail.insured_name} using this quotation's coverages and
              pricing exactly as quoted &mdash; total premium <strong>{formatPHP(detail.total_premium)}</strong>. The
              quotation can no longer be edited once submitted.
            </Typography>

            <FormControlLabel
              control={
                <Checkbox
                  checked={sendPolicyToEmail}
                  onChange={(e) => setSendPolicyToEmail(e.target.checked)}
                />
              }
              label="Email the customer now that the application is under approval (with payment instructions)"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={sendPolicyToEmailOnApproval}
                  onChange={(e) => setSendPolicyToEmailOnApproval(e.target.checked)}
                />
              }
              label="Email the customer their approved policy once this application is approved"
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
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleOpenPreview} disabled={loading || !detail}>
          Preview application
        </Button>
      </DialogActions>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Preview policy application</DialogTitle>
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
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)} disabled={submitting}>
            Back
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmSubmit}
            disabled={!confirmChecked || submitting || previewPdfLoading}
          >
            {submitting ? "Submitting..." : "Confirm and submit"}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
