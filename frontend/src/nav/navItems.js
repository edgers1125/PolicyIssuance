import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import ListAltIcon from "@mui/icons-material/ListAlt";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import GroupsIcon from "@mui/icons-material/Groups";
import SettingsIcon from "@mui/icons-material/Settings";

// permission: null means every logged-in user can see it (no page-access gate).
// Everything else names the page-access permission that page requires.
export const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: DashboardIcon, permission: null },
  {
    label: "Policy Application",
    path: "/policy-application",
    icon: AssignmentIcon,
    permission: "CREATE_APPLICATION",
  },
  { label: "Client Policies", path: "/my-policies", icon: ListAltIcon, permission: "VIEW_POLICIES" },
  {
    label: "Quotation Tracker",
    path: "/quotation-tracker",
    icon: RequestQuoteIcon,
    permission: "QUOTATION_TRACKER",
  },
  {
    label: "In-Lease Backlogs",
    path: "/inlease-backlogs",
    icon: PendingActionsIcon,
    permission: "MANAGE_INLEASE",
  },
  {
    label: "Policy Approval",
    path: "/policy-approval",
    icon: FactCheckIcon,
    permission: "APPROVE_APPLICATION",
  },
  {
    label: "Manage Users",
    path: "/manage-users",
    icon: ManageAccountsIcon,
    permission: "MANAGE_USERS",
  },
  { label: "My Agents", path: "/my-agents", icon: GroupsIcon, permission: "MANAGE_AGENTS" },
  { label: "Settings", path: "/settings", icon: SettingsIcon, permission: "MANAGE_SETTINGS" },
];
