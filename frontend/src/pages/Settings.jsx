import { useNavigate } from "react-router-dom";
import { Container, Typography, Paper, List, ListItemButton, ListItemText, ListItemIcon, Divider } from "@mui/material";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import AddModeratorIcon from "@mui/icons-material/AddModerator";
import GavelIcon from "@mui/icons-material/Gavel";
import PaymentsIcon from "@mui/icons-material/Payments";
import PriceChangeIcon from "@mui/icons-material/PriceChange";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
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
  {
    label: "Edit Clauses",
    description: "Edit the legal clause text attached to each coverage",
    path: "/settings/edit-clauses",
    icon: GavelIcon,
  },
  {
    label: "Authorized Payment Methods",
    description: "Add or remove which payment methods Bethel accepts directly",
    path: "/settings/payment-methods",
    icon: PaymentsIcon,
  },
  {
    label: "Manage Coverage Pricing",
    description: "Choose how a coverage is priced, its maximum coverage, and its value/tier pricing tables",
    path: "/settings/coverage-pricing",
    icon: PriceChangeIcon,
  },
  {
    label: "Vehicle Rates",
    description: "Set each product variant's deductible and authorized repair limit rates",
    path: "/settings/vehicle-rates",
    icon: DirectionsCarIcon,
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
