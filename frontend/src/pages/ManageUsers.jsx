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
import { PermissionChecklist } from "../components/PermissionChecklist";

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

      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Special permissions (optional)
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Permissions already granted by the selected role aren't shown here.
      </Typography>
      <PermissionChecklist permissions={selectable} checkedIds={permissionIds} onToggle={togglePermission} />
    </>
  );
}

function AddUserDialog({ open, onClose, roles, permissions, token, onCreated }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [permissionIds, setPermissionIds] = useState([]);
  const [makeAgent, setMakeAgent] = useState(false);
  const [agentCode, setAgentCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  function reset() {
    setEmail("");
    setFirstName("");
    setLastName("");
    setRoleId("");
    setPermissionIds([]);
    setMakeAgent(false);
    setAgentCode("");
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
        first_name: firstName,
        last_name: lastName,
        role_id: roleId,
        permission_ids: permissionIds,
        make_agent: makeAgent,
        agent_code: makeAgent ? agentCode : undefined,
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
                helperText="Every user is also registered as a customer under this email."
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  fullWidth
                />
                <TextField
                  label="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  fullWidth
                />
              </Stack>
              <RoleAndPermissionsFields
                roles={roles}
                permissions={permissions}
                roleId={roleId}
                onRoleChange={setRoleId}
                permissionIds={permissionIds}
                onPermissionIdsChange={setPermissionIds}
              />

              <FormControlLabel
                control={<Checkbox checked={makeAgent} onChange={(e) => setMakeAgent(e.target.checked)} />}
                label="Also register this person as an agent"
              />
              {makeAgent && (
                <TextField
                  label="Agent code"
                  value={agentCode}
                  onChange={(e) => setAgentCode(e.target.value)}
                  required
                  fullWidth
                />
              )}

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
  const [makeAgent, setMakeAgent] = useState(false);
  const [agentCode, setAgentCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setEmail(user.email);
      setStatus(user.status === "AWAITING_EMAIL_VERIFICATION" ? "ACTIVE" : user.status);
      setRoleId(user.roles[0]?.id || "");
      // specialPermissions can include a hidden page-access permission that was
      // auto-granted alongside a real one — drop it here so it isn't silently
      // carried forward once its last visible sibling gets unchecked.
      const selectableIds = new Set(permissions.map((p) => p.id));
      setPermissionIds(user.specialPermissions.map((p) => p.id).filter((id) => selectableIds.has(id)));
      setResetPassword(false);
      setMakeAgent(false);
      setAgentCode("");
      setError("");
      setInviteLink("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        make_agent: makeAgent,
        agent_code: makeAgent ? agentCode : undefined,
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

              {user.agent ? (
                <Alert severity="info">
                  Already an agent — code <strong>{user.agent.agent_code}</strong>
                </Alert>
              ) : (
                <>
                  <FormControlLabel
                    control={<Checkbox checked={makeAgent} onChange={(e) => setMakeAgent(e.target.checked)} />}
                    label="Make this person an agent"
                  />
                  {makeAgent && (
                    <TextField
                      label="Agent code"
                      value={agentCode}
                      onChange={(e) => setAgentCode(e.target.value)}
                      required
                      fullWidth
                    />
                  )}
                </>
              )}

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
                <TableCell>Agent</TableCell>
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
                  <TableCell>
                    {u.agent ? (
                      <Chip label={u.agent.agent_code} size="small" color="primary" variant="outlined" />
                    ) : (
                      "—"
                    )}
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
