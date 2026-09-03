import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Box,
  IconButton,
  Alert,
  CircularProgress,
  Stack,
  TextField,
  Button,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "../context/AuthContext";
import { listPaymentMethods, createPaymentMethod, deletePaymentMethod } from "../api/client";

export function AuthorizedPaymentMethods() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [methods, setMethods] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    listPaymentMethods(token)
      .then(setMethods)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const method = await createPaymentMethod(token, name.trim());
      setMethods((prev) => [...prev, method].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setDeletingId(id);
    setError("");
    try {
      await deletePaymentMethod(token, id);
      setMethods((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
        <IconButton onClick={() => navigate("/settings")} edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Authorized Payment Methods
        </Typography>
      </Box>

      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          These are the payment methods Bethel itself accepts when a customer's payment is remitted directly to
          Bethel rather than collected by the agent first.
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}

        <Box component="form" onSubmit={handleAdd} sx={{ display: "flex", gap: 2 }}>
          <TextField
            label="New payment method"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
          />
          <Button type="submit" variant="contained" disabled={saving || !name.trim()}>
            {saving ? "Adding..." : "Add"}
          </Button>
        </Box>

        <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
          <List disablePadding>
            {methods.length === 0 && (
              <ListItem>
                <ListItemText primary="No payment methods yet." />
              </ListItem>
            )}
            {methods.map((method, index) => (
              <div key={method.id}>
                {index > 0 && <Divider component="li" />}
                <ListItem
                  secondaryAction={
                    <IconButton
                      edge="end"
                      onClick={() => handleDelete(method.id)}
                      disabled={deletingId === method.id}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText primary={method.name} />
                </ListItem>
              </div>
            ))}
          </List>
        </Paper>
      </Stack>
    </Container>
  );
}
