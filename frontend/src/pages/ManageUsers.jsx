import { useEffect, useState } from "react";
import {
  Container,
  Typography,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Chip,
  Box,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  ListSubheader,
  Alert,
  CircularProgress,
  Stack,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import { useAuth } from "../context/AuthContext";
import { listUsers, listRoles, listPermissions, createUser, updateUser } from "../api/client";
import { groupPermissions } from "../utils/permissionGroups";

const STATUS_COLOR = {
  ACTIVE: "success",
  AWAITING_EMAIL_VERIFICATION: "warning",
  INACTIVE: "default",
  SUSPENDED: "error",
};

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "SUSPENDED"];

// A role already grants some permissions by default — special permissions are only
// for grants beyond that, so exclude whatever the selected role already covers.
function availableSpecialPermissions(permissions, roles, roleId) {
  const role = roles.find((r) => r.id === roleId);
  const rolePermissionIds = new Set(role ? role.permissionIds : []);
  return permissions.filter((p) => !rolePermissionIds.has(p.id));
}

function RoleAndPermissionsFields({ roles, permissions, roleId, onRoleChange, permissionIds, onPermissionIdsChange }) {
  const selectable = availableSpecialPermissions(permissions, roles, roleId);
  const selectableGroups = groupPermissions(selectable);

  function togglePermission(id) {
    onPermissionIdsChange(
      permissionIds.includes(id) ? permissionIds.filter((p) => p !== id) : [...permissionIds, id]
    );
  }

  return (
    <>
      <TextField select label="Role" value={roleId} onChange={(e) => onRoleChange(e.target.value)} required fullWidth>
        {roles.map((role) => (
          <MenuItem key={role.id} value={role.id}>
            {role.role_name}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        label="Special permissions (optional)"
        value={permissionIds}
        onChange={(e) => onPermissionIdsChange(e.target.value)}
        helperText="Permissions already granted by the selected role aren't shown here."
        slotProps={{
          select: {
            multiple: true,
            renderValue: (selected) =>
              permissions
                .filter((p) => selected.includes(p.id))
                .map((p) => p.permission_name)
                .join(", "),
          },
        }}
        fullWidth
      >
        {selectableGroups.flatMap((group) => [
          <ListSubheader key={`header-${group.name}`}>{group.name}</ListSubheader>,
          ...group.items.map((perm) => (
            <MenuItem key={perm.id} value={perm.id} onClick={() => togglePermission(perm.id)}>
              {perm.permission_name}
            </MenuItem>
          )),
        ])}
      </TextField>
    </>
  );
}

function AddUserDialog({ open, onClose, roles, permissions, token, onCreated }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [permissionIds, setPermissionIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  function reset() {
    setEmail("");
    setFullName("");
    setRoleId("");
    setPermissionIds([]);
    setError("");
    setInviteLink("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await createUser(token, {
        email,
        full_name: fullName,
        role_id: roleId,
        permission_ids: permissionIds,
      });
      setInviteLink(result.inviteLink);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Add User</DialogTitle>

      {inviteLink ? (
        <>
          <DialogContent>
            <Alert severity="success" sx={{ mb: 2 }}>
              User created. No email provider is configured yet, so here's the invite link to
              share manually:
            </Alert>
            <TextField value={inviteLink} fullWidth multiline slotProps={{ input: { readOnly: true } }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} variant="contained">
              Done
            </Button>
          </DialogActions>
        </>
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                autoFocus
              />
              <TextField
                label="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                fullWidth
              />
              <RoleAndPermissionsFields
                roles={roles}
                permissions={permissions}
                roleId={roleId}
                onRoleChange={setRoleId}
                permissionIds={permissionIds}
                onPermissionIdsChange={setPermissionIds}
              />
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? "Creating..." : "Create user"}
            </Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}

function EditUserDialog({ open, onClose, user, roles, permissions, token, onSaved }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [roleId, setRoleId] = useState("");
  const [permissionIds, setPermissionIds] = useState([]);
  const [resetPassword, setResetPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setEmail(user.email);
      setStatus(user.status === "AWAITING_EMAIL_VERIFICATION" ? "ACTIVE" : user.status);
      setRoleId(user.roles[0]?.id || "");
      setPermissionIds(user.specialPermissions.map((p) => p.id));
      setResetPassword(false);
      setError("");
      setInviteLink("");
    }
  }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await updateUser(token, user.id, {
        full_name: fullName,
        email,
        status,
        role_id: roleId,
        permission_ids: permissionIds,
        reset_password: resetPassword,
      });
      if (result.inviteLink) {
        setInviteLink(result.inviteLink);
      } else {
        onClose();
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit User</DialogTitle>

      {inviteLink ? (
        <>
          <DialogContent>
            <Alert severity="success" sx={{ mb: 2 }}>
              The email or password changed, so this account needs re-verification. No email
              provider is configured yet, so here's the link to share manually:
            </Alert>
            <TextField value={inviteLink} fullWidth multiline slotProps={{ input: { readOnly: true } }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} variant="contained">
              Done
            </Button>
          </DialogActions>
        </>
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <Stack spacing={2}>
              <TextField
                label="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                helperText="Changing this will require the user to verify their email again."
              />
              <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} fullWidth>
                {STATUS_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>

              <RoleAndPermissionsFields
                roles={roles}
                permissions={permissions}
                roleId={roleId}
                onRoleChange={setRoleId}
                permissionIds={permissionIds}
                onPermissionIdsChange={setPermissionIds}
              />

              <FormControlLabel
                control={
                  <Checkbox checked={resetPassword} onChange={(e) => setResetPassword(e.target.checked)} />
                }
                label="Force password reset (invalidates current password, sends a new invite link)"
              />

              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? "Saving..." : "Save changes"}
            </Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}

export function ManageUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  function loadUsers() {
    return listUsers(token).then(setUsers);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([loadUsers(), listRoles(token).then(setRoles), listPermissions(token).then(setPermissions)])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Manage Users
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          Add User
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Roles</TableCell>
                <TableCell>Special Permissions</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.full_name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Chip
                      label={u.status.replaceAll("_", " ")}
                      color={STATUS_COLOR[u.status] || "default"}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {u.roles.map((r) => (
                        <Chip key={r.id} label={r.role_name} size="small" />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {u.specialPermissions.map((p) => (
                        <Chip
                          key={p.id}
                          label={p.permission_name}
                          size="small"
                          color="secondary"
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => setEditingUser(u)} title="Edit user">
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <AddUserDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        roles={roles}
        permissions={permissions}
        token={token}
        onCreated={loadUsers}
      />

      <EditUserDialog
        open={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        user={editingUser}
        roles={roles}
        permissions={permissions}
        token={token}
        onSaved={loadUsers}
      />
    </Container>
  );
}
