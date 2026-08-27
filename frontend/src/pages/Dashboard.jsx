import { useEffect, useState } from "react";
import { Container, Paper, Typography, Grid, Divider, Alert, Chip } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { getMe } from "../api/client";

function InfoRow({ label, value }) {
  return (
    <Grid container sx={{ py: 1 }}>
      <Grid size={{ xs: 5, sm: 4 }}>
        <Typography color="text.secondary">{label}</Typography>
      </Grid>
      <Grid size={{ xs: 7, sm: 8 }}>
        <Typography component="div" sx={{ wordBreak: "break-word" }}>{value}</Typography>
      </Grid>
    </Grid>
  );
}

export function Dashboard() {
  const { token, user } = useAuth();
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe(token)
      .then(setMe)
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 700 }}>
        Dashboard
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Your account
        </Typography>
        <Divider sx={{ mb: 1 }} />

        {me ? (
          <>
            <InfoRow label="ID" value={me.id} />
            <InfoRow label="Name" value={me.full_name} />
            <InfoRow label="Email" value={me.email} />
            <InfoRow
              label="Status"
              value={<Chip label={me.status} color="secondary" size="small" />}
            />
            {(me.status === "INACTIVE" || me.status === "SUSPENDED") && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Kindly contact our IT Department at +63 xxx-xxx-xxxx or at xxx@bethelgen.com for status reinstatement. Thank you.
              </Alert>
            )}
          </>
        ) : (
          !error && <Typography sx={{ py: 1 }}>Loading your info...</Typography>
        )}
      </Paper>

      {user && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Cached login response: {user.full_name} ({user.email})
        </Typography>
      )}
    </Container>
  );
}
