import { useState } from "react";
import { Container, Typography, Box, Tabs, Tab } from "@mui/material";
import { AccountingOverview } from "./AccountingOverview";
import { AccountingTransactions } from "./AccountingTransactions";

// Route target for /accounting (nav label "Accounting", permission
// MANAGE_ACCOUNTING). Same "one page, two horizontal tabs" shape as
// MyClients.jsx's own Clients/Client Policies split — "Overview" (tab 0,
// the page's own default) and "Transactions" share this one page-level
// Container/heading rather than each rendering their own. "Record Payment"
// (gated on MANAGE_ACCOUNTING.RECORD_PAYMENT) lives inside the Transactions
// tab, not here — see AccountingTransactions.jsx.
export function Accounting() {
  const [tab, setTab] = useState(0);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Accounting
        </Typography>
      </Box>

      <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)} sx={{ mb: 3 }}>
        <Tab label="Overview" />
        <Tab label="Transactions" />
      </Tabs>

      {tab === 0 ? <AccountingOverview /> : <AccountingTransactions />}
    </Container>
  );
}
