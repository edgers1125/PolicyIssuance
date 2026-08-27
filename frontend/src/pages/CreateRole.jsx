import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Typography, Paper, Box, TextField, Button, IconButton, Alert, CircularProgress } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useAuth } from "../context/AuthContext";
import { listPermissions, createRole } from "../api/client";
import { PermissionChecklist } from "../components/PermissionChecklist";

export function CreateRole() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleName, setRoleName] = useState("");
  const [description, setDescription] = useState("");
  const [checkedIds, setCheckedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    listPermissions(token)
      .then(setPermissions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  function togglePermission(id) {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const role = await createRole(token, {
        role_name: roleName,
        description,
        permission_ids: checkedIds,
      });
      setSuccess(`Role "${role.role_name}" created.`);
      setRoleName("");
      setDescription("");
      setCheckedIds([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
        <IconButton onClick={() => navigate("/settings")} edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Create New Role
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, mb: 3 }}>
            <TextField
              label="Role name"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              required
              fullWidth
              autoFocus
              margin="normal"
            />
            <TextField
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              margin="normal"
            />
          </Paper>

          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
            Permissions
          </Typography>

          <Box sx={{ mb: 2 }}>
            <PermissionChecklist
              permissions={permissions}
              checkedIds={checkedIds}
              onToggle={togglePermission}
            />
          </Box>

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
            {submitting ? "Creating..." : "Create role"}
          </Button>
        </Box>
      )}
    </Container>
  );
}
