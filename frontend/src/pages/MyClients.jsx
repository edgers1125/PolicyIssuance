import { useState } from "react";
import { Container, Typography, Box, Tabs, Tab } from "@mui/material";
import { Clients } from "./Clients";
import { ClientPoliciesTable } from "./ClientPolicies";

// Route target for /my-policies (nav label "My Clients", permission
// VIEW_POLICIES — unchanged from when this was just ClientPolicies.jsx).
// Wraps two horizontal tabs: "Clients" (routes/policies.js's GET
// /policies/clients — every client on file for this agent, with premium
// production) and "Client Policies" (the original table, GET /policies —
// every issued policy). Both tabs share this one page-level Container/
// heading rather than each rendering their own.
export function MyClients() {
  const [tab, setTab] = useState(0);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          My Clients
        </Typography>
      </Box>

      <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)} sx={{ mb: 3 }}>
        <Tab label="Clients" />
        <Tab label="Client Policies" />
      </Tabs>

      {tab === 0 ? <Clients /> : <ClientPoliciesTable />}
    </Container>
  );
}
