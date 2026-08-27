import { useState } from "react";
import { useNavigate, useSearchParams, Link as RouterLink } from "react-router-dom";
import { Box, Paper, TextField, Button, Typography, Alert, Link } from "@mui/material";
import { setPassword as setPasswordRequest } from "../api/client";
import { BrandMark } from "../components/BrandMark";

export function SetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await setPasswordRequest(token, password);
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 2,
      }}
    >
      <Paper elevation={3} sx={{ width: "100%", maxWidth: 400, p: { xs: 3, sm: 4 }, borderRadius: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
          <BrandMark size="large" />
        </Box>

        <Typography variant="h6" sx={{ mb: 2, textAlign: "center", color: "text.secondary" }}>
          Create Your Password
        </Typography>

        {!token && <Alert severity="error">This link is missing a token and can't be used.</Alert>}

        {token && done && (
          <Alert severity="success">Password set. Redirecting you to log in...</Alert>
        )}

        {token && !done && (
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              label="New password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              margin="normal"
              autoFocus
              helperText="At least 8 characters"
            />
            <TextField
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              fullWidth
              margin="normal"
            />

            {error && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              size="large"
              disabled={submitting}
              sx={{ mt: 3 }}
            >
              {submitting ? "Setting password..." : "Set password"}
            </Button>
          </Box>
        )}

        <Typography sx={{ mt: 3, textAlign: "center" }}>
          <Link component={RouterLink} to="/login">
            Back to login
          </Link>
        </Typography>
      </Paper>
    </Box>
  );
}
