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
import { navItems } from "../nav/navItems";

const DRAWER_WIDTH = 260;
const DRAWER_WIDTH_COLLAPSED = 72;

export function AppLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const { logout, permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // While permissions are still loading, show only the items that don't need
  // one at all, so nothing the user lacks access to flashes on screen first.
  const visibleNavItems = navItems.filter(
    (item) => !item.permission || (permissions && permissions.includes(item.permission))
  );

  function toggleDrawer() {
    if (isMobile) {
      setMobileOpen((v) => !v);
    } else {
      setDesktopOpen((v) => !v);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function renderNavList(showLabels) {
    return (
      <Box sx={{ overflowX: "hidden" }}>
        <Toolbar />
        <List sx={{ px: showLabels ? 1 : 0.5, py: 1 }}>
          {visibleNavItems.map(({ label, path, icon: Icon }) => {
            const selected = location.pathname === path;
            const button = (
              <ListItemButton
                key={path}
                selected={selected}
                onClick={() => {
                  navigate(path);
                  if (isMobile) setMobileOpen(false);
                }}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  justifyContent: showLabels ? "flex-start" : "center",
                  px: showLabels ? 2 : 1,
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: showLabels ? 40 : 0,
                    color: selected ? "primary.main" : "inherit",
                    justifyContent: "center",
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
                          fontWeight: selected ? 700 : 400,
                          color: selected ? "primary.main" : "inherit",
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
              <BrandMark size="small" />
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
          paper: { sx: { width: DRAWER_WIDTH, boxSizing: "border-box" } },
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
            bgcolor: "background.paper",
            borderRight: 1,
            borderColor: "divider",
            overflowX: "hidden",
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
