import { useEffect, useState } from "react";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";
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
  Autocomplete,
  ToggleButton,
  ToggleButtonGroup,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useAuth } from "../context/AuthContext";
import { listUsers, listRoles, listPermissions, createUser, updateUser, listAgentsForUserLink } from "../api/client";
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
  // Collapsed by default — a long checklist of every sub-permission in the
  // app was pushing the rest of this dialog's fields out of view for the
  // common case (no special grants at all). Starts open when this user
  // already has some checked, so editing an existing grant doesn't hide it.
  const [expanded, setExpanded] = useState(permissionIds.length > 0);

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

      <Accordion expanded={expanded} onChange={(e, isExpanded) => setExpanded(isExpanded)} disableGutters variant="outlined">
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Special permissions {permissionIds.length > 0 ? `(${permissionIds.length} selected)` : "(optional)"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Permissions already granted by the selected role aren't shown here.
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <PermissionChecklist permissions={selectable} checkedIds={permissionIds} onToggle={togglePermission} />
        </AccordionDetails>
      </Accordion>
    </>
  );
}

// Every agent's own display label — an INDIVIDUAL includes agent_code (the
// thing that actually uniquely identifies it to whoever's picking) and, for
// one already under a company, that company's name; a CORPORATE one instead
// shows how many logins already share it, since — unlike an individual —
// more than one User can point at the same company agent.
function agentOptionLabel(a) {
  if (a.agent_type === "CORPORATE") {
    const count = a.user_count ? ` — ${a.user_count} existing login${a.user_count === 1 ? "" : "s"}` : "";
    return `${a.agent_name} (${a.agent_code})${count}`;
  }
  const suffix = a.company_name ? ` — under ${a.company_name}` : "";
  return `${a.agent_name} (${a.agent_code})${suffix}`;
}

// Shared by AddUserDialog/EditUserDialog — links a user to an already-
// existing agent (see routes/users.js's GET /agents) rather than creating one
// inline; agents are only ever created via My Agents' own "Add Agent"/"Add
// Company" action now. Strictly one or the other, never both at once:
//  - Individual Agent: a real person, 1:1 with a login — every agent already
//    linked to a *different* user (has_user) is left out of the list, except
//    the one currently linked to the user being edited (currentAgentId),
//    which has_user is also true for but must still show up so editing a
//    user without changing their agent doesn't look like the field is empty.
//  - Company Agent: the company/agency's own Agent record — many different
//    Users may share the same one, each logging in separately but all
//    filing/pricing under that one company's own rates (see
//    routes/users.js's own note on this split).
function AgentPickerField({ agents, value, onChange, currentAgentId }) {
  const [linkMode, setLinkMode] = useState(value?.agent_type === "CORPORATE" ? "CORPORATE" : "INDIVIDUAL");

  useEffect(() => {
    if (value) setLinkMode(value.agent_type === "CORPORATE" ? "CORPORATE" : "INDIVIDUAL");
  }, [value]);

  const options = agents.filter((a) => {
    if (a.agent_type !== linkMode) return false;
    return linkMode === "CORPORATE" || !a.has_user || a.id === currentAgentId;
  });

  return (
    <Stack spacing={1}>
      <ToggleButtonGroup
        size="small"
        exclusive
        color="primary"
        value={linkMode}
        onChange={(e, v) => {
          if (!v || v === linkMode) return;
          setLinkMode(v);
          onChange(null);
        }}
      >
        <ToggleButton value="INDIVIDUAL">Individual Agent</ToggleButton>
        <ToggleButton value="CORPORATE">Company Agent</ToggleButton>
      </ToggleButtonGroup>
      <Autocomplete
        options={options}
        getOptionLabel={agentOptionLabel}
        value={value}
        onChange={(e, newValue) => onChange(newValue)}
        isOptionEqualToValue={(o, v) => o.id === v.id}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Agent (optional)"
            helperText={
              linkMode === "CORPORATE"
                ? "Shares this company's own rates — multiple logins may share the same company agent."
                : "Connects this login to an existing individual agent, priced at their own or inherited rates."
            }
          />
        )}
      />
    </Stack>
  );
}

function AddUserDialog({ open, onClose, roles, permissions, agents, token, onCreated }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [permissionIds, setPermissionIds] = useState([]);
  const [agent, setAgent] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  function reset() {
    setEmail("");
    setFirstName("");
    setLastName("");
    setRoleId("");
    setPermissionIds([]);
    setAgent(null);
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
        agent_id: agent?.id,
      });
      setInviteLink(result.inviteLink);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Closing (Cancel/X/backdrop) never discards the in-progress draft — only
  // clicking "Done" after a successful create does. See CLAUDE.md's
  // unsaved-changes convention.
  function handleClose() {
    onClose();
  }

  function handleDone() {
    reset();
    onClose();
  }

  const isDirty =
    open &&
    !inviteLink &&
    (email !== "" ||
      firstName !== "" ||
      lastName !== "" ||
      roleId !== "" ||
      permissionIds.length > 0 ||
      agent !== null);
  useUnsavedChanges("add-user-dialog", isDirty);

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" keepMounted>
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
            <Button onClick={handleDone} variant="contained">
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

              <AgentPickerField agents={agents} value={agent} onChange={setAgent} />

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

