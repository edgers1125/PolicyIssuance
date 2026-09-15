import { useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Container,
  Typography,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TablePagination,
  Box,
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Chip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EmailIcon from "@mui/icons-material/Email";
import PrintIcon from "@mui/icons-material/Print";
import EditIcon from "@mui/icons-material/Edit";
import PublishIcon from "@mui/icons-material/Publish";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useAuth } from "../context/AuthContext";
import { listQuotations, resendQuotationEmail, downloadQuotationPdf } from "../api/client";
import { formatPHP } from "../utils/currency";
import { PdfViewer } from "../components/PdfViewer";
import { QuotationCreator } from "./QuotationCreator";
import { EditQuotationDialog } from "./EditQuotationDialog";
import { SubmitQuotationDialog } from "./SubmitQuotationDialog";

// A quotation's status is never stored — it's entirely derived from whether
// it's been converted into a policy application (see GET /policy-quotations'
// `status`/`converted_application_number` fields). FOR_ISSUANCE links
// straight to the resulting application on the Policy Applications page
// (?open=<id>, which that page reads to auto-open the same detail popup a
// row click would) so an agent/approver can jump from "what was quoted" to
// "what's actually being issued" in one click.
function QuotationStatus({ row }) {
  if (row.status !== "FOR_ISSUANCE") {
    return <Chip size="small" label="Submitted" color="info" />;
  }
  // A single clickable pill (rather than a chip plus a separate plain-text
  // link) so "for issuance" and "which application it became" read as one
  // navigable unit, not two disconnected pieces of UI.
  return (
    <Chip
      component={RouterLink}
      to={`/policy-application?open=${row.converted_application_id}`}
      onClick={(e) => e.stopPropagation()}
      clickable
      size="small"
      color="success"
      variant="outlined"
      icon={<ArrowForwardIcon fontSize="small" />}
      label={`For Issuance · ${row.converted_application_number}`}
      sx={{ fontWeight: 600 }}
    />
  );
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

// quotationNumber comes straight from the row data the tracker already has
// (no separate JSON detail fetch needed) — the dialog's only real job is to
// show the actual PDFKit-generated PDF, fetched once and reused for both the
// inline preview and "Re-export PDF" (same file, no second request).
function QuotationDetailDialog({ quotationId, quotationNumber, token, onClose }) {
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

  useEffect(() => {
    if (!quotationId) return;
    let cancelled = false;
    let objectUrl = null;
    setPdfLoading(true);
    setPdfError("");
    setPdfUrl(null);
    setResendResult(null);

    downloadQuotationPdf(token, quotationId)
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
  }, [quotationId, token]);

  async function handleResend() {
    if (resendInFlightRef.current) return;
    resendInFlightRef.current = true;
    setResending(true);
    setResendResult(null);
    try {
      const res = await resendQuotationEmail(token, quotationId);
      setResendResult({ severity: "success", message: `Quotation resent to ${res.to}.` });
    } catch (err) {
      setResendResult({ severity: "error", message: err.message });
    } finally {
      resendInFlightRef.current = false;
      setResending(false);
    }
  }

  return (
    <Dialog open={Boolean(quotationId)} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{quotationNumber ? `Quotation ${quotationNumber}` : "Quotation"}</DialogTitle>
      <DialogContent>
        <Box sx={{ my: 1 }}>
          <PdfViewer url={pdfUrl} loading={pdfLoading} error={pdfError} />
        </Box>

        {resendResult && (
          <Alert severity={resendResult.severity} sx={{ mb: 1 }}>
            {resendResult.message}
          </Alert>
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
        <Button
          variant="contained"
          startIcon={<EmailIcon />}
          onClick={handleResend}
          disabled={!pdfUrl || resending}
        >
          {resending ? "Sending..." : "Resend to client"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function Quotations() {
  const { token, permissions } = useAuth();
  const canIssue = permissions?.includes("CREATE_APPLICATION.AGENT_ISSUANCE");
  const canCreate =
    permissions?.includes("QUOTATION_TRACKER.CREATE_QUOTATION") ||
    permissions?.includes("QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION");
  const canView =
    permissions?.includes("QUOTATION_TRACKER.VIEW_QUOTATION") ||
    permissions?.includes("QUOTATION_TRACKER.ADMIN_VIEW_QUOTATION");
  const isAdminView = permissions?.includes("QUOTATION_TRACKER.ADMIN_VIEW_QUOTATION");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submittingId, setSubmittingId] = useState(null);

  function loadQuotations() {
    if (!canView) {
      setLoading(false);
      return Promise.resolve();
    }
    setLoading(true);
    setError("");
    return listQuotations(token, page + 1, rowsPerPage)
      .then((data) => {
        setRows(data.data);
        setTotal(data.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadQuotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, rowsPerPage]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Quotations
        </Typography>
        {canCreate && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            New Quotation
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!canView ? (
        <Alert severity="info">You don't have permission to view the quotations table.</Alert>
      ) : loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Quotation #</TableCell>
                  {isAdminView && <TableCell>Agent</TableCell>}
                  <TableCell>Insured</TableCell>
                  <TableCell>Class</TableCell>
                  <TableCell>Product Variant</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Insured From</TableCell>
                  <TableCell>Insured To</TableCell>
                  <TableCell align="right">Total Premium</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdminView ? 11 : 10} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      No quotations yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((q) => (
                    <TableRow
                      key={q.id}
                      hover
                      onClick={() => setSelected({ id: q.id, quotationNumber: q.quotation_number })}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>{q.quotation_number}</TableCell>
                      {isAdminView && <TableCell>{q.agent_name || q.agent_code}</TableCell>}
                      <TableCell>{q.insured_name || "—"}</TableCell>
                      <TableCell>{q.class_name}</TableCell>
                      <TableCell>{q.variant_name}</TableCell>
                      <TableCell>
                        <QuotationStatus row={q} />
                      </TableCell>
                      <TableCell>{fmtDate(q.coverage_start_at)}</TableCell>
                      <TableCell>{fmtDate(q.coverage_end_at)}</TableCell>
                      <TableCell align="right">{formatPHP(q.total_premium)}</TableCell>
                      <TableCell>{fmtDate(q.created_at)}</TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Tooltip
                          title={
                            q.converted
                              ? "Already submitted as a policy application"
                              : !canCreate
                                ? "You don't have permission to edit quotations"
                                : "Edit quotation"
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              disabled={q.converted || !canCreate}
                              onClick={() => setEditingId(q.id)}
                              aria-label="Edit quotation"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip
                          title={
                            q.converted
                              ? "Already submitted as a policy application"
                              : !canCreate
                                ? "You don't have permission to edit quotations"
                                : !canIssue
                                  ? "You don't have permission to issue policy applications"
                                  : "Submit as policy application"
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              disabled={q.converted || !canCreate || !canIssue}
                              onClick={() => setSubmittingId(q.id)}
                              aria-label="Submit as policy application"
                            >
                              <PublishIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </Paper>
      )}

      {selected && (
        <QuotationDetailDialog
          quotationId={selected.id}
          quotationNumber={selected.quotationNumber}
          token={token}
          onClose={() => setSelected(null)}
        />
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm" scroll="paper">
        <DialogContent>
          <QuotationCreator onClose={() => setCreateOpen(false)} onCreated={loadQuotations} />
        </DialogContent>
      </Dialog>

      {editingId && (
        <EditQuotationDialog
          quotationId={editingId}
          token={token}
          onClose={() => setEditingId(null)}
          onSaved={loadQuotations}
        />
      )}

      {submittingId && (
        <SubmitQuotationDialog
          quotationId={submittingId}
          token={token}
          onClose={() => setSubmittingId(null)}
          onSubmitted={loadQuotations}
        />
      )}
    </Container>
  );
}
