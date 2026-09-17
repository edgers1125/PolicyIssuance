import { useState } from "react";
import { Container, Typography, Box, Tabs, Tab } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { PolicyApproval } from "./PolicyApproval";
import { EndorsementApproval } from "./EndorsementApproval";

// Route target for /approvals (nav label "Approvals", permission
// [APPROVE_APPLICATION, APPROVE_ENDORSEMENT] — either one admits the page).
// Wraps two horizontal tabs, each independently gated on its own
// permission so the two review responsibilities can be delegated
// separately: "Policy Approval" (routes/policyApproval.js — application
// review/approve/reject) and "Endorsement Approval" (routes/endorsements.js
// — the same review/approve/reject flow for amendments against already-
// issued policies). Same "one page, two independent tabs" shape as
// MyClients.jsx's own Clients/Client Policies split. A caller holding only
// one of the two permissions sees a single tab (no empty tab bar to click
// through for the one they don't have).
export function Approvals() {
  const { permissions } = useAuth();
  const canApprovePolicies = permissions?.includes("APPROVE_APPLICATION");
  const canApproveEndorsements = permissions?.includes("APPROVE_ENDORSEMENT");

  const tabs = [
    canApprovePolicies && { key: "policies", label: "Policy Approval" },
    canApproveEndorsements && { key: "endorsements", label: "Endorsement Approval" },
  ].filter(Boolean);

  const [tab, setTab] = useState(0);
  const activeKey = tabs[tab]?.key;

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Approvals
        </Typography>
      </Box>

      {tabs.length > 1 && (
        <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)} sx={{ mb: 3 }}>
          {tabs.map((t) => (
            <Tab key={t.key} label={t.label} />
          ))}
        </Tabs>
      )}

      {activeKey === "policies" && <PolicyApproval />}
      {activeKey === "endorsements" && <EndorsementApproval />}
    </Container>
  );
}
