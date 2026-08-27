import { Container, Typography, Paper } from "@mui/material";

export function PlaceholderPage({ title }) {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 700 }}>
        {title}
      </Typography>
      <Paper sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3, textAlign: "center" }}>
        <Typography color="text.secondary">Coming soon.</Typography>
      </Paper>
    </Container>
  );
}
