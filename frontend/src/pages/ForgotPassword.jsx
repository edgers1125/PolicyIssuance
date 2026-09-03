import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Paper, TextField, Button, Typography, Alert, Link } from "@mui/material";
import { forgotPassword } from "../api/client";
import { BrandMark } from "../components/BrandMark";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setDone(true);
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
          Forgot Password
        </Typography>

        {done ? (
          <Alert severity="success">
            If an account with that email exists, a password reset link has been sent. Please check your inbox.
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
              Enter the email address associated with your account and we'll send you a link to reset your
              password.
            </Typography>

            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              margin="normal"
              autoFocus
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
              {submitting ? "Sending..." : "Send reset link"}
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
