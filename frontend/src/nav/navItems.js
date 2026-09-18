import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import ListAltIcon from "@mui/icons-material/ListAlt";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import GroupsIcon from "@mui/icons-material/Groups";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import SettingsIcon from "@mui/icons-material/Settings";

// permission: null means every logged-in user can see it (no page-access gate).
// Everything else names the page-access permission that page requires.
//
// Labels/order below are the sidebar's own presentation layer only — path,
// icon, permission, and every route/permission-gating elsewhere in the app
// (App.jsx's route table, RequirePermission, each page's own component name)
// are untouched, so this is a rename+reorder, not a restructuring.
export const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: DashboardIcon, permission: null },
  {
    label: "Quotations",
    path: "/quotation-tracker",
    icon: RequestQuoteIcon,
    permission: "QUOTATION_TRACKER",
  },
  {
    label: "Policy Issuance",
    path: "/policy-application",
    icon: AssignmentIcon,
    // Either permission admits the page — PolicyApplications.jsx itself
    // picks which of the two views to render (the approver's cross-agent
    // queue + "New Admin Application", or an agent's own tracker + "New
    // Application") based on which one the caller actually holds; a caller
    // is expected to hold only one of the two in practice.
    permission: ["CREATE_APPLICATION", "APPROVE_APPLICATION"],
  },
  { label: "My Clients", path: "/my-policies", icon: ListAltIcon, permission: "VIEW_POLICIES" },
  {
    label: "Endorsements",
    path: "/endorsements",
    icon: FactCheckIcon,
    // Either permission admits the page — an ordinary approver
    // (APPROVE_ENDORSEMENT) sees the review queue; an admin
    // (VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT) additionally/instead sees the
    // "New Admin Endorsement" policy-search action, see Endorsements.jsx.
    permission: ["APPROVE_ENDORSEMENT", "VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT"],
  },
  {
    label: "In-Lease",
    path: "/inlease-backlogs",
    icon: PendingActionsIcon,
    permission: "MANAGE_INLEASE",
  },
  { label: "Agents", path: "/my-agents", icon: GroupsIcon, permission: "MANAGE_AGENTS" },
  {
    label: "Accounting",
    path: "/accounting",
    icon: AccountBalanceWalletIcon,
    permission: "MANAGE_ACCOUNTING",
  },
  {
    label: "Users",
    path: "/manage-users",
    icon: ManageAccountsIcon,
    permission: "MANAGE_USERS",
  },
  { label: "Settings", path: "/settings", icon: SettingsIcon, permission: "MANAGE_SETTINGS" },
];