function EditUserDialog({ open, onClose, user, roles, permissions, agents, token, onSaved }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [roleId, setRoleId] = useState("");
  const [permissionIds, setPermissionIds] = useState([]);
  const [resetPassword, setResetPassword] = useState(false);
  const [agent, setAgent] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  // Snapshot of the form right after it's populated from `user` — dirty
  // tracking diffs against this rather than re-deriving from `user` on every
  // render, so it stays stable while the agent picker's own `agents` list
  // reloads in the background. This effect is keyed on the `user` prop
  // object itself (not e.g. `user.id`) — the parent only ever hands this a
  // new object when a genuinely different user is opened for editing (see
  // ManageUsers' own split editUserOpen/editingUser state below), so
  // reopening the SAME user after a Cancel/X/backdrop close doesn't re-fire
  // this and clobber the in-progress draft.
  const [originalSnapshot, setOriginalSnapshot] = useState(null);

  useEffect(() => {
    if (user) {
      const resolvedStatus = user.status === "AWAITING_EMAIL_VERIFICATION" ? "ACTIVE" : user.status;
      const resolvedRoleId = user.roles[0]?.id || "";
      // specialPermissions can include a hidden page-access permission that was
      // auto-granted alongside a real one — drop it here so it isn't silently
      // carried forward once its last visible sibling gets unchecked.
      const selectableIds = new Set(permissions.map((p) => p.id));
      const resolvedPermissionIds = user.specialPermissions.map((p) => p.id).filter((id) => selectableIds.has(id));
      // Prefer the matching row from `agents` (it may carry a company_name
      // suffix the label wants) — fall back to a minimal option built from
      // the user's own embedded agent if it's missing there (e.g. an
      // INACTIVE agent, which GET /users/agents excludes).
      const resolvedAgent = user.agent
        ? agents.find((a) => a.id === user.agent.id) || { ...user.agent, has_user: true, company_name: null }
        : null;

      setFullName(user.full_name);
      setEmail(user.email);
      setStatus(resolvedStatus);
      setRoleId(resolvedRoleId);
      setPermissionIds(resolvedPermissionIds);
      setResetPassword(false);
      setAgent(resolvedAgent);
      setError("");
      setInviteLink("");
      setOriginalSnapshot({
        fullName: user.full_name,
        email: user.email,
        status: resolvedStatus,
        roleId: resolvedRoleId,
        permissionIds: resolvedPermissionIds,
        agentId: resolvedAgent?.id || null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const isDirty =
    open &&
    originalSnapshot &&
    (fullName !== originalSnapshot.fullName ||
      email !== originalSnapshot.email ||
      status !== originalSnapshot.status ||
      roleId !== originalSnapshot.roleId ||
      resetPassword ||
      (agent?.id || null) !== originalSnapshot.agentId ||
      JSON.stringify([...permissionIds].sort()) !== JSON.stringify([...originalSnapshot.permissionIds].sort()));
  useUnsavedChanges("edit-user-dialog", Boolean(isDirty));

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
        agent_id: agent ? agent.id : null,
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" keepMounted>
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

              <AgentPickerField
                agents={agents}
                value={agent}
                onChange={setAgent}
                currentAgentId={user.agent?.id}
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
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  // Split from `editUserOpen` so closing the dialog never loses which user it
  // was open for — EditUserDialog's own [user]-keyed effect is what decides
  // whether to re-populate the form for the (possibly unchanged) user.
  const [editingUser, setEditingUser] = useState(null);
  const [editUserOpen, setEditUserOpen] = useState(false);

  function loadUsers() {
    return listUsers(token).then(setUsers);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadUsers(),
      listRoles(token).then(setRoles),
      listPermissions(token).then(setPermissions),
      listAgentsForUserLink(token).then(setAgents),
    ])
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
                    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                      {u.roles.map((r) => (
                        <Chip key={r.id} label={r.role_name} size="small" />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
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
                    <IconButton
                      size="small"
                      onClick={() => {
                        setEditingUser(u);
                        setEditUserOpen(true);
                      }}
                      title="Edit user"
                    >
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
        agents={agents}
        token={token}
        onCreated={() => {
          loadUsers();
          listAgentsForUserLink(token).then(setAgents);
        }}
      />

      <EditUserDialog
        open={editUserOpen}
        onClose={() => setEditUserOpen(false)}
        user={editingUser}
        roles={roles}
        agents={agents}
        permissions={permissions}
        token={token}
        onSaved={() => {
          loadUsers();
          listAgentsForUserLink(token).then(setAgents);
        }}
      />
    </Container>
  );
}
