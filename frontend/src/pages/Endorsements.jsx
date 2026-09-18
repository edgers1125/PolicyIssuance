import { useEffect, useState } from "react";
import {
  Container,
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  TextField,
  CircularProgress,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useAuth } from "../context/AuthContext";
import { listPoliciesForEndorsement } from "../api/client";
import { EndorsementApproval } from "./EndorsementApproval";
import { PolicyDetailDialog } from "../components/PolicyDetailDialog";

// /endorsements route ("Endorsements" in the sidebar) — formerly the
// "Endorsement Approval" tab of pages/Approvals.jsx, promoted to its own
// standalone page once that page's other tab (Policy Approval) was absorbed
// into PolicyApplications.jsx instead (see that file's own note). Two
// independent pieces, shown based on whichever permission the caller holds
// (not mutually exclusive here, unlike PolicyApplications.jsx's own either/or
// split — a caller could reasonably hold both):
//  - APPROVE_ENDORSEMENT: the review queue (EndorsementApproval.jsx).
//  - VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT: "New Admin Endorsement" — search
//    any policy in the system by number/insured name, then reuse
//    PolicyDetailDialog.jsx (the exact same two-pane PDF + endorsement
//    composer Client Policies' own "Client Policies" tab opens per row) to
//    file one. That endorsement is approved automatically in the same action
//    (see routes/endorsements.js's own POST / — the admin filing it is
//    trusted to also be the one approving it), so there's nothing further to
//    review afterward; a caller holding only this permission (no
//    APPROVE_ENDORSEMENT) never needs the queue above at all.
export function Endorsements() {
  const { token, permissions } = useAuth();
  const canApprove = permissions?.includes("APPROVE_ENDORSEMENT");
  const canAdminCreate = permissions?.includes("VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Endorsements
        </Typography>
        {canAdminCreate && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setPickerOpen(true)}>
            New Admin Endorsement
          </Button>
        )}
      </Box>

      {canApprove && <EndorsementApproval />}

      <PolicyPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(policy) => {
          setPickerOpen(false);
          setSelectedPolicy(policy);
        }}
      />

      {selectedPolicy && (
        <PolicyDetailDialog
          open={Boolean(selectedPolicy)}
          policyId={selectedPolicy.id}
          policyNumber={selectedPolicy.policy_number}
          token={token}
          onClose={() => setSelectedPolicy(null)}
        />
      )}
    </Container>
  );
}

// The "New Admin Endorsement" policy search — a debounced, server-searched
// Autocomplete (GET /endorsements/policies, paginated — see that route's own
// note) rather than a client-side filter, since this searches every policy
// in the system. Picking one hands its {id, policy_number} back to the
// parent, which then opens PolicyDetailDialog.jsx for it — the same dialog
// Client Policies' own table opens per row, so "create the endorsement from
// there" behaves identically regardless of how the policy was reached.
function PolicyPickerDialog({ open, onClose, onSelect }) {
  const { token } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      listPoliciesForEndorsement(token, inputValue, 1, 20)
        .then((data) => !cancelled && setOptions(data.data))
        .catch(() => !cancelled && setOptions([]))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [open, inputValue, token]);

  useEffect(() => {
    if (!open) {
      setInputValue("");
      setOptions([]);
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New Admin Endorsement</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Search for the policy to endorse — this endorsement will be filed and approved immediately.
        </Typography>
        <Autocomplete
          options={options}
          loading={loading}
          filterOptions={(x) => x}
          getOptionLabel={(option) => (option.policy_number ? `${option.policy_number} — ${option.insured_name || ""}` : "")}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          onInputChange={(e, value) => setInputValue(value)}
          onChange={(e, value) => {
            if (value) onSelect(value);
          }}
          renderOption={(props, option) => (
            <li {...props} key={option.id}>
              <Box>
                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                  {option.policy_number}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {option.insured_name || "—"} · Agent {option.agent_code}
                </Typography>
              </Box>
            </li>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Policy number"
              autoFocus
              slotProps={{
                ...params.slotProps,
                input: {
                  ...params.slotProps.input,
                  endAdornment: (
                    <>
                      {loading && <CircularProgress size={18} />}
                      {params.slotProps.input.endAdornment}
                    </>
                  ),
                },
              }}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
