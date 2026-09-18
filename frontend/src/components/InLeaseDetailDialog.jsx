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
  Divider,
  Alert,
  CircularProgress,
  Button,
  Checkbox,
  FormControlLabel,
  Chip,
  Tooltip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { getInLeaseBacklogDetail, accomplishInLeaseTask, undoInLeaseTask } from "../api/client";
import { formatPHP } from "../utils/currency";

const TASK_TYPE_LABELS = { FOR_UPLOAD: "For Upload", FOR_ENDORSEMENT: "For Endorsement" };

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// One label/value row with its own copy-to-clipboard action — the "copyable
// format" this whole dialog exists for, since the point is pasting each
// value into whatever external in-lease system Bethel uses, field by field,
// rather than reading it off a rendered (and so unselectable-per-field) PDF.
function CopyableField({ label, value, copiedField, onCopy }) {
  const display = value === null || value === undefined || value === "" ? "—" : String(value);
  const copied = copiedField === label;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 170, flexShrink: 0 }}>
        {label}
      </Typography>
      <TextField value={display} size="small" fullWidth slotProps={{ input: { readOnly: true } }} />
      <Tooltip title={copied ? "Copied!" : "Copy"}>
        <IconButton size="small" onClick={() => onCopy(label, display)} disabled={display === "—"}>
          {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

// The In-Lease Backlogs page's row-detail popup — every field an agent would
// need to key into Bethel's external in-lease system, each with its own copy
// button, plus the confirm-and-submit action that marks the policy's current
// task accomplished (see routes/inLeaseBacklog.js). Deliberately not a PDF:
// PdfViewer.jsx renders onto <canvas>, which has no selectable/copyable text
// at all — this dialog exists specifically so each value can be copied
// individually instead.
export function InLeaseDetailDialog({ policyId, token, canMarkDone, canMarkUndone, onClose, onChanged }) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    setError("");
    return getInLeaseBacklogDetail(token, policyId)
      .then(setDetail)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId, token]);

  async function handleCopy(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      setTimeout(() => setCopiedField((f) => (f === label ? null : f)), 1500);
    } catch {
      // Clipboard permission denied/unavailable — the field's own text is
      // still there to select and copy by hand; no toast system in this app
      // to surface a failure through anyway.
    }
  }

  async function handleAccomplish() {
    setSubmitting(true);
    setError("");
    try {
      await accomplishInLeaseTask(token, detail.current_task_id);
      setConfirmChecked(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUndo(taskId) {
    setSubmitting(true);
    setError("");
    try {
      await undoInLeaseTask(token, taskId);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const lastAccomplished = detail?.tasks.filter((t) => t.accomplished).slice(-1)[0] || null;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {detail ? `In-Lease — ${detail.policy_number}` : "In-Lease"}
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
          <Alert severity="error">{error || "Policy not found."}</Alert>
        ) : (
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}

            <Box>
              <Chip
                size="small"
                label={detail.status === "ACCOMPLISHED" ? "Accomplished" : `Pending — ${TASK_TYPE_LABELS[detail.current_task_type] || detail.current_task_type}`}
                color={detail.status === "ACCOMPLISHED" ? "success" : "warning"}
              />
            </Box>

            <Stack spacing={1.5} divider={<Divider flexItem />}>
              <CopyableField label="Policy Number" value={detail.policy_number} copiedField={copiedField} onCopy={handleCopy} />
              {detail.coc_number && <CopyableField label="COC Number" value={detail.coc_number} copiedField={copiedField} onCopy={handleCopy} />}
              {detail.sa_number && <CopyableField label="SA Number" value={detail.sa_number} copiedField={copiedField} onCopy={handleCopy} />}
              <CopyableField label="Insured Name" value={detail.insured_name} copiedField={copiedField} onCopy={handleCopy} />
              <CopyableField label="Insured Address" value={detail.insured_address} copiedField={copiedField} onCopy={handleCopy} />
              {detail.risk_address && <CopyableField label="Risk Address" value={detail.risk_address} copiedField={copiedField} onCopy={handleCopy} />}
              <CopyableField label="Class" value={detail.class_name} copiedField={copiedField} onCopy={handleCopy} />
              <CopyableField label="Product Variant" value={detail.variant_name} copiedField={copiedField} onCopy={handleCopy} />
              <CopyableField label="Agent Code" value={detail.agent_code} copiedField={copiedField} onCopy={handleCopy} />
              <CopyableField label="Effective Date" value={fmtDate(detail.effective_date)} copiedField={copiedField} onCopy={handleCopy} />
              <CopyableField label="Expiry Date" value={fmtDate(detail.expiry_date)} copiedField={copiedField} onCopy={handleCopy} />
              <CopyableField label="Total Premium" value={formatPHP(detail.total_premium)} copiedField={copiedField} onCopy={handleCopy} />
              <CopyableField label="Doc. Stamps" value={formatPHP(detail.doc_stamps)} copiedField={copiedField} onCopy={handleCopy} />
              <CopyableField label="V.A.T." value={formatPHP(detail.vat)} copiedField={copiedField} onCopy={handleCopy} />
              <CopyableField label="L.G.T." value={formatPHP(detail.lgt)} copiedField={copiedField} onCopy={handleCopy} />
              <CopyableField label="Miscellaneous" value={formatPHP(detail.misc)} copiedField={copiedField} onCopy={handleCopy} />
              <CopyableField label="Total Amount" value={formatPHP(detail.total_amount)} copiedField={copiedField} onCopy={handleCopy} />
            </Stack>

            {detail.vehicles.map((v, index) => (
              <Box key={index}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Vehicle{detail.vehicles.length > 1 ? ` ${index + 1}` : ""}
                </Typography>
                <Stack spacing={1.5} divider={<Divider flexItem />}>
                  <CopyableField label="Plate Number" value={v.plate_number} copiedField={copiedField} onCopy={handleCopy} />
                  <CopyableField label="MV File No." value={v.mv_file_no} copiedField={copiedField} onCopy={handleCopy} />
                  <CopyableField label="Motor Number" value={v.engine_number} copiedField={copiedField} onCopy={handleCopy} />
                  <CopyableField label="Serial Number" value={v.chassis_number} copiedField={copiedField} onCopy={handleCopy} />
                  <CopyableField label="Make" value={v.make} copiedField={copiedField} onCopy={handleCopy} />
                  <CopyableField label="Model" value={v.model} copiedField={copiedField} onCopy={handleCopy} />
                  <CopyableField label="Year Model" value={v.year_model} copiedField={copiedField} onCopy={handleCopy} />
                  <CopyableField label="Color" value={v.color} copiedField={copiedField} onCopy={handleCopy} />
                </Stack>
              </Box>
            ))}

            {detail.coverages.map((c, index) => (
              <Box key={index}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Coverage{detail.coverages.length > 1 ? ` ${index + 1}` : ""}
                  {c.name ? ` — ${c.name}` : ""}
                </Typography>
                <Stack spacing={1.5} divider={<Divider flexItem />}>
                  <CopyableField label="Coverage Name" value={c.name} copiedField={copiedField} onCopy={handleCopy} />
                  <CopyableField label="Coverage Price" value={formatPHP(c.coverage_amount)} copiedField={copiedField} onCopy={handleCopy} />
                  <CopyableField label="Premium" value={formatPHP(c.premium_amount)} copiedField={copiedField} onCopy={handleCopy} />
                </Stack>
              </Box>
            ))}

            {detail.current_task_endorsement && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Endorsement Changes — {detail.current_task_endorsement.endorsement_number}
                </Typography>
                <Stack spacing={1.5} divider={<Divider flexItem />}>
                  {detail.current_task_endorsement.changes.map((c, index) => (
                    <CopyableField
                      key={index}
                      label={`${index + 1}. ${c.title}`}
                      value={c.description}
                      copiedField={copiedField}
                      onCopy={handleCopy}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            <Divider />

            {detail.status === "ACCOMPLISHED" ? (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Accomplished by {lastAccomplished?.accomplished_by_name || "—"} on {fmtDateTime(lastAccomplished?.accomplished_at)}.
                </Typography>
                {canMarkUndone && lastAccomplished && (
                  <Button
                    color="warning"
                    size="small"
                    sx={{ mt: 1 }}
                    onClick={() => handleUndo(lastAccomplished.id)}
                    disabled={submitting}
                  >
                    Undo
                  </Button>
                )}
              </Box>
            ) : canMarkDone ? (
              <Box>
                <FormControlLabel
                  control={<Checkbox checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />}
                  label="I have duly submitted this policy in In-Lease."
                />
                <Box>
                  <Button variant="contained" onClick={handleAccomplish} disabled={!confirmChecked || submitting}>
                    {submitting ? "Submitting..." : "Submit"}
                  </Button>
                </Box>
              </Box>
            ) : (
              <Alert severity="info">You don't have permission to mark this task done.</Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
