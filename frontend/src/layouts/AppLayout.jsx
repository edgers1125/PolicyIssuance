import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  AppBar,
  Toolbar,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutIcon from "@mui/icons-material/Logout";
import { BrandMark } from "../components/BrandMark";
import { useAuth } from "../context/AuthContext";
import { useNavigationGuard } from "../context/UnsavedChangesContext";
import { navItems } from "../nav/navItems";

const DRAWER_WIDTH = 224;
const DRAWER_WIDTH_COLLAPSED = 60;

export function AppLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const { logout, permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const confirmNavigation = useNavigationGuard();

  // While permissions are still loading, show only the items that don't need
  // one at all, so nothing the user lacks access to flashes on screen first.
  // item.permission is either one code or an array (holding ANY one is
  // enough) — see RequirePermission.jsx's own note on why (e.g. Approvals'
  // two independently-gated tabs).
  const visibleNavItems = navItems.filter((item) => {
    if (!item.permission) return true;
    if (!permissions) return false;
    const required = Array.isArray(item.permission) ? item.permission : [item.permission];
    return required.some((p) => permissions.includes(p));
  });

  function toggleDrawer() {
    if (isMobile) {
      setMobileOpen((v) => !v);
    } else {
      setDesktopOpen((v) => !v);
    }
  }

  function handleLogout() {
    if (!confirmNavigation()) return;
    logout();
    navigate("/login");
  }

  function renderNavList(showLabels) {
    return (
      <Box sx={{ overflowX: "hidden", height: "100%" }}>
        <Toolbar />
        <List sx={{ px: showLabels ? 1 : 0.75, py: 1.5 }}>
          {visibleNavItems.map(({ label, path, icon: Icon }) => {
            const selected = location.pathname === path;
            const button = (
              <ListItemButton
                key={path}
                selected={selected}
                onClick={() => {
                  if (selected) return;
                  if (!confirmNavigation()) return;
                  navigate(path);
                  if (isMobile) setMobileOpen(false);
                }}
                sx={{
                  borderRadius: 1.5,
                  mb: 0.25,
                  minHeight: 38,
                  justifyContent: showLabels ? "flex-start" : "center",
                  px: showLabels ? 1.5 : 1,
                  color: "rgba(255,255,255,0.72)",
                  borderLeft: "3px solid transparent",
                  "&:hover": {
                    bgcolor: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.92)",
                  },
                  "&.Mui-selected": {
                    bgcolor: "rgba(224,147,46,0.16)",
                    borderLeft: "3px solid",
                    borderLeftColor: "secondary.main",
                  },
                  "&.Mui-selected:hover": {
                    bgcolor: "rgba(224,147,46,0.22)",
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: showLabels ? 32 : 0,
                    color: selected ? "secondary.main" : "inherit",
                    justifyContent: "center",
                    "& svg": { fontSize: "1.2rem" },
                  }}
                >
                  <Icon />
                </ListItemIcon>
                {showLabels && (
                  <ListItemText
                    primary={label}
                    slotProps={{
                      primary: {
                        sx: {
                          fontSize: "0.85rem",
                          fontWeight: selected ? 700 : 500,
                          color: selected ? "common.white" : "inherit",
                          whiteSpace: "nowrap",
                        },
                      },
                    }}
                  />
                )}
              </ListItemButton>
            );

            return showLabels ? (
              button
            ) : (
              <Tooltip key={path} title={label} placement="right">
                {button}
              </Tooltip>
            );
          })}
        </List>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        color="primary"
        elevation={0}
        sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}
      >
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton color="inherit" edge="start" onClick={toggleDrawer}>
              <MenuIcon />
            </IconButton>
            <Box sx={{ "& .MuiTypography-root": { color: "common.white" } }}>
              <BrandMark size="small" monochrome />
            </Box>
          </Box>
          <IconButton color="inherit" onClick={handleLogout} title="Log out">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Mobile: overlay drawer, closed by default */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: "block", md: "none" } }}
        slotProps={{
          paper: {
            sx: {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              bgcolor: "primary.dark",
              borderRight: "none",
            },
          },
        }}
      >
        {renderNavList(true)}
      </Drawer>

      {/* Desktop: plain fixed-position sidebar, collapsible between full and icon-only width.
          Not using MUI's Drawer here — its "permanent" variant renders the Paper as
          position:fixed with its own internal width handling that fought every attempt
          to override it dynamically (sx nesting and slotProps both lost that battle). */}
      <Box
        component="nav"
        sx={{
          display: { xs: "none", md: "block" },
          flexShrink: 0,
          width: desktopOpen ? DRAWER_WIDTH : DRAWER_WIDTH_COLLAPSED,
          transition: theme.transitions.create("width", {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            height: "100vh",
            width: desktopOpen ? DRAWER_WIDTH : DRAWER_WIDTH_COLLAPSED,
            bgcolor: "primary.dark",
            overflowX: "hidden",
            boxShadow: "1px 0 0 rgba(0,0,0,0.08)",
            transition: theme.transitions.create("width", {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          }}
        >
          {renderNavList(desktopOpen)}
        </Box>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: "background.default",
          minHeight: "100vh",
          width: {
            xs: "100%",
            md: `calc(100% - ${desktopOpen ? DRAWER_WIDTH : DRAWER_WIDTH_COLLAPSED}px)`,
          },
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
