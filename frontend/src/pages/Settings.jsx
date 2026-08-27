import { useNavigate } from "react-router-dom";
import { Container, Typography, Paper, List, ListItemButton, ListItemText, ListItemIcon, Divider } from "@mui/material";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import AddModeratorIcon from "@mui/icons-material/AddModerator";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

const settingsLinks = [
  {
    label: "Edit Default Role Permissions",
    description: "Choose which permissions each role grants by default",
    path: "/settings/role-permissions",
    icon: AdminPanelSettingsIcon,
  },
  {
    label: "Create New Role",
    description: "Create a new role with a chosen set of permissions",
    path: "/settings/create-role",
    icon: AddModeratorIcon,
  },
];

export function Settings() {
  const navigate = useNavigate();

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 700 }}>
        Settings
      </Typography>

      <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
        <List disablePadding>
          {settingsLinks.map(({ label, description, path, icon: Icon }, index) => (
            <div key={path}>
              {index > 0 && <Divider component="li" />}
              <ListItemButton onClick={() => navigate(path)} sx={{ py: 2 }}>
                <ListItemIcon>
                  <Icon color="primary" />
                </ListItemIcon>
                <ListItemText primary={label} secondary={description} />
                <ChevronRightIcon color="disabled" />
              </ListItemButton>
            </div>
          ))}
        </List>
      </Paper>
    </Container>
  );
}
