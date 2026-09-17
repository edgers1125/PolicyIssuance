import { useNavigate } from "react-router-dom";
import { Container, Typography, Paper, List, ListItemButton, ListItemText, ListItemIcon, Divider, Box } from "@mui/material";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import AddModeratorIcon from "@mui/icons-material/AddModerator";
import PaymentsIcon from "@mui/icons-material/Payments";
import CategoryIcon from "@mui/icons-material/Category";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

// Grouped into submenus — each group is its own Paper/List, same
// "navigation hub" pattern as before, just organized by the permission area
// the links inside it fall under (Roles and Permissions, Products and
// Pricing, Payment Methods) rather than one flat list.
const settingsGroups = [
  {
    title: "Roles and Permissions",
    links: [
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
    ],
  },
  {
    title: "Products and Pricing",
    links: [
      {
        label: "Manage Products",
        description:
          "Create, edit, or remove insurance classes, product variants, and coverages — including rates, pricing, clauses, and allowable coverage periods",
        path: "/settings/manage-products",
        icon: CategoryIcon,
      },
    ],
  },
  {
    title: "Payment Methods",
    links: [
      {
        label: "Authorized Payment Methods",
        description: "Add or remove which payment methods Bethel accepts directly",
        path: "/settings/payment-methods",
        icon: PaymentsIcon,
      },
    ],
  },
];

export function Settings() {
  const navigate = useNavigate();

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 700 }}>
        Settings
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {settingsGroups.map((group) => (
          <Box key={group.title}>
            <Typography variant="overline" color="text.secondary" sx={{ ml: 1, fontWeight: 700 }}>
              {group.title}
            </Typography>
            <Paper sx={{ borderRadius: 3, overflow: "hidden", mt: 0.5 }}>
              <List disablePadding>
                {group.links.map(({ label, description, path, icon: Icon }, index) => (
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
          </Box>
        ))}
      </Box>
    </Container>
  );
}
