import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  DialogContent,
  Chip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useAuth } from "../context/AuthContext";
import {
  listApplications,
  getApplication,
  resendApplicationEmail,
  downloadApplicationPdf,
  getPolicyRenewalPrefill,
} from "../api/client";
import { formatPHP } from "../utils/currency";
import { StatusChip } from "../components/StatusChip";
import { ApplicationDetailDialog } from "../components/ApplicationDetailDialog";
import { PolicyApplication as PolicyApplicationCreator } from "./PolicyApplication";

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

// ApplicationPolicyType's own label/color mapping — kept local, same
// precedent as ClientPolicies.jsx's own POLICY_STATUS_LABELS, since this is
// a small enum only this table (and PolicyApproval.jsx's) needs to display.
const POLICY_TYPE_LABELS = { NEW_POLICY: "New Policy", RENEWAL: "Renewal" };
const POLICY_TYPE_COLORS = { NEW_POLICY: "default", RENEWAL: "info" };

export function PolicyApplications() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Set only via the ?renew= deep link below — handed to PolicyApplicationCreator
  // to pre-fill the wizard from an already-issued Policy (Client Policies
  // page's "Renew This Policy" action).
  const [renewalPrefill, setRenewalPrefill] = useState(null);

  // Deep-link from the Quotation Tracker's "For Issuance" status — clicking
  // the converted application's number there routes here with ?open=<id>
  // and this opens straight into that application's detail popup, the same
  // one a row click would. The number isn't in the URL (just the id), so
  // this fetches the one application's detail for the dialog title rather
  // than waiting on/searching the (possibly different-paginated) table rows.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    let cancelled = false;
    getApplication(token, openId)
      .then((app) => {
        if (cancelled) return;
        setSelected({ id: app.id, applicationNumber: app.application_number });
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => {
        if (cancelled) return;
        const next = new URLSearchParams(searchParams);
        next.delete("open");
        setSearchParams(next, { replace: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Deep-link from the Client Policies page's "Renew This Policy" action —
  // routes here with ?renew=<policyId>, fetches everything the wizard needs
  // to open pre-filled (routes/policies.js's GET /:id/renewal-prefill), and
  // opens the same "New Application" dialog a manual click would, just
  // pre-filled. Same param-stripping pattern as ?open= above.
  useEffect(() => {
    const renewId = searchParams.get("renew");
    if (!renewId) return;
    let cancelled = false;
    getPolicyRenewalPrefill(token, renewId)
      .then((prefill) => {
        if (cancelled) return;
        setRenewalPrefill(prefill);
        setCreateOpen(true);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => {
        if (cancelled) return;
        const next = new URLSearchParams(searchParams);
        next.delete("renew");
        setSearchParams(next, { replace: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function loadApplications() {
    setLoading(true);
    setError("");
    return listApplications(token, page + 1, rowsPerPage)
      .then((data) => {
        setRows(data.data);
        setTotal(data.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, rowsPerPage]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Policy Applications
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setRenewalPrefill(null);
            setCreateOpen(true);
          }}
        >
          New Application
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Application #</TableCell>
                  <TableCell>Insured</TableCell>
                  <TableCell>Class</TableCell>
                  <TableCell>Product Variant</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Insured From</TableCell>
                  <TableCell>Insured To</TableCell>
                  <TableCell align="right">Total Premium</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      No policy applications yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((a) => (
                    <TableRow
                      key={a.id}
                      hover
                      onClick={() => setSelected({ id: a.id, applicationNumber: a.application_number })}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>{a.application_number}</TableCell>
                      <TableCell>{a.insured_name || "—"}</TableCell>
                      <TableCell>{a.class_name}</TableCell>
                      <TableCell>{a.variant_name}</TableCell>
                      <TableCell>
                        <StatusChip status={a.status} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={POLICY_TYPE_LABELS[a.policy_type] || a.policy_type}
                          color={POLICY_TYPE_COLORS[a.policy_type] || "default"}
                        />
                      </TableCell>
                      <TableCell>{fmtDate(a.coverage_start_at)}</TableCell>
                      <TableCell>{fmtDate(a.coverage_end_at)}</TableCell>
                      <TableCell align="right">{formatPHP(a.total_premium)}</TableCell>
                      <TableCell>{fmtDate(a.created_at)}</TableCell>
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
        <ApplicationDetailDialog
          applicationId={selected.id}
          applicationNumber={selected.applicationNumber}
          token={token}
          onClose={() => setSelected(null)}
          downloadPdf={downloadApplicationPdf}
          resendEmail={resendApplicationEmail}
        />
      )}

      <Dialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setRenewalPrefill(null);
        }}
        fullWidth
        maxWidth="sm"
        scroll="paper"
      >
        <DialogContent>
          <PolicyApplicationCreator
            onClose={() => {
              setCreateOpen(false);
              setRenewalPrefill(null);
            }}
            onCreated={loadApplications}
            renewalPrefill={renewalPrefill}
          />
        </DialogContent>
      </Dialog>
    </Container>
  );
}
