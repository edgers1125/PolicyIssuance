import { useEffect, useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Box, Button } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { PdfViewer } from "./PdfViewer";
import { downloadPolicyPdf } from "../api/client";

// The Client Policies page's row-detail popup — much simpler than
// ApplicationDetailDialog/ApplicationReviewDialog since an issued Policy has
// no change history and no resend-to-client action, just its own final,
// signed PDF (pdf/policyPdf.js on the backend) to view/print.
export function PolicyDetailDialog({ policyId, policyNumber, token, onClose }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState("");

  useEffect(() => {
    if (!policyId) return;
    let cancelled = false;
    let objectUrl = null;
    setPdfLoading(true);
    setPdfError("");
    setPdfUrl(null);

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

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [policyId, token]);

  return (
    <Dialog open={Boolean(policyId)} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{policyNumber ? `Policy ${policyNumber}` : "Policy"}</DialogTitle>
      <DialogContent>
        <Box sx={{ my: 1 }}>
          <PdfViewer url={pdfUrl} loading={pdfLoading} error={pdfError} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.open(pdfUrl, "_blank")} disabled={!pdfUrl}>
          Print / Save as PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
