import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Box,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Alert,
  CircularProgress,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useAuth } from "../context/AuthContext";
import { listRoles, listPermissions, updateRolePermissions } from "../api/client";
import { PermissionChecklist } from "../components/PermissionChecklist";

function sameIds(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

// A role's permissionIds can include a hidden page-access permission that was
// auto-granted alongside a real one — drop it here so it isn't silently carried
// forward (and thus un-removable, since the checklist never shows it) once its
// last visible sibling gets unchecked.
function selectableOnly(ids, selectablePermissions) {
  const selectableIds = new Set(selectablePermissions.map((p) => p.id));
  return ids.filter((id) => selectableIds.has(id));
}

export function RoleDefaultPermissions() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [roleId, setRoleId] = useState("");
  const [checkedIds, setCheckedIds] = useState([]);
  const [originalIds, setOriginalIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([listRoles(token), listPermissions(token)])
      .then(([rolesData, permissionsData]) => {
        setRoles(rolesData);
        setPermissions(permissionsData);
        if (rolesData.length > 0) {
          setRoleId(rolesData[0].id);
          const ids = selectableOnly(rolesData[0].permissionIds, permissionsData);
          setCheckedIds(ids);
          setOriginalIds(ids);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  function handleRoleChange(newRoleId) {
    const role = roles.find((r) => r.id === newRoleId);
    const ids = role ? selectableOnly(role.permissionIds, permissions) : [];
    setRoleId(newRoleId);
    setCheckedIds(ids);
    setOriginalIds(ids);
    setSaved(false);
    setError("");
  }

  function togglePermission(permissionId) {
    setSaved(false);
    setCheckedIds((prev) =>
      prev.includes(permissionId) ? prev.filter((id) => id !== permissionId) : [...prev, permissionId]
    );
  }

  const isDirty = useMemo(() => !sameIds(checkedIds, originalIds), [checkedIds, originalIds]);

  function handleCancel() {
    setCheckedIds(originalIds);
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updateRolePermissions(token, roleId, checkedIds);
      setOriginalIds(checkedIds);
      setSaved(true);
      setRoles((prev) => prev.map((r) => (r.id === roleId ? { ...r, permissionIds: checkedIds } : r)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
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
          Edit Default Role Permissions
        </Typography>
      </Box>

      <Box
        sx={{
          position: "sticky",
          top: { xs: 56, sm: 64 },
          zIndex: 2,
          bgcolor: "background.default",
          py: 2,
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        <TextField
          select
          label="Role"
          value={roleId}
          onChange={(e) => handleRoleChange(e.target.value)}
          sx={{ flexGrow: 1 }}
        >
          {roles.map((role) => (
            <MenuItem key={role.id} value={role.id}>
              {role.role_name}
            </MenuItem>
          ))}
        </TextField>

        <Button variant="contained" onClick={handleSave} disabled={!isDirty || saving}>
          {saving ? "Saving..." : "Save"}
        </Button>

        {isDirty && (
          <Button onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
        )}
      </Box>

      {saved && !isDirty && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Saved.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <PermissionChecklist
        permissions={permissions}
        checkedIds={checkedIds}
        onToggle={togglePermission}
      />
    </Container>
  );
}
